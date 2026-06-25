import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { damageReportRevisions, users } from "../db/schema.js";

/**
 * Этап 2 — версионность + защита от подделки акта о повреждениях.
 *
 * Каждая правка акта = новая НЕИЗМЕНЯЕМАЯ ревизия (снимок позиций/сумм/согласия/
 * автора). Ревизии связаны хэш-цепочкой: contentHash = SHA-256(каноника + prevHash).
 * Подменить или удалить старую ревизию даже в БД → цепочка рвётся → проверка
 * целостности это ловит и показывает директору.
 */

export type RevisionItem = {
  name: string;
  originalPrice: number;
  finalPrice: number;
  quantity: number;
  comment: string | null;
  priceItemId: number | null;
};

export type RevisionContent = {
  revisionNo: number;
  total: number;
  depositCovered: number;
  note: string | null;
  clientAgreement: string;
  items: RevisionItem[];
};

/** Каноническая (стабильная по порядку ключей) сериализация для хэша. */
function canonical(c: RevisionContent): string {
  return JSON.stringify({
    revisionNo: c.revisionNo,
    total: c.total,
    depositCovered: c.depositCovered,
    note: c.note ?? "",
    clientAgreement: c.clientAgreement,
    items: c.items.map((i) => ({
      name: i.name,
      originalPrice: i.originalPrice,
      finalPrice: i.finalPrice,
      quantity: i.quantity,
      comment: i.comment ?? "",
      priceItemId: i.priceItemId ?? null,
    })),
  });
}

/** SHA-256(canonical(content) + prevHash) — звено хэш-цепочки. */
export function computeContentHash(
  content: RevisionContent,
  prevHash: string | null,
): string {
  return createHash("sha256")
    .update(canonical(content) + "|" + (prevHash ?? ""))
    .digest("hex");
}

/**
 * Пишет новую ревизию (иммутабельный снимок) с хэшем, связанным с предыдущей.
 * Возвращает contentHash — его кладут в damage_reports.content_hash как head.
 * Имя автора снимаем из users (переживает удаление пользователя).
 */
export async function writeDamageRevision(input: {
  reportId: number;
  content: RevisionContent;
  editedByUserId: number | null;
  prevHash: string | null;
}): Promise<string> {
  let editedByUserName: string | null = null;
  if (input.editedByUserId != null) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, input.editedByUserId));
    editedByUserName = u?.name ?? null;
  }
  const contentHash = computeContentHash(input.content, input.prevHash);
  await db.insert(damageReportRevisions).values({
    reportId: input.reportId,
    revisionNo: input.content.revisionNo,
    total: input.content.total,
    depositCovered: input.content.depositCovered,
    note: input.content.note,
    itemsJson: input.content.items,
    clientAgreement: input.content.clientAgreement,
    editedByUserId: input.editedByUserId,
    editedByUserName,
    prevHash: input.prevHash,
    contentHash,
  });
  return contentHash;
}

/**
 * Проверяет целостность цепочки ревизий: пересчитывает хэши и сверяет звенья.
 * Возвращает номер первой нарушенной ревизии (или null, если цепочка цела).
 */
export function verifyRevisionChain(
  revisions: Array<{
    revisionNo: number;
    total: number;
    depositCovered: number;
    note: string | null;
    clientAgreement: string;
    itemsJson: unknown;
    prevHash: string | null;
    contentHash: string;
  }>,
): { ok: boolean; brokenAt: number | null } {
  const sorted = [...revisions].sort((a, b) => a.revisionNo - b.revisionNo);
  let prev: string | null = null;
  for (const r of sorted) {
    const expected = computeContentHash(
      {
        revisionNo: r.revisionNo,
        total: r.total,
        depositCovered: r.depositCovered,
        note: r.note,
        clientAgreement: r.clientAgreement,
        items: (r.itemsJson as RevisionItem[]) ?? [],
      },
      prev,
    );
    if (r.prevHash !== prev || r.contentHash !== expected) {
      return { ok: false, brokenAt: r.revisionNo };
    }
    prev = r.contentHash;
  }
  return { ok: true, brokenAt: null };
}
