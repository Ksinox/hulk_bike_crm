import type {
  FastifyInstance,
  FastifyRequest,
  FastifyBaseLogger,
} from "fastify";
import { eq, asc, and, sum, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  damageReports,
  damageReportItems,
  damageReportMedia,
  payments,
  rentals,
  scooters,
  users,
} from "../db/schema.js";
import { makeFileKey, removeObject, putObject } from "../storage/index.js";
import { putObjectWithImageVariants } from "../storage/image.js";
import { transcodeVideo } from "../storage/video.js";
import { logActivity } from "../services/activityLog.js";
import {
  loadDamageBundle,
  renderDamageHtml,
  renderDamageHtmlForWord,
} from "../documents/damage-document.js";
import {
  loadClaimBundle,
  renderClaimHtml,
  renderClaimHtmlForWord,
} from "../documents/claim-document.js";
import { ensureRepairJobForScooter } from "./repair-jobs.js";

/**
 * Синхронизирует «зачёт залога в счёт ущерба» (deposit_forfeit) с текущим
 * depositCovered акта. Платёж нужен ТОЛЬКО для учёта выручки: удержанный залог
 * перестаёт быть возвратным и становится доходом. На расчёт долга НЕ влияет
 * (долг = total − depositCovered − Σ damage-платежей). Держим ровно один такой
 * платёж на акт, amount = depositCovered; depositCovered=0 → удаляем.
 */
async function syncDepositForfeit(
  rentalId: number,
  damageReportId: number,
  depositCovered: number,
  paidAt: Date,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.damageReportId, damageReportId),
        eq(payments.type, "deposit_forfeit"),
      ),
    );
  if (depositCovered > 0) {
    if (existing) {
      if (existing.amount !== depositCovered) {
        await db
          .update(payments)
          .set({ amount: depositCovered })
          .where(eq(payments.id, existing.id));
      }
    } else {
      await db.insert(payments).values({
        rentalId,
        type: "deposit_forfeit",
        amount: depositCovered,
        method: "deposit",
        paid: true,
        paidAt,
        note: "Зачёт залога в счёт ущерба",
        damageReportId,
      });
    }
  } else if (existing) {
    await db.delete(payments).where(eq(payments.id, existing.id));
  }
}

/**
 * Акты о повреждениях.
 *
 * Бизнес-логика:
 *  - При создании акта статус аренды НЕ меняется — она остаётся active,
 *    долг по ущербу живёт отдельно. Скутер (по флагу) уходит в repair.
 *  - Долг = total - depositCovered - SUM(payments[type=damage, paid=true]).
 *  - Платёж по акту — отдельный POST, авто-проставляет receivedByUserId
 *    из req.user.userId.
 */

const ItemInput = z.object({
  priceItemId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(200),
  originalPrice: z.number().int().min(0),
  finalPrice: z.number().int().min(0),
  quantity: z.number().int().min(1).default(1),
  comment: z.string().max(500).nullable().optional(),
});

const CreateBody = z.object({
  rentalId: z.number().int().positive(),
  depositCovered: z.number().int().min(0).default(0),
  note: z.string().max(2000).nullable().optional(),
  sendScooterToRepair: z.boolean().default(false),
  items: z.array(ItemInput).min(1),
});

const PatchBody = z.object({
  depositCovered: z.number().int().min(0).optional(),
  note: z.string().max(2000).nullable().optional(),
  items: z.array(ItemInput).optional(),
});

const PaymentBody = z.object({
  amount: z.number().int().positive(),
  note: z.string().max(500).nullable().optional(),
  /** Метод оплаты: cash / card / transfer */
  method: z.enum(["cash", "card", "transfer"]).default("cash"),
});

function getUserId(req: FastifyRequest): number | null {
  const u = (req as unknown as { user?: { userId?: number } }).user;
  return u?.userId ?? null;
}

