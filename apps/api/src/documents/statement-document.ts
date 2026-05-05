/**
 * Финансовая выписка по клиенту — печатная форма для судебных
 * разбирательств / претензий / внутренней отчётности.
 *
 * Содержит:
 *  - реквизиты клиента
 *  - список всех аренд (период, скутер, сумма, статус)
 *  - все платежи по этим арендам (дата, тип, сумма, кто принял, комментарий)
 *  - акты о повреждениях с историей частичных оплат и остатком долга
 *  - сводный итог: всего начислено / получено / остаток к доплате
 *
 * GET /api/clients/:id/statement?format=html|docx
 */
import { eq, inArray, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  damageReportItems,
  damageReports,
  payments,
  rentals,
  scooterModels,
  scooters,
  users,
} from "../db/schema.js";
import { LANDLORD } from "./landlord.js";

type PaymentRow = typeof payments.$inferSelect & {
  receivedByName: string | null;
};
type RentalRow = typeof rentals.$inferSelect & {
  scooterName: string | null;
  modelName: string | null;
  paymentsForRental: PaymentRow[];
};
type DamageRow = typeof damageReports.$inferSelect & {
  rentalNo: string;
  items: (typeof damageReportItems.$inferSelect)[];
  paymentsForReport: PaymentRow[];
  paidSum: number;
  debt: number;
};

type StatementBundle = {
  client: typeof clients.$inferSelect;
  rentals: RentalRow[];
  damageReports: DamageRow[];
};

const PAYMENT_TYPE_RU: Record<string, string> = {
  rent: "Аренда",
  deposit: "Залог",
  fine: "Штраф",
  damage: "Ущерб",
  refund: "Возврат",
};
const PAYMENT_METHOD_RU: Record<string, string> = {
  cash: "наличные",
  card: "карта",
  transfer: "перевод",
  deposit: "из залога/депозита",
};

export async function loadStatementBundle(
  clientId: number,
): Promise<StatementBundle | null> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return null;
  const rentalRows = await db
    .select()
    .from(rentals)
    .where(eq(rentals.clientId, clientId))
    .orderBy(asc(rentals.startAt), asc(rentals.id));
  const rentalIds = rentalRows.map((r) => r.id);

  // Скутеры и модели
  const scooterIds = Array.from(
    new Set(rentalRows.map((r) => r.scooterId).filter((x): x is number => !!x)),
  );
  const scooterRows = scooterIds.length
    ? await db.select().from(scooters).where(inArray(scooters.id, scooterIds))
    : [];
  const modelIds = Array.from(
    new Set(scooterRows.map((s) => s.modelId).filter((x): x is number => !!x)),
  );
  const modelRows = modelIds.length
    ? await db
        .select()
        .from(scooterModels)
        .where(inArray(scooterModels.id, modelIds))
    : [];

  // Платежи по этим арендам
  const paymentRows = rentalIds.length
    ? await db
        .select()
        .from(payments)
        .where(inArray(payments.rentalId, rentalIds))
        .orderBy(asc(payments.paidAt), asc(payments.createdAt))
    : [];
  // Имена принявших
  const receiverIds = Array.from(
    new Set(
      paymentRows.map((p) => p.receivedByUserId).filter((x): x is number => !!x),
    ),
  );
  const receiverRows = receiverIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, receiverIds))
    : [];
  const receiverMap = new Map(receiverRows.map((u) => [u.id, u.name]));

  const paymentsWithUser: PaymentRow[] = paymentRows.map((p) => ({
    ...p,
    receivedByName: p.receivedByUserId
      ? receiverMap.get(p.receivedByUserId) ?? null
      : null,
  }));

  // Акты о повреждениях
  const damageRows = rentalIds.length
    ? await db
        .select()
        .from(damageReports)
        .where(inArray(damageReports.rentalId, rentalIds))
        .orderBy(asc(damageReports.createdAt), asc(damageReports.id))
    : [];
  const damageIds = damageRows.map((r) => r.id);
  const damageItemRows = damageIds.length
    ? await db
        .select()
        .from(damageReportItems)
        .where(inArray(damageReportItems.reportId, damageIds))
        .orderBy(asc(damageReportItems.sortOrder))
    : [];

  // Сборка
  const rentalsFull: RentalRow[] = rentalRows.map((r) => {
    const scooter = scooterRows.find((s) => s.id === r.scooterId) ?? null;
    const model = scooter
      ? modelRows.find((m) => m.id === scooter.modelId) ?? null
      : null;
    return {
      ...r,
      scooterName: scooter?.name ?? null,
      modelName: model?.name ?? null,
      paymentsForRental: paymentsWithUser.filter((p) => p.rentalId === r.id),
    };
  });

  const damageFull: DamageRow[] = damageRows.map((d) => {
    const items = damageItemRows.filter((i) => i.reportId === d.id);
    const paymentsForReport = paymentsWithUser.filter(
      (p) => p.damageReportId === d.id,
    );
    const paidSum = paymentsForReport
      .filter((p) => p.paid)
      .reduce((s, p) => s + p.amount, 0);
    const debt = Math.max(0, d.total - d.depositCovered - paidSum);
    const r = rentalRows.find((rr) => rr.id === d.rentalId);
    return {
      ...d,
      rentalNo: r ? String(r.id).padStart(4, "0") : "—",
      items,
      paymentsForReport,
      paidSum,
      debt,
    };
  });

  return {
    client,
    rentals: rentalsFull,
    damageReports: damageFull,
  };
}

