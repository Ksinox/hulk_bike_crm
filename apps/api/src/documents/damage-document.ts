/**
 * Печатная форма «Акт о повреждениях» — A4, ч/б, простой типографский
 * стиль (Times New Roman). Подходит для распечатки на ч/б принтере и
 * подписания клиентом + сотрудником.
 *
 * Открывается через GET /api/damage-reports/:id/document?format=html|docx
 */
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  damageReportItems,
  damageReports,
  documentTemplates,
  payments,
  rentals,
  scooterModels,
  scooters,
  users,
} from "../db/schema.js";
import { LANDLORD } from "./landlord.js";
import { resolveVariable } from "./variables.js";

type DamageBundle = {
  report: typeof damageReports.$inferSelect;
  rental: typeof rentals.$inferSelect;
  client: typeof clients.$inferSelect;
  scooter: typeof scooters.$inferSelect | null;
  model: typeof scooterModels.$inferSelect | null;
  items: (typeof damageReportItems.$inferSelect)[];
  damagePayments: (typeof payments.$inferSelect)[];
  createdByName: string | null;
};

export async function loadDamageBundle(
  reportId: number,
): Promise<DamageBundle | null> {
  const [report] = await db
    .select()
    .from(damageReports)
    .where(eq(damageReports.id, reportId));
  if (!report) return null;
  const [rental] = await db
    .select()
    .from(rentals)
    .where(eq(rentals.id, report.rentalId));
  if (!rental) return null;
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, rental.clientId));
  if (!client) return null;
  let scooter: typeof scooters.$inferSelect | null = null;
  let model: typeof scooterModels.$inferSelect | null = null;
  if (rental.scooterId != null) {
    const [s] = await db
      .select()
      .from(scooters)
      .where(eq(scooters.id, rental.scooterId));
    if (s) {
      scooter = s;
      if (s.modelId != null) {
        const [m] = await db
          .select()
          .from(scooterModels)
          .where(eq(scooterModels.id, s.modelId));
        if (m) model = m;
      }
    }
  }
  const items = await db
    .select()
    .from(damageReportItems)
    .where(eq(damageReportItems.reportId, reportId));
  const damagePayments = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.damageReportId, reportId), eq(payments.type, "damage")),
    );
  let createdByName: string | null = null;
  if (report.createdByUserId) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, report.createdByUserId));
    if (u) createdByName = u.name;
  }
  return {
    report,
    rental,
    client,
    scooter,
    model,
    items,
    damagePayments,
    createdByName,
  };
}

function fmtDateRu(d: Date | string | null | undefined): string {
  if (!d) return "«___» __________ ____г.";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "«___» __________ ____г.";
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;
}

function fmtMoney(n: number): string {
  return Math.abs(Math.round(n)).toLocaleString("ru-RU");
}

function modelDisplayName(
  scooter: { model: string } | null,
  model: { name: string } | null,
): string {
  if (model?.name) return model.name;
  if (!scooter?.model) return "—";
  const map: Record<string, string> = {
    jog: "Yamaha Jog",
    gear: "Yamaha Gear",
    honda: "Honda Dio",
    tank: "Tank T150",
  };
  return map[scooter.model] ?? scooter.model;
}