async function loadReportFull(reportId: number) {
  const [report] = await db
    .select()
    .from(damageReports)
    .where(eq(damageReports.id, reportId));
  if (!report) return null;
  const items = await db
    .select()
    .from(damageReportItems)
    .where(eq(damageReportItems.reportId, reportId))
    .orderBy(asc(damageReportItems.sortOrder), asc(damageReportItems.id));
  const media = await db
    .select()
    .from(damageReportMedia)
    .where(eq(damageReportMedia.reportId, reportId))
    .orderBy(asc(damageReportMedia.id));
  const pays = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.damageReportId, reportId), eq(payments.type, "damage")),
    )
    .orderBy(asc(payments.paidAt), asc(payments.id));
  const paidSum = pays
    .filter((p) => p.paid)
    .reduce((s, p) => s + p.amount, 0);
  const debt = Math.max(0, report.total - report.depositCovered - paidSum);
  // Дополним именами «принявшего платёж».
  const userIds = Array.from(
    new Set(pays.map((p) => p.receivedByUserId).filter((x): x is number => !!x)),
  );
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.name]));
  const paysWithUser = pays.map((p) => ({
    ...p,
    receivedByName: p.receivedByUserId
      ? userMap.get(p.receivedByUserId) ?? null
      : null,
  }));
  return {
    ...report,
    items,
    media,
    payments: paysWithUser,
    paidSum,
    debt,
  };
}

/** Лимит на загружаемый файл: фото/видео повреждений. Видео большие. */
const MAX_DAMAGE_MEDIA_SIZE = 120 * 1024 * 1024; // 120 MB

/** Допустимые типы медиа повреждений: изображения и видео. */
function mediaKindFromMime(mime: string): "photo" | "video" | null {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  return null;
}