function fmtDateRu(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;
}

function fmtMoney(n: number | null | undefined): string {
  return Math.abs(Math.round(n ?? 0)).toLocaleString("ru-RU");
}

function escape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CSS = `
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 10.5pt; color: #000; line-height: 1.35;
  }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4pt; page-break-after: avoid; }
  h2 { font-size: 12pt; margin: 14pt 0 4pt; page-break-after: avoid; }
  .subtitle { text-align: center; font-size: 10pt; color: #444; margin-bottom: 12pt; }
  .meta-row { display: flex; justify-content: space-between; margin: 6pt 0 12pt; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0; }
  table th, table td { border: 1px solid #000; padding: 4pt 5pt; vertical-align: top; font-size: 9.5pt; }
  table th { background: #f0f0f0; font-weight: bold; text-align: left; }
  td.num { text-align: right; white-space: nowrap; }
  td.center { text-align: center; }
  .small { font-size: 9pt; color: #444; }
  .total-row td { font-weight: bold; }
  .summary { margin-top: 10pt; padding: 8pt; border: 1px solid #000; }
  .summary-row { display: flex; justify-content: space-between; padding: 2pt 0; }
  .summary-row.bold { font-weight: bold; font-size: 11pt; border-top: 1px solid #000; padding-top: 5pt; margin-top: 4pt; }
  .wrap { background: #fff; }
  @media screen { body { background: #f5f5f5; } .wrap { margin: 0 auto; padding: 16pt; max-width: 820px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); } }
  .keep { page-break-inside: avoid; }
</style>
`;