const CSS = `
<style>
  @page { size: A4 portrait; margin: 18mm 16mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt; color: #000; line-height: 1.4;
  }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4pt; page-break-after: avoid; }
  .subtitle { text-align: center; font-size: 10pt; color: #444; margin-bottom: 14pt; }
  .meta-row { display: flex; justify-content: space-between; margin: 8pt 0 14pt; font-size: 10pt; }
  .para { margin: 6pt 0; text-align: justify; }
  table.items { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  table.items th, table.items td { border: 1px solid #000; padding: 5pt 6pt; vertical-align: top; font-size: 10.5pt; }
  table.items th { background: #f0f0f0; font-weight: bold; text-align: left; }
  table.items td.num { text-align: right; white-space: nowrap; }
  table.items td.center { text-align: center; }
  .total-row td { font-weight: bold; }
  .summary { margin-top: 12pt; border-top: 1px solid #000; padding-top: 8pt; }
  .summary table { width: 100%; }
  .summary td { padding: 3pt 0; font-size: 11pt; }
  .summary td.lbl { text-align: left; }
  .summary td.val { text-align: right; font-weight: bold; white-space: nowrap; }
  .total-final { font-size: 12pt; }
  .sig { margin-top: 28pt; display: flex; justify-content: space-between; gap: 20pt; page-break-inside: avoid; }
  .sig > div { width: 48%; }
  .sig .line { border-bottom: 1px solid #000; height: 26pt; margin-bottom: 2pt; }
  .small { font-size: 9.5pt; color: #444; }
  .wrap { background: #fff; }
  @media screen { body { background: #f5f5f5; } .wrap { margin: 0 auto; padding: 16pt; max-width: 820px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); } }
</style>
`;

/**
 * Сборка контекста damage.* переменных для подстановки в override-шаблон.
 * Возвращает map { 'damage.itemsTable': '<table>...</table>', ... }.
 * Используется substituteDamageVariables ниже.
 */
function buildDamageContext(b: DamageBundle): Record<string, string> {
  const { report, items, damagePayments } = b;
  const total = report.total;
  const deposit = report.depositCovered;
  const paid = damagePayments
    .filter((p) => p.paid)
    .reduce((s, p) => s + p.amount, 0);
  const debt = Math.max(0, total - deposit - paid);

  const rows = items
    .map((it, i) => {
      const sum = it.finalPrice * it.quantity;
      const discount =
        it.originalPrice > it.finalPrice
          ? Math.round(
              ((it.originalPrice - it.finalPrice) / it.originalPrice) * 100,
            )
          : 0;
      const priceCell =
        discount > 0
          ? `<span style="text-decoration: line-through; color:#666">${fmtMoney(it.originalPrice)}</span> <b>${fmtMoney(it.finalPrice)}</b><br><span class="small">скидка −${discount}%</span>`
          : `${fmtMoney(it.finalPrice)}`;
      return `
        <tr>
          <td class="center">${i + 1}</td>
          <td>
            <b>${escape(it.name)}</b>
            ${it.comment ? `<br><span class="small">${escape(it.comment)}</span>` : ""}
          </td>
          <td class="center">${it.quantity}</td>
          <td class="num">${priceCell}</td>
          <td class="num"><b>${fmtMoney(sum)}</b></td>
        </tr>
      `;
    })
    .join("");

  const itemsTable = `<table class="items">
    <thead>
      <tr>
        <th style="width:32pt">№</th>
        <th>Позиция / описание</th>
        <th style="width:40pt">Кол.</th>
        <th style="width:90pt">Цена, ₽</th>
        <th style="width:90pt">Сумма, ₽</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right">ИТОГО:</td>
        <td class="num">${fmtMoney(total)} ₽</td>
      </tr>
    </tbody>
  </table>`;

  return {
    "damage.reportNumber": String(report.id).padStart(4, "0"),
    "damage.reportDate": fmtDateRu(report.createdAt),
    "damage.itemsTable": itemsTable,
    "damage.total": fmtMoney(total),
    "damage.totalWords": "—", // TODO: можно подключить moneyWords из variables.ts
    "damage.depositCovered": fmtMoney(deposit),
    "damage.paidSum": fmtMoney(paid),
    "damage.debt": fmtMoney(debt),
    "damage.note": report.note ? escape(report.note) : "",
  };
}

/**
 * Подставляет переменные в override-шаблон акта о повреждениях.
 * Поддерживает обычные переменные (client.*, scooter.*, rental.*,
 * landlord.*) через resolveVariable + специальные damage.* через
 * dynamic context.
 */