export async function damageReportsRoutes(app: FastifyInstance) {
  /**
   * Список актов. Если задан rentalId — только по этой аренде. Без
   * параметра — все акты в системе (для дашборда: чтобы понять у каких
   * аренд есть открытый долг по ущербу и подсветить плитки парка).
   */
  app.get<{ Querystring: { rentalId?: string } }>("/", async (req) => {
    const rentalIdRaw = req.query.rentalId;
    const rentalId = rentalIdRaw ? Number(rentalIdRaw) : null;
    const rows =
      rentalId && Number.isFinite(rentalId) && rentalId > 0
        ? await db
            .select()
            .from(damageReports)
            .where(eq(damageReports.rentalId, rentalId))
            .orderBy(asc(damageReports.createdAt), asc(damageReports.id))
        : await db
            .select()
            .from(damageReports)
            .orderBy(asc(damageReports.createdAt), asc(damageReports.id));
    const full = await Promise.all(rows.map((r) => loadReportFull(r.id)));
    return { items: full.filter(Boolean) };
  });

  /** Один акт. */
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const r = await loadReportFull(id);
    if (!r) return reply.code(404).send({ error: "not found" });
    return r;
  });

  /** Создать акт. */
  app.post("/", async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const { rentalId, items, depositCovered, note, sendScooterToRepair } =
      parsed.data;
    // Грузим аренду — нужен скутер и залог.
    const [rental] = await db
      .select()
      .from(rentals)
      .where(eq(rentals.id, rentalId));
    if (!rental) return reply.code(404).send({ error: "rental not found" });
    // Считаем итог.
    const total = items.reduce(
      (s, it) => s + it.finalPrice * it.quantity,
      0,
    );
    const cappedDeposit = Math.min(
      depositCovered ?? 0,
      total,
      rental.deposit ?? 0,
    );
    const userId = getUserId(req);
    const [report] = await db
      .insert(damageReports)
      .values({
        rentalId,
        createdByUserId: userId,
        total,
        depositCovered: cappedDeposit,
        note: note ?? null,
      })
      .returning();
    // v0.4.97: единый счёт залога. Если при создании акта часть ущерба
    // покрыта из залога (cappedDeposit > 0) — реально списываем эту
    // сумму с rental.deposit. До этой версии rental.deposit оставался
    // нетронутым, и UI расходился: плашка считала «списано» из
    // depositOriginal − deposit, а KPI-хинт смотрел в payments.method='deposit'.
    // Теперь любая операция, которая уменьшает залог, обязана уменьшить
    // именно rental.deposit — это единственная «правда» по текущему остатку.
    if (cappedDeposit > 0) {
      await db
        .update(rentals)
        .set({
          deposit: Math.max(0, (rental.deposit ?? 0) - cappedDeposit),
        })
        .where(eq(rentals.id, rentalId));
    }
    // Удержанный залог → платёж deposit_forfeit (учёт выручки, не долг).
    await syncDepositForfeit(
      rentalId,
      report!.id,
      cappedDeposit,
      report!.createdAt ?? new Date(),
    );
    if (items.length > 0) {
      await db.insert(damageReportItems).values(
        items.map((it, i) => ({
          reportId: report!.id,
          priceItemId: it.priceItemId ?? null,
          name: it.name,
          originalPrice: it.originalPrice,
          finalPrice: it.finalPrice,
          quantity: it.quantity,
          comment: it.comment ?? null,
          sortOrder: i,
        })),
      );
    }
    // v0.2.75: статус аренды НЕ меняем при создании акта.
    // Реакция клиента (agreed/disputed) проставляется отдельным endpoint
    // /:id/agreement, и только при 'disputed' аренда уходит в 'problem'.
    // Скутер — в ремонт (если флаг и есть скутер). Дополнительно
    // открываем (или находим существующий) repair_job и наполняем его
    // чек-листом из позиций акта — оператор увидит их в разделе «Ремонты».
    if (sendScooterToRepair && rental.scooterId) {
      await db
        .update(scooters)
        .set({ baseStatus: "repair" })
        .where(eq(scooters.id, rental.scooterId));
      try {
        await ensureRepairJobForScooter({
          scooterId: rental.scooterId,
          rentalId: rental.id,
          damageReportId: report!.id,
          createdByUserId: userId,
        });
      } catch (e) {
        // Не валим создание акта если что-то с ремонтом не так — это
        // вспомогательная запись, можно создать вручную через API.
        req.log?.warn?.({ err: e }, "ensureRepairJobForScooter failed");
      }
    }
    // Если залог зачли — фиксируем это «возвратом залога» (отрицательным
    // движением) — пока просто помечаем deposit_returned=false и пишем в note.
    // (Полноценный учёт возврата залога — отдельный поток.)
    await logActivity(req, {
      entity: "damage_report",
      entityId: report!.id,
      action: "created",
      summary: `Аренда #${String(rentalId).padStart(4, "0")}: акт о повреждениях на ${total} ₽ (${items.length} поз.)`,
      meta: { total, depositCovered: cappedDeposit, items: items.length },
      diff: {
        damage: {
          label: "Ущерб",
          from: 0,
          to: total,
          kind: "money",
        },
        items: {
          label: "Позиции",
          from: [],
          to: items.map((i) => i.name),
          kind: "list",
        },
      },
    });
    return await loadReportFull(report!.id);
  });

  /** Изменить акт (заголовок и/или позиции). */
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const [report] = await db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, id));
    if (!report) return reply.code(404).send({ error: "not found" });
    const next: Partial<typeof damageReports.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.note !== undefined) next.note = parsed.data.note ?? null;
    // v0.4.97: при изменении depositCovered — переносим delta на rental.deposit.
    // delta = (new - old). Если положительная — со счёта залога снимаем
    // дополнительно. Если отрицательная — возвращаем на залог.
    // Кэппим: нельзя уйти в минус по rental.deposit; нельзя поднять
    // deposit выше depositOriginal (если хочется больше — это пополнение
    // через /security-topup).
    let depositDelta = 0;
    if (parsed.data.depositCovered !== undefined) {
      const newCovered = parsed.data.depositCovered;
      const oldCovered = report.depositCovered ?? 0;
      depositDelta = newCovered - oldCovered;
      next.depositCovered = newCovered;
    }
    if (depositDelta !== 0) {
      const [r] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, report.rentalId));
      if (r) {
        const cur = r.deposit ?? 0;
        const original = r.depositOriginal ?? cur;
        // delta > 0: снимаем больше с залога. clamp до cur (не уйдём в минус)
        // delta < 0: возвращаем на залог. clamp до original (не превысим максимум)
        const targetDeposit =
          depositDelta > 0
            ? Math.max(0, cur - depositDelta)
            : Math.min(original, cur + -depositDelta);
        await db
          .update(rentals)
          .set({ deposit: targetDeposit })
          .where(eq(rentals.id, report.rentalId));
      }
    }
    // Если items переданы — заменяем целиком и пересчитываем total.
    if (parsed.data.items) {
      const items = parsed.data.items;
      const total = items.reduce(
        (s, it) => s + it.finalPrice * it.quantity,
        0,
      );
      next.total = total;
      await db
        .delete(damageReportItems)
        .where(eq(damageReportItems.reportId, id));
      if (items.length > 0) {
        await db.insert(damageReportItems).values(
          items.map((it, i) => ({
            reportId: id,
            priceItemId: it.priceItemId ?? null,
            name: it.name,
            originalPrice: it.originalPrice,
            finalPrice: it.finalPrice,
            quantity: it.quantity,
            comment: it.comment ?? null,
            sortOrder: i,
          })),
        );
      }
    }
    await db.update(damageReports).set(next).where(eq(damageReports.id, id));
    // Синхронизируем deposit_forfeit с актуальным depositCovered.
    {
      const effCovered =
        parsed.data.depositCovered !== undefined
          ? parsed.data.depositCovered
          : report.depositCovered ?? 0;
      await syncDepositForfeit(
        report.rentalId,
        id,
        effCovered,
        report.createdAt ?? new Date(),
      );
    }
    await logActivity(req, {
      entity: "damage_report",
      entityId: id,
      action: "updated",
      summary: `Акт о повреждениях #${id} изменён`,
    });
    return await loadReportFull(id);
  });

  /** Внести платёж по акту. Авто-проставляет receivedByUserId. */
  app.post<{ Params: { id: string } }>(
    "/:id/payment",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const parsed = PaymentBody.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const [report] = await db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, id));
      if (!report) return reply.code(404).send({ error: "not found" });
      const userId = getUserId(req);
      const [pay] = await db
        .insert(payments)
        .values({
          rentalId: report.rentalId,
          type: "damage",
          amount: parsed.data.amount,
          method: parsed.data.method,
          paid: true,
          paidAt: new Date(),
          note: parsed.data.note ?? null,
          receivedByUserId: userId,
          damageReportId: id,
        })
        .returning();
      await logActivity(req, {
        entity: "damage_report",
        entityId: id,
        action: "payment",
        summary: `Платёж за ущерб ${parsed.data.amount} ₽ по акту #${id}`,
        meta: {
          paymentId: pay!.id,
          amount: parsed.data.amount,
          method: parsed.data.method,
        },
      });
      return await loadReportFull(id);
    },
  );

  /** Печатная форма акта. format=html (preview) | docx (Word-скачивание). */
  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>("/:id/document", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const bundle = await loadDamageBundle(id);
    if (!bundle) return reply.code(404).send({ error: "not found" });
    const format = req.query.format === "docx" ? "docx" : "html";
    if (format === "html") {
      const html = await renderDamageHtml(bundle);
      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .removeHeader("X-Frame-Options")
        .header(
          "Content-Security-Policy",
          "frame-ancestors 'self' https://crm.hulkbike.ru https://crm.104-128-128-96.sslip.io",
        );
      return reply.send(html);
    }
    const wordHtml = await renderDamageHtmlForWord(bundle);
    const filename = `Акт о повреждениях ${String(id).padStart(4, "0")}.doc`;
    reply
      .header("Content-Type", "application/msword; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    return reply.send(wordHtml);
  });

  /** Досудебная претензия по акту — отдельный документ для случая
   *  когда клиент не согласен с актом. */
  app.get<{
    Params: { id: string };
    Querystring: { format?: string; days?: string };
  }>("/:id/claim", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const bundle = await loadClaimBundle(id);
    if (!bundle) return reply.code(404).send({ error: "not found" });
    // F2: срок добровольной оплаты (дней) задаёт оператор. По умолчанию 21,
    // зажимаем в разумные рамки 1..180.
    const dueDays = (() => {
      const n = Number(req.query.days);
      if (!Number.isFinite(n)) return 21;
      return Math.min(180, Math.max(1, Math.round(n)));
    })();
    const format = req.query.format === "docx" ? "docx" : "html";
    if (format === "html") {
      const html = await renderClaimHtml(bundle, dueDays);
      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .removeHeader("X-Frame-Options")
        .header(
          "Content-Security-Policy",
          "frame-ancestors 'self' https://crm.hulkbike.ru https://crm.104-128-128-96.sslip.io",
        );
      return reply.send(html);
    }
    const wordHtml = await renderClaimHtmlForWord(bundle, dueDays);
    const filename = `Досудебная претензия ${String(id).padStart(4, "0")}.doc`;
    reply
      .header("Content-Type", "application/msword; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    return reply.send(wordHtml);
  });

  /** Удалить акт (cascade на items; платежи остаются как обычные). */
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const [report] = await db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, id));
    if (!report) return reply.code(404).send({ error: "not found" });
    // Проверим — нет ли РЕАЛЬНЫХ платежей (тогда удалять нельзя без отвязки).
    // deposit_forfeit — внутренняя запись зачёта залога (не живые деньги),
    // её из проверки исключаем и снимаем вместе с актом (ниже).
    const sumRows = await db
      .select({
        paidSum: sum(payments.amount),
      })
      .from(payments)
      .where(
        and(
          eq(payments.damageReportId, id),
          ne(payments.type, "deposit_forfeit"),
        ),
      );
    const paidSum = sumRows[0]?.paidSum;
    if (paidSum && Number(paidSum) > 0) {
      return reply.code(409).send({
        error: "has_payments",
        message: "По акту уже есть платежи — удаление заблокировано.",
      });
    }
    // Снимаем зачёт залога: удаляем deposit_forfeit (иначе остался бы
    // «осиротевший» платёж, продолжающий капать в выручку) и возвращаем
    // удержанную сумму обратно на залог аренды.
    if ((report.depositCovered ?? 0) > 0) {
      await syncDepositForfeit(
        report.rentalId,
        id,
        0,
        report.createdAt ?? new Date(),
      );
      const [r] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, report.rentalId));
      if (r) {
        const cur = r.deposit ?? 0;
        const original = r.depositOriginal ?? cur;
        await db
          .update(rentals)
          .set({
            deposit: Math.min(original, cur + (report.depositCovered ?? 0)),
          })
          .where(eq(rentals.id, report.rentalId));
      }
    }
    await db.delete(damageReports).where(eq(damageReports.id, id));
    await logActivity(req, {
      entity: "damage_report",
      entityId: id,
      action: "deleted",
      summary: `Акт о повреждениях #${id} удалён`,
    });
    return reply.code(204).send();
  });

  /**
   * Загрузить фото/видео повреждения к акту. multipart/form-data, поле 'file'.
   * Принимает image/* и video/*. Фото получают thumb/view-варианты, видео —
   * хранится как есть. Оператор делает это прямо при приёмке с телефона.
   */
  app.post<{ Params: { id: string } }>("/:id/media", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [report] = await db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, id));
    if (!report) return reply.code(404).send({ error: "not found" });
    const parts = req.parts({
      limits: { fileSize: MAX_DAMAGE_MEDIA_SIZE, files: 1 },
    });
    let fileBuf: Buffer | null = null;
    let fileName = "media";
    let mimeType = "application/octet-stream";
    let durationSec: number | null = null;
    for await (const part of parts) {
      if (part.type === "file") {
        fileBuf = await part.toBuffer();
        fileName = part.filename;
        mimeType = part.mimetype;
      } else if (part.type === "field" && part.fieldname === "durationSec") {
        const n = Number(part.value);
        if (Number.isFinite(n) && n > 0) durationSec = Math.round(n);
      }
    }
    if (!fileBuf) return reply.code(400).send({ error: "file required" });
    const kind = mediaKindFromMime(mimeType);
    if (!kind) {
      return reply.code(400).send({
        error: "unsupported_media",
        message: "К акту прикладываются только фото и видео.",
      });
    }
    const userId = getUserId(req);

    // ── Фото: как раньше — thumb/view-варианты, сразу ready. ──
    if (kind === "photo") {
      const key = makeFileKey(`damages/${id}`, fileName);
      await putObjectWithImageVariants(key, fileBuf, mimeType);
      const [row] = await db
        .insert(damageReportMedia)
        .values({
          reportId: id,
          kind: "photo",
          fileKey: key,
          fileName,
          mimeType,
          size: fileBuf.length,
          durationSec,
          status: "ready",
          uploadedByUserId: userId,
        })
        .returning();
      await logActivity(req, {
        entity: "damage_report",
        entityId: id,
        action: "media_added",
        summary: `К акту #${id} добавлено фото повреждения`,
        meta: { mediaId: row!.id, kind: "photo" },
      });
      return reply.code(201).send(row);
    }

    // ── Видео: сохраняем оригинал сразу (доступен/скачивается), статус
    // processing; в фоне ffmpeg → H.264 MP4 + обложка, потом подменяем запись.
    // Так запрос не блокируется тяжёлым перекодированием.
    const origKey = makeFileKey(`damages/${id}`, fileName);
    await putObject(origKey, fileBuf, mimeType);
    const [row] = await db
      .insert(damageReportMedia)
      .values({
        reportId: id,
        kind: "video",
        fileKey: origKey,
        fileName,
        mimeType,
        size: fileBuf.length,
        durationSec,
        status: "processing",
        uploadedByUserId: userId,
      })
      .returning();
    await logActivity(req, {
      entity: "damage_report",
      entityId: id,
      action: "media_added",
      summary: `К акту #${id} добавлено видео повреждения`,
      meta: { mediaId: row!.id, kind: "video" },
    });
    void processDamageVideo(app.log, row!.id, id, fileBuf, fileName, origKey);
    return reply.code(201).send(row);
  });

  /** Удалить медиа повреждения (из S3 + БД). */
  app.delete<{ Params: { mediaId: string } }>(
    "/media/:mediaId",
    async (req, reply) => {
      const mediaId = Number(req.params.mediaId);
      if (!Number.isFinite(mediaId))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(damageReportMedia)
        .where(eq(damageReportMedia.id, mediaId));
      if (!row) return reply.code(404).send({ error: "not found" });
      await removeObject(row.fileKey).catch(() => {});
      if (row.posterKey) await removeObject(row.posterKey).catch(() => {});
      await db
        .delete(damageReportMedia)
        .where(eq(damageReportMedia.id, mediaId));
      return reply.code(204).send();
    },
  );
}