export function renderStatementHtml(b: StatementBundle): string {
  const { client, rentals: rentalRows, damageReports: damageRows } = b;
  const today = fmtDateRu(new Date());

  // Итоги
  const allPayments = rentalRows.flatMap((r) => r.paymentsForRental);
  const totalRentSum = rentalRows.reduce((s, r) => s + (r.sum ?? 0), 0);
  const totalDamageSum = damageRows.reduce((s, d) => s + d.total, 0);
  const totalReceived = allPayments
    .filter(
      (p) => p.paid && p.type !== "deposit" && p.type !== "refund",
    )
    .reduce((s, p) => s + p.amount, 0);
  const totalDeposited = allPayments
    .filter((p) => p.paid && p.type === "deposit")
    .reduce((s, p) => s + p.amount, 0);
  const totalRefunded = allPayments
    .filter((p) => p.paid && p.type === "refund")
    .reduce((s, p) => s + p.amount, 0);
  const totalDebtFromDamage = damageRows.reduce((s, d) => s + d.debt, 0);

  // Список аренд
  const rentalsTable =
    rentalRows.length === 0
      ? '<div class="small">Аренд не найдено.</div>'
      : `<table>
          <thead>
            <tr>
              <th style="width:30pt">№</th>
              <th>Период</th>
              <th>Скутер / модель</th>
              <th style="width:60pt">Тариф</th>
              <th style="width:40pt">Дни</th>
              <th style="width:80pt">Сумма, ₽</th>
              <th style="width:90pt">Статус</th>
            </tr>
          </thead>
          <tbody>
            ${rentalRows
              .map(
                (r) => `
                <tr>
                  <td class="center">${String(r.id).padStart(4, "0")}</td>
                  <td>${fmtDateRu(r.startAt)} — ${fmtDateRu(r.endActualAt ?? r.endPlannedAt)}</td>
                  <td>${escape(r.scooterName ?? "—")}${r.modelName ? `<br><span class="small">${escape(r.modelName)}</span>` : ""}</td>
                  <td>${r.rate} ₽/сут</td>
                  <td class="center">${r.days}</td>
                  <td class="num"><b>${fmtMoney(r.sum)}</b></td>
                  <td>${escape(r.status)}</td>
                </tr>`,
              )
              .join("")}
            <tr class="total-row">
              <td colspan="5" style="text-align:right">Итого начислено по арендам:</td>
              <td class="num">${fmtMoney(totalRentSum)} ₽</td>
              <td></td>
            </tr>
          </tbody>
        </table>`;

  // Платежи (все, включая залоги)
  const paymentsTable =
    allPayments.length === 0
      ? '<div class="small">Платежей не найдено.</div>'
      : `<table>
          <thead>
            <tr>
              <th style="width:30pt">№</th>
              <th style="width:80pt">Дата</th>
              <th style="width:50pt">Аренда</th>
              <th style="width:80pt">Тип</th>
              <th style="width:80pt">Метод</th>
              <th style="width:80pt">Сумма, ₽</th>
              <th>Принял</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            ${allPayments
              .map(
                (p, i) => `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>${fmtDateRu(p.paidAt ?? p.createdAt)}</td>
                  <td class="center">${String(p.rentalId).padStart(4, "0")}</td>
                  <td>${PAYMENT_TYPE_RU[p.type] ?? p.type}${p.paid ? "" : ' <span class="small">(ожидается)</span>'}</td>
                  <td>${PAYMENT_METHOD_RU[p.method] ?? p.method}</td>
                  <td class="num"><b>${fmtMoney(p.amount)}</b></td>
                  <td>${escape(p.receivedByName ?? "—")}</td>
                  <td>${escape(p.note ?? "")}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>`;

  // Акты о повреждениях
  const damageBlock =
    damageRows.length === 0
      ? ""
      : `<h2>Акты о повреждениях</h2>
        ${damageRows
          .map(
            (d) => `
          <div class="keep" style="margin-bottom:14pt">
            <div style="font-size:11pt"><b>Акт #${String(d.id).padStart(4, "0")}</b> от ${fmtDateRu(d.createdAt)} (по аренде #${d.rentalNo})${d.note ? ` — ${escape(d.note)}` : ""}</div>
            <table>
              <thead>
                <tr>
                  <th style="width:24pt">№</th>
                  <th>Позиция</th>
                  <th style="width:36pt">Кол.</th>
                  <th style="width:80pt">Цена, ₽</th>
                  <th style="width:80pt">Сумма, ₽</th>
                </tr>
              </thead>
              <tbody>
                ${d.items
                  .map(
                    (it, i) => `
                    <tr>
                      <td class="center">${i + 1}</td>
                      <td>${escape(it.name)}${it.comment ? `<br><span class="small">${escape(it.comment)}</span>` : ""}</td>
                      <td class="center">${it.quantity}</td>
                      <td class="num">${
                        it.originalPrice > it.finalPrice
                          ? `<span style="text-decoration:line-through;color:#666">${fmtMoney(it.originalPrice)}</span> <b>${fmtMoney(it.finalPrice)}</b>`
                          : fmtMoney(it.finalPrice)
                      }</td>
                      <td class="num"><b>${fmtMoney(it.finalPrice * it.quantity)}</b></td>
                    </tr>`,
                  )
                  .join("")}
                <tr class="total-row">
                  <td colspan="4" style="text-align:right">Итого по акту:</td>
                  <td class="num">${fmtMoney(d.total)} ₽</td>
                </tr>
              </tbody>
            </table>
            <div class="small">
              Зачтено из залога: ${fmtMoney(d.depositCovered)} ₽ ·
              Уплачено: ${fmtMoney(d.paidSum)} ₽ ·
              <b style="color:${d.debt > 0 ? "#a00" : "#070"}">Остаток долга: ${fmtMoney(d.debt)} ₽</b>
            </div>
            ${
              d.paymentsForReport.length > 0
                ? `<table style="margin-top:4pt">
                    <thead>
                      <tr>
                        <th style="width:30pt">№</th>
                        <th>Дата</th>
                        <th style="width:80pt">Сумма, ₽</th>
                        <th style="width:70pt">Метод</th>
                        <th>Принял</th>
                        <th>Комментарий</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${d.paymentsForReport
                        .map(
                          (p, i) => `
                          <tr>
                            <td class="center">${i + 1}</td>
                            <td>${fmtDateRu(p.paidAt ?? p.createdAt)}</td>
                            <td class="num">${fmtMoney(p.amount)}</td>
                            <td>${PAYMENT_METHOD_RU[p.method] ?? p.method}</td>
                            <td>${escape(p.receivedByName ?? "—")}</td>
                            <td>${escape(p.note ?? "")}</td>
                          </tr>`,
                        )
                        .join("")}
                    </tbody>
                  </table>`
                : ""
            }
          </div>`,
          )
          .join("")}`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Финансовая выписка по клиенту ${escape(client.name)}</title>${CSS}</head><body>
<div class="wrap">
  <h1>ФИНАНСОВАЯ ВЫПИСКА</h1>
  <div class="subtitle">по клиенту: <b>${escape(client.name)}</b></div>

  <div class="meta-row">
    <span>${LANDLORD.city}, арендодатель: ${escape(LANDLORD.fullName)}</span>
    <span>дата формирования: ${today}</span>
  </div>

  <h2>Реквизиты клиента</h2>
  <table>
    <tr><th style="width:160pt">ФИО</th><td>${escape(client.name)}</td></tr>
    ${client.phone ? `<tr><th>Телефон</th><td>${escape(client.phone)}</td></tr>` : ""}
    ${client.birthDate ? `<tr><th>Дата рождения</th><td>${fmtDateRu(client.birthDate)}</td></tr>` : ""}
    ${
      client.passportSeries || client.passportNumber
        ? `<tr><th>Паспорт</th><td>серия ${escape(client.passportSeries ?? "____")} № ${escape(client.passportNumber ?? "______")}${
            client.passportIssuedOn
              ? `, выдан ${fmtDateRu(client.passportIssuedOn)}`
              : ""
          }${client.passportIssuer ? ` ${escape(client.passportIssuer)}` : ""}</td></tr>`
        : ""
    }
    ${
      client.passportRegistration
        ? `<tr><th>Регистрация</th><td>${escape(client.passportRegistration)}</td></tr>`
        : ""
    }
  </table>

  <h2>История аренд</h2>
  ${rentalsTable}

  <h2>История платежей</h2>
  ${paymentsTable}

  ${damageBlock}

  <h2>Сводный итог</h2>
  <div class="summary">
    <div class="summary-row"><span>Всего начислено по арендам</span><span><b>${fmtMoney(totalRentSum)} ₽</b></span></div>
    <div class="summary-row"><span>Всего начислено по актам ущерба</span><span><b>${fmtMoney(totalDamageSum)} ₽</b></span></div>
    <div class="summary-row"><span>Получено от клиента (без залогов и возвратов)</span><span><b>${fmtMoney(totalReceived)} ₽</b></span></div>
    <div class="summary-row"><span>Внесено залогом</span><span>${fmtMoney(totalDeposited)} ₽</span></div>
    ${totalRefunded > 0 ? `<div class="summary-row"><span>Возвращено клиенту</span><span>${fmtMoney(totalRefunded)} ₽</span></div>` : ""}
    <div class="summary-row bold"><span>Остаток долга по актам ущерба</span><span style="color:${totalDebtFromDamage > 0 ? "#a00" : "#070"}">${fmtMoney(totalDebtFromDamage)} ₽</span></div>
  </div>

  <div class="small" style="margin-top:18pt">
    Выписка сформирована автоматически из учётной системы.
    Содержит все события по клиенту на момент ${today}.
  </div>
</div>
</body></html>`;
}

export function renderStatementHtmlForWord(b: StatementBundle): string {
  const html = renderStatementHtml(b);
  const stripped = html.replace(/@page\s*\{[^}]*\}/g, "");
  return stripped.replace(
    '<html lang="ru">',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ru">',
  );
}