function substituteDamageVariables(
  html: string,
  b: DamageBundle,
): string {
  const ctx = buildDamageContext(b);
  // Bundle для resolveVariable — нужны rental, client, scooter, model.
  const bundle = {
    rental: b.rental,
    client: b.client,
    scooter: b.scooter,
    model: b.model,
  } as Parameters<typeof resolveVariable>[1];

  // Сначала <span data-var="X.Y">...</span> — сохраняем форматирование пилюль.
  const spanRe = /<span\s+data-var="([^"]+)"[^>]*>[\s\S]*?<\/span>/g;
  let out = html.replace(spanRe, (_match, key: string) => {
    if (key in ctx) return ctx[key] ?? "";
    return resolveVariable(key, bundle);
  });
  // Простые {{X.Y}} метки.
  const mustacheRe = /\{\{\s*([\w.]+)\s*\}\}/g;
  out = out.replace(mustacheRe, (_m, key: string) => {
    if (key in ctx) return ctx[key] ?? "";
    return resolveVariable(key, bundle);
  });
  return out;
}

/**
 * Главная функция рендера акта. Если в БД есть пользовательский
 * override (templateKey='damage') — использует его и подставляет
 * переменные. Иначе — системный хардкод.
 */
export async function renderDamageHtml(b: DamageBundle): Promise<string> {
  const [override] = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.templateKey, "damage"));
  if (override) {
    const body = substituteDamageVariables(override.body, b);
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Акт о повреждениях № ${String(b.report.id).padStart(4, "0")}</title>${CSS}</head><body>
<div class="wrap">
${body}
</div>
</body></html>`;
  }
  return renderDamageHtmlSystem(b);
}

function renderDamageHtmlSystem(b: DamageBundle): string {
  const { report, rental, client, scooter, model, items, damagePayments } = b;
  const reportNo = String(report.id).padStart(4, "0");
  const reportDate = fmtDateRu(report.createdAt);

  const rentalStart = fmtDateRu(rental.startAt);
  const rentalEnd = fmtDateRu(rental.endActualAt ?? rental.endPlannedAt);
  const scooterModelName = modelDisplayName(scooter, model);
  const scooterFrame = scooter?.frameNumber ?? "—";
  const scooterPlate =
    (scooter as unknown as { plate?: string | null })?.plate ?? "—";

  const total = report.total;
  const deposit = report.depositCovered;
  const paid = damagePayments
    .filter((p) => p.paid)
    .reduce((s, p) => s + p.amount, 0);
  const debt = Math.max(0, total - deposit - paid);

  // Строки таблицы
  const rows = items
    .map((it, i) => {
      const sum = it.finalPrice * it.quantity;
      const discount =
        it.originalPrice > it.finalPrice
          ? Math.round(
              ((it.originalPrice - it.finalPrice) / it.originalPrice) * 100,
            )
          : 0;
      const priceCell =
        discount > 0
          ? `<span style="text-decoration: line-through; color:#666">${fmtMoney(it.originalPrice)}</span> <b>${fmtMoney(it.finalPrice)}</b><br><span class="small">скидка −${discount}%</span>`
          : `${fmtMoney(it.finalPrice)}`;
      return `
        <tr>
          <td class="center">${i + 1}</td>
          <td>
            <b>${escape(it.name)}</b>
            ${it.comment ? `<br><span class="small">${escape(it.comment)}</span>` : ""}
          </td>
          <td class="center">${it.quantity}</td>
          <td class="num">${priceCell}</td>
          <td class="num"><b>${fmtMoney(sum)}</b></td>
        </tr>
      `;
    })
    .join("");

  // История платежей по акту (если есть)
  const paymentsBlock =
    damagePayments.length > 0
      ? `
        <h3 style="margin-top:14pt;font-size:11pt">История платежей по акту</h3>
        <table class="items">
          <thead>
            <tr>
              <th style="width:32pt">№</th>
              <th>Дата</th>
              <th>Сумма, ₽</th>
              <th>Метод</th>
              <th>Принял</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            ${damagePayments
              .map(
                (p, i) => `
                <tr>
                  <td class="center">${i + 1}</td>
                  <td>${fmtDateRu(p.paidAt ?? p.createdAt)}</td>
                  <td class="num">${fmtMoney(p.amount)}</td>
                  <td>${p.method === "cash" ? "наличные" : p.method === "card" ? "карта" : "перевод"}</td>
                  <td>${p.receivedByUserId ?? "—"}</td>
                  <td>${escape(p.note ?? "")}</td>
                </tr>
              `,
              )
              .join("")}
          </tbody>
        </table>
      `
      : "";

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Акт о повреждениях № ${reportNo}</title>${CSS}</head><body>
<div class="wrap">
  <h1>АКТ О ПОВРЕЖДЕНИЯХ № ${reportNo}</h1>
  <div class="subtitle">по договору проката Скутера № ${String(rental.id).padStart(4, "0")} от ${rentalStart}</div>

  <div class="meta-row">
    <span>${LANDLORD.city}</span>
    <span>дата составления: ${reportDate}</span>
  </div>

  <div class="para">
    Мы, нижеподписавшиеся, гражданин РФ <b>${escape(LANDLORD.fullName)}</b>, именуемый далее «Арендодатель», с одной стороны, и гражданин РФ <b>${escape(client.name)}</b>${client.phone ? `, тел. ${escape(client.phone)}` : ""}, именуемый далее «Арендатор», с другой стороны, составили настоящий Акт о том, что при возврате Скутера ${scooterModelName}, № рамы ${escape(scooterFrame)}${scooterPlate !== "—" ? `, гос. № ${escape(scooterPlate)}` : ""}, переданного по договору проката от ${rentalStart} (срок аренды до ${rentalEnd}), обнаружены следующие повреждения и недостачи:
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:32pt">№</th>
        <th>Позиция / описание</th>
        <th style="width:40pt">Кол.</th>
        <th style="width:90pt">Цена, ₽</th>
        <th style="width:90pt">Сумма, ₽</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="4" style="text-align:right">ИТОГО:</td>
        <td class="num">${fmtMoney(total)} ₽</td>
      </tr>
    </tbody>
  </table>

  ${
    report.note
      ? `<div class="para"><b>Дополнительно:</b> ${escape(report.note)}</div>`
      : ""
  }

  <div class="summary">
    <table>
      <tr>
        <td class="lbl">Сумма по акту</td>
        <td class="val">${fmtMoney(total)} ₽</td>
      </tr>
      <tr>
        <td class="lbl">Зачёт из залога (залог арендатора ${fmtMoney(rental.deposit ?? 0)} ₽)</td>
        <td class="val">− ${fmtMoney(deposit)} ₽</td>
      </tr>
      ${
        paid > 0
          ? `<tr>
              <td class="lbl">Уплачено арендатором по акту</td>
              <td class="val">− ${fmtMoney(paid)} ₽</td>
            </tr>`
          : ""
      }
      <tr class="total-final">
        <td class="lbl"><b>К ДОПЛАТЕ:</b></td>
        <td class="val">${fmtMoney(debt)} ₽</td>
      </tr>
    </table>
  </div>

  ${paymentsBlock}

  <div class="para" style="margin-top:14pt">
    С перечнем повреждений, расчётом стоимости устранения и итоговой суммой к доплате <b>СОГЛАСЕН</b>:
  </div>

  <div class="sig">
    <div>
      <div class="line"></div>
      <div>Арендатор: ${escape(client.name)}</div>
      <div class="small">подпись / расшифровка</div>
    </div>
    <div>
      <div class="line"></div>
      <div>Арендодатель: ${escape(LANDLORD.fullName)}</div>
      <div class="small">подпись / расшифровка</div>
    </div>
  </div>

  <div class="small" style="margin-top:18pt">
    Акт составлен в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из сторон.
  </div>
</div>
</body></html>`;
}