/**
 * Фоновое перекодирование видео ущерба: ffmpeg → H.264 MP4 + JPEG-обложка,
 * затем подменяем запись (fileKey → mp4, posterKey, status=ready) и удаляем
 * оригинал. Запускается fire-and-forget после ответа на загрузку. При ошибке
 * оставляем оригинал и помечаем ready (чтобы файл хотя бы был доступен).
 */
async function processDamageVideo(
  log: FastifyBaseLogger,
  mediaId: number,
  reportId: number,
  buf: Buffer,
  fileName: string,
  origKey: string,
): Promise<void> {
  try {
    const { mp4, poster } = await transcodeVideo(buf, fileName);
    const base = fileName.replace(/\.[^.]+$/, "") || "video";
    const mp4Key = makeFileKey(`damages/${reportId}`, `${base}.mp4`);
    await putObject(mp4Key, mp4, "video/mp4");
    let posterKey: string | null = null;
    if (poster) {
      posterKey = makeFileKey(`damages/${reportId}`, `${base}.jpg`);
      // putObjectWithImageVariants — обложке тоже сделает thumb/view.
      await putObjectWithImageVariants(posterKey, poster, "image/jpeg");
    }
    await db
      .update(damageReportMedia)
      .set({
        fileKey: mp4Key,
        posterKey,
        mimeType: "video/mp4",
        size: mp4.length,
        status: "ready",
      })
      .where(eq(damageReportMedia.id, mediaId));
    await removeObject(origKey).catch(() => {});
    log.info({ mediaId, reportId }, "damage video transcoded");
  } catch (e) {
    log.error({ err: e, mediaId }, "damage video transcode failed");
    // Не удалось перекодировать — оставляем оригинал, помечаем ready
    // (хотя бы скачать/открыть нативно можно).
    await db
      .update(damageReportMedia)
      .set({ status: "ready" })
      .where(eq(damageReportMedia.id, mediaId))
      .catch(() => {});
  }
}