function escape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Возвращает HTML системного шаблона акта о повреждениях с пилюлями
 * переменных — для редактора шаблонов. Используется в endpoint
 * GET /api/document-templates/system-default?type=damage.
 *
 * Поскольку акт сильно динамичный (таблица позиций имеет переменное
 * число строк), мы НЕ генерируем его на fixture-bundle и потом replace —
 * вместо этого собираем шаблон руками с пилюлями <span data-var="...">
 * вместо мест где должны быть значения.
 */
export function renderDamageSystemForEditor(): string {
  // Хелпер для пилюли с правильным русским label.
  const pill = (key: string, label: string) =>
    `<span data-var="${key}" data-label="${label}" class="tpl-var">${label}</span>`;

  return `
<h1>АКТ О ПОВРЕЖДЕНИЯХ № ${pill("damage.reportNumber", "Номер акта")}</h1>
<p class="subtitle">по договору проката Скутера № ${pill("rental.id", "Номер договора")} от ${pill("rental.startDate", "Дата выдачи")}</p>

<div class="meta-row">
  <span>${pill("landlord.city", "Город")}</span>
  <span>дата составления: ${pill("damage.reportDate", "Дата составления акта")}</span>
</div>

<p class="para">
  Мы, нижеподписавшиеся, гражданин РФ <b>${pill("landlord.fullName", "ФИО арендодателя")}</b>, именуемый далее «Арендодатель», с одной стороны, и гражданин РФ <b>${pill("client.name", "ФИО арендатора")}</b>, тел. ${pill("client.phone", "Телефон")}, именуемый далее «Арендатор», с другой стороны, составили настоящий Акт о том, что при возврате Скутера ${pill("model.name", "Модель")}, № рамы ${pill("scooter.frameNumber", "Номер рамы")}, переданного по договору проката от ${pill("rental.startDate", "Дата выдачи")} (срок аренды до ${pill("rental.endDate", "Плановая дата возврата")}), обнаружены следующие повреждения и недостачи:
</p>

<p>${pill("damage.itemsTable", "Таблица позиций (вся таблица)")}</p>

<div class="summary">
  <table>
    <tr>
      <td class="lbl">Сумма по акту</td>
      <td class="val">${pill("damage.total", "Итого по акту, ₽")} ₽</td>
    </tr>
    <tr>
      <td class="lbl">Зачёт из залога (залог арендатора ${pill("rental.deposit", "Залог, ₽")} ₽)</td>
      <td class="val">− ${pill("damage.depositCovered", "Зачёт из залога, ₽")} ₽</td>
    </tr>
    <tr>
      <td class="lbl">Уплачено арендатором по акту</td>
      <td class="val">− ${pill("damage.paidSum", "Уплачено по акту, ₽")} ₽</td>
    </tr>
    <tr class="total-final">
      <td class="lbl"><b>К ДОПЛАТЕ:</b></td>
      <td class="val">${pill("damage.debt", "К доплате (остаток долга), ₽")} ₽</td>
    </tr>
  </table>
</div>

<p class="para" style="margin-top:14pt">
  С перечнем повреждений, расчётом стоимости устранения и итоговой суммой к доплате <b>СОГЛАСЕН</b>:
</p>

<div class="sig">
  <div>
    <div class="line"></div>
    <div>Арендатор: ${pill("client.name", "ФИО арендатора")}</div>
    <div class="small">подпись / расшифровка</div>
  </div>
  <div>
    <div class="line"></div>
    <div>Арендодатель: ${pill("landlord.fullName", "ФИО арендодателя")}</div>
    <div class="small">подпись / расшифровка</div>
  </div>
</div>

<p class="small" style="margin-top:18pt">
  Акт составлен в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из сторон.
</p>
`;
}

export async function renderDamageHtmlForWord(b: DamageBundle): Promise<string> {
  const html = await renderDamageHtml(b);
  const stripped = html.replace(/@page\s*\{[^}]*\}/g, "");
  return stripped.replace(
    '<html lang="ru">',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ru">',
  );
}
