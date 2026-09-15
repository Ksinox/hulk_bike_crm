/**
 * Договор аренды транспортного средства без экипажа с правом выкупа.
 *
 * Собран по образцу заказчика (06.09.2026, «образец выкуп скутера.docx»):
 * девять разделов, реквизиты сторон и Приложение №1 — акт приёма-передачи.
 * Все изменяемые места — переменные-пилюли, как в остальных договорах:
 * системный шаблон можно править в «Документы → Шаблоны» (override с
 * ключом `contract_buyout`), при печати подставляются данные сделки.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  buyoutDeals,
  buyoutSchedule,
  clients,
  documentTemplates,
  scooterModels,
  scooters,
} from "../db/schema.js";
import { LANDLORD } from "./landlord.js";
import { buildSchedule } from "../services/buyoutMath.js";
import { resolveVariable, VARIABLE_CATALOG } from "./variables.js";

export type BuyoutBundle = {
  deal: typeof buyoutDeals.$inferSelect;
  client: typeof clients.$inferSelect | null;
  scooter: typeof scooters.$inferSelect | null;
  model: typeof scooterModels.$inferSelect | null;
  schedule: (typeof buyoutSchedule.$inferSelect)[];
};

export async function loadBuyoutBundle(id: number): Promise<BuyoutBundle | null> {
  const [deal] = await db
    .select()
    .from(buyoutDeals)
    .where(eq(buyoutDeals.id, id));
  if (!deal) return null;
  const [client] = deal.clientId
    ? await db.select().from(clients).where(eq(clients.id, deal.clientId))
    : [];
  const [scooter] = deal.scooterId
    ? await db.select().from(scooters).where(eq(scooters.id, deal.scooterId))
    : [];
  const [model] = scooter?.modelId
    ? await db
        .select()
        .from(scooterModels)
        .where(eq(scooterModels.id, scooter.modelId))
    : [];
  const schedule = await db
    .select()
    .from(buyoutSchedule)
    .where(eq(buyoutSchedule.dealId, id))
    .orderBy(asc(buyoutSchedule.seq));
  return {
    deal,
    client: client ?? null,
    scooter: scooter ?? null,
    model: model ?? null,
    schedule,
  };
}

/* ==================== helpers ==================== */

function escape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

function fmtDateRu(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «7» июля 2026 г. — как в шапке образца. */
function fmtDateLong(d: Date | string | null | undefined): string {
  if (!d) return "«__» ________ ____ г.";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d;
  if (Number.isNaN(dt.getTime())) return "«__» ________ ____ г.";
  return `«${dt.getDate()}» ${MONTHS_GEN[dt.getMonth()]} ${dt.getFullYear()} г.`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T12:00:00`).getTime();
  const b = new Date(`${toIso}T12:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

/** Сумма прописью (рубли), до 9 999 999. */
export function moneyWords(n: number): string {
  const num = Math.abs(Math.round(n));
  if (num === 0) return "ноль";
  const u = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const uf = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const t = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const h = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const triple = (n3: number, fem: boolean): string => {
    const out: string[] = [];
    if (n3 >= 100) out.push(h[Math.floor(n3 / 100)]!);
    const rem = n3 % 100;
    if (rem >= 10 && rem < 20) out.push(teens[rem - 10]!);
    else {
      if (rem >= 20) out.push(t[Math.floor(rem / 10)]!);
      const last = rem % 10;
      if (last) out.push((fem ? uf : u)[last]!);
    }
    return out.join(" ");
  };
  const plural = (n3: number, forms: [string, string, string]) => {
    const m10 = n3 % 10;
    const m100 = n3 % 100;
    if (m10 === 1 && m100 !== 11) return forms[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
    return forms[2];
  };
  const millions = Math.floor(num / 1_000_000);
  const thousands = Math.floor((num % 1_000_000) / 1000);
  const rest = num % 1000;
  const parts: string[] = [];
  if (millions) parts.push(`${triple(millions, false)} ${plural(millions, ["миллион", "миллиона", "миллионов"])}`);
  if (thousands) parts.push(`${triple(thousands, true)} ${plural(thousands, ["тысяча", "тысячи", "тысяч"])}`);
  if (rest) parts.push(triple(rest, false));
  return parts.join(" ").trim();
}

/* ==================== переменные сделки ==================== */

/** Каталог переменных выкупа — попадает в сайдбар редактора шаблонов. */
export const BUYOUT_VARIABLES = [
  { key: "buyout.number", label: "Номер договора выкупа" },
  { key: "buyout.date", label: "Дата договора (ДД.ММ.ГГГГ)" },
  { key: "buyout.dateLong", label: "Дата договора («7» июля 2026 г.)" },
  { key: "buyout.termDays", label: "Срок аренды, дней" },
  { key: "buyout.endDate", label: "Дата окончания срока аренды" },
  { key: "buyout.validityDays", label: "Срок действия договора, дней" },
  { key: "buyout.validityEnd", label: "Дата окончания действия договора" },
  { key: "buyout.total", label: "Выкупная стоимость, ₽" },
  { key: "buyout.totalWords", label: "Выкупная стоимость прописью" },
  { key: "buyout.scooterPrice", label: "Стоимость техники без наценки, ₽" },
  { key: "buyout.markup", label: "Наценка за срок, ₽" },
  { key: "buyout.downPayment", label: "Гарантийный взнос (аванс), ₽" },
  { key: "buyout.downPaymentWords", label: "Взнос прописью" },
  { key: "buyout.financed", label: "Остаток к выплате, ₽" },
  { key: "buyout.financedWords", label: "Остаток прописью" },
  { key: "buyout.paymentAmount", label: "Платёж за период, ₽" },
  { key: "buyout.paymentAmountWords", label: "Платёж прописью" },
  { key: "buyout.periodWord", label: "Период платежа («в неделю» / «в месяц»)" },
  { key: "buyout.paymentsCount", label: "Количество платежей" },
  { key: "buyout.scheduleTable", label: "График платежей (вся таблица)" },
  { key: "buyout.subject", label: "Предмет аренды строкой (техника, VIN, двигатель)" },
  { key: "buyout.scooterModel", label: "Марка, модель техники" },
  { key: "buyout.scooterFrame", label: "№ шасси (рама) / VIN" },
  { key: "buyout.scooterEngine", label: "№ двигателя" },
  { key: "buyout.scooterYear", label: "Год выпуска" },
  { key: "buyout.scooterColor", label: "Цвет" },
  { key: "buyout.scooterMileage", label: "Пробег при передаче, км" },
] as const;

type ScheduleLike = { seq: number; dueDate: string; amount: number; paid: boolean };

/** Строки графика: фактические после подписания, иначе прогноз. */
function scheduleRows(b: BuyoutBundle): ScheduleLike[] {
  const { deal, schedule } = b;
  if (schedule.length > 0) {
    return schedule.map((r) => ({
      seq: r.seq,
      dueDate: r.dueDate,
      amount: r.amount,
      paid: r.paidAmount >= r.amount,
    }));
  }
  const custom = (
    (deal.customSchedule as { dueDate: string; amount: number; paidAt?: string | null }[] | null) ?? []
  )
    .slice()
    .sort((a, c) => a.dueDate.localeCompare(c.dueDate));
  if (custom.length) {
    return custom.map((r, i) => ({ seq: i + 1, dueDate: r.dueDate, amount: r.amount, paid: !!r.paidAt }));
  }
  const start = deal.startDate ?? addDays(new Date().toISOString().slice(0, 10), 1);
  return buildSchedule(
    {
      scooterPrice: deal.scooterPrice,
      termMonths: deal.termMonths,
      markup: deal.markup,
      total: deal.total,
      downPayment: deal.downPayment,
      financed: deal.financed,
      period: deal.period as "month" | "week",
      paymentAmount: deal.paymentAmount,
      paymentsCount: deal.paymentsCount,
    },
    start,
  ).map((r) => ({ ...r, paid: false }));
}

function scheduleTableHtml(rows: ScheduleLike[]): string {
  if (rows.length === 0) {
    return `<table class="sched"><tr><th>№</th><th>Дата платежа</th><th>Сумма</th></tr><tr><td colspan="3">График формируется при подписании договора.</td></tr></table>`;
  }
  const body = rows
    .map(
      (r) => `<tr><td class="num">${r.seq}</td><td>${fmtDateRu(r.dueDate)}</td><td class="num">${fmt(r.amount)} ₽${r.paid ? ' <span class="paid">(оплачено)</span>' : ""}</td></tr>`,
    )
    .join("");
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return `<table class="sched"><tr><th>№</th><th>Дата платежа</th><th>Сумма</th></tr>${body}<tr><td></td><td><b>Итого</b></td><td class="num"><b>${fmt(total)} ₽</b></td></tr></table>`;
}

/** Значения переменных сделки для подстановки в шаблон. */
export function buildBuyoutContext(b: BuyoutBundle): Record<string, string> {
  const { deal, scooter, model } = b;
  const rows = scheduleRows(b);
  const contractDate = deal.signedAt ?? deal.contractAt ?? deal.createdAt;
  const contractIso = new Date(contractDate).toISOString().slice(0, 10);
  const startIso = deal.startDate ?? contractIso;
  const lastDue = rows.length ? rows[rows.length - 1]!.dueDate : addDays(startIso, deal.termMonths * 30);
  const termDays = daysBetween(startIso < contractIso ? startIso : contractIso, lastDue);
  const validityDays = termDays + 60;
  const validityEnd = addDays(lastDue, 60);
  const periodWord = deal.period === "week" ? "в неделю" : "в месяц";
  const modelName = model?.name ?? deal.modelName ?? deal.scooterName ?? "—";
  const frame = deal.vin || deal.frameNumber || scooter?.vin || scooter?.frameNumber || "—";
  const engine = deal.engineNo || scooter?.engineNo || "—";
  const year = scooter?.year ? String(scooter.year) : "—";
  const color = scooter?.color || "—";
  const mileage = deal.mileage ?? scooter?.mileage ?? 0;
  const subjectParts = [
    `скутер ${modelName}`,
    year !== "—" ? `${year} года выпуска` : null,
    `№ шасси (рама) / VIN ${frame}`,
    `№ двигателя ${engine}`,
    color !== "—" ? `цвет ${color}` : null,
    `пробег ${fmt(mileage)} км`,
  ].filter(Boolean);

  const raw: Record<string, string> = {
    "buyout.number": String(deal.id).padStart(4, "0"),
    "buyout.date": fmtDateRu(contractDate),
    "buyout.dateLong": fmtDateLong(contractDate),
    "buyout.termDays": String(termDays),
    "buyout.endDate": fmtDateRu(lastDue),
    "buyout.validityDays": String(validityDays),
    "buyout.validityEnd": fmtDateRu(validityEnd),
    "buyout.total": fmt(deal.total),
    "buyout.totalWords": moneyWords(deal.total),
    "buyout.scooterPrice": fmt(deal.scooterPrice),
    "buyout.markup": fmt(deal.markup),
    "buyout.downPayment": fmt(deal.downPayment),
    "buyout.downPaymentWords": moneyWords(deal.downPayment),
    "buyout.financed": fmt(deal.financed),
    "buyout.financedWords": moneyWords(deal.financed),
    "buyout.paymentAmount": fmt(deal.paymentAmount),
    "buyout.paymentAmountWords": moneyWords(deal.paymentAmount),
    "buyout.periodWord": periodWord,
    "buyout.paymentsCount": String(rows.length || deal.paymentsCount),
    "buyout.subject": subjectParts.join(", "),
    "buyout.scooterModel": modelName,
    "buyout.scooterFrame": frame,
    "buyout.scooterEngine": engine,
    "buyout.scooterYear": year,
    "buyout.scooterColor": color,
    "buyout.scooterMileage": fmt(mileage),
  };
  const ctx: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) ctx[k] = escape(v);
  // Таблица — уже HTML, экранировать нельзя.
  ctx["buyout.scheduleTable"] = scheduleTableHtml(rows);
  return ctx;
}

/**
 * Подстановка: сначала переменные сделки, остальное (client.*, landlord.*,
 * model.*, scooter.*) — общим резолвером договоров.
 */
function substituteBuyoutVariables(html: string, b: BuyoutBundle): string {
  const ctx = buildBuyoutContext(b);
  const fallbackBundle = {
    rental: null,
    client: b.client ?? ({} as typeof clients.$inferSelect),
    scooter: b.scooter,
    model: b.model,
  } as unknown as Parameters<typeof resolveVariable>[1];
  const resolve = (key: string): string => {
    if (key in ctx) return ctx[key] ?? "";
    if (!b.client && key.startsWith("client.")) return "____________________";
    if (key.startsWith("rental.")) return "—";
    return escape(resolveVariable(key, fallbackBundle));
  };
  const spanRe = /<span\b[^>]*?\bdata-var="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi;
  let out = html.replace(spanRe, (_m, key: string) => resolve(key));
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => resolve(key));
  return out;
}

/* ==================== системный шаблон ==================== */

const LABELS = new Map<string, string>();
for (const g of VARIABLE_CATALOG) for (const v of g.variables) LABELS.set(v.key, v.label);
for (const v of BUYOUT_VARIABLES) LABELS.set(v.key, v.label);

function pill(key: string): string {
  const label = LABELS.get(key) ?? key;
  return `<span data-var="${key}" data-label="${escape(label)}" class="tpl-var">${escape(label)}</span>`;
}

const CSS = `
<style>
  @page { size: A4 portrait; margin: 16mm 15mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Times New Roman", Times, serif; font-size: 10.5pt; color: #000; line-height: 1.4; }
  h1 { font-size: 13pt; text-align: center; margin: 0 0 2pt; font-weight: bold; text-transform: uppercase; }
  .city { display: flex; justify-content: space-between; margin: 0 0 10pt; }
  h2 { font-size: 11pt; font-weight: bold; margin: 10pt 0 4pt; text-transform: uppercase; }
  .para { margin: 3pt 0; text-align: justify; }
  .para.sub { margin-left: 14pt; }
  .fill { display: inline-block; min-width: 180pt; border-bottom: 1px solid #000; }
  table.sched { border-collapse: collapse; margin: 6pt 0; font-size: 10pt; min-width: 60%; }
  table.sched th, table.sched td { border: 1px solid #000; padding: 3pt 8pt; }
  table.sched th { background: #f2f2f2; text-align: left; }
  table.sched td.num { text-align: right; white-space: nowrap; }
  .paid { font-size: 9pt; color: #444; }
  table.req { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  table.req td { border: 1px solid #000; padding: 6pt 8pt; vertical-align: top; width: 50%; }
  .sig { margin-top: 18pt; display: flex; justify-content: space-between; gap: 20pt; page-break-inside: avoid; }
  .sig > div { width: 48%; }
  .sig .line { border-bottom: 1px solid #000; height: 24pt; margin-bottom: 2pt; }
  .small { font-size: 9pt; color: #444; }
  .act h1 { margin-top: 0; }
  .act .right { text-align: right; }
  .act .spec { margin: 2pt 0; }
  .lines { border-bottom: 1px solid #000; height: 16pt; margin: 4pt 0; }
  .wrap { background: #fff; }
  .tpl-var { display: inline-block; padding: 0 4px; border-radius: 4px; background: #eef2ff; color: #3730a3; font-size: 9.5pt; }
  @media screen { body { background: #f5f5f5; } .wrap { margin: 0 auto; padding: 16pt; max-width: 820px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); } }
  @media print { .noprint { display: none !important; } .tpl-var { background: none; color: inherit; padding: 0; } }
</style>`;

/**
 * Тело системного шаблона с пилюлями переменных. Оно же — стартовая
 * точка редактора («Подправить шаблон» / «Документы → Шаблоны»).
 */
export function renderBuyoutSystemForEditor(): string {
  const p = pill;
  return `
<div class="city"><span>${p("landlord.city")}</span><span>${p("buyout.dateLong")}</span></div>
<h1>Договор аренды транспортного средства<br>без экипажа с правом выкупа № ${p("buyout.number")}</h1>

<div class="para">Индивидуальный предприниматель <b>${p("landlord.fullName")}</b>, именуемый в дальнейшем «Арендодатель», действующий на основании свидетельства о государственной регистрации физического лица в качестве индивидуального предпринимателя, с одной стороны, и ${p("client.citizenshipPhrase")} <b>${p("client.name")}</b>. Дата рождения ${p("client.birthDate")}. Паспорт серия ${p("client.passportSeries")} номер ${p("client.passportNumber")}. Дата выдачи ${p("client.passportIssuedOn")}. Кем выдан: ${p("client.passportIssuer")}. Код подразделения ${p("client.passportDivisionCode")}. Зарегистрирован: ${p("client.passportRegistration")}. Тел. ${p("client.phone")}, именуемый в дальнейшем «Арендатор», с другой стороны, заключили настоящий Договор (далее — «Договор») о нижеследующем:</div>

<h2>1. Предмет договора</h2>
<div class="para"><b>1.1.</b> Арендодатель передаёт в срочное возмездное пользование Арендатору с правом дальнейшего выкупа принадлежащее Арендодателю на праве частной собственности транспортное средство, указанное в п. 2 настоящего договора.</div>
<div class="para"><b>1.2.</b> Имущество передаётся Арендатору для использования исключительно по целевому назначению.</div>
<div class="para"><b>1.3.</b> Транспортное средство принадлежит Арендодателю на праве собственности.</div>
<div class="para"><b>1.4.</b> Имущество предоставляется в аренду Арендатору сроком на ${p("buyout.termDays")} дней.</div>
<div class="para"><b>1.5.</b> Срок аренды истекает ${p("buyout.endDate")}, 12:00.</div>
<div class="para"><b>1.6.</b> Выкупная, согласованная сторонами, стоимость транспортного средства составляет <b>${p("buyout.total")}</b> (${p("buyout.totalWords")}) рублей.</div>

<h2>2. Предмет аренды</h2>
<div class="para"><b>2.1.</b> Предметом аренды по договору является: ${p("buyout.subject")}.</div>

<h2>3. Условия договора</h2>
<div class="para"><b>3.1.</b> Арендодатель предоставляет транспортное средство в исправном состоянии по Акту приёма-передачи, являющемуся неотъемлемой частью настоящего договора.</div>
<div class="para"><b>3.2.</b> Арендатор становится собственником арендуемого транспортного средства до истечения срока действия договора при условии внесения всей обусловленной договором выкупной цены.</div>
<div class="para"><b>3.3.</b> Арендодатель передаёт документы на право собственности на транспортное средство Арендатору при выполнении Арендатором п. 3.2 настоящего договора.</div>
<div class="para"><b>3.4.</b> Арендатор обязуется в случае расторжения договора вернуть транспортное средство Арендодателю по адресу г. Краснодар, ул. Корницкого, 47 в состоянии, соответствующем отражённому в Акте приёма-передачи, с учётом нормального износа, и оплатить фактические дни пользования транспортным средством.</div>
<div class="para"><b>3.5.</b> Арендатор по договору несёт расходы на содержание арендованного транспортного средства в течение всего периода аренды, а также расходы, возникающие в связи с эксплуатацией арендованного транспортного средства.</div>
<div class="para"><b>3.6.</b> Все поступающие от Арендатора платежи, включая гарантийный взнос, подлежат списанию в следующем порядке: в первую очередь — административные штрафы; во вторую очередь — возмещение ущерба по ремонту транспортного средства; в третью очередь — неустойка за неисполнение условий договора; в четвёртую очередь — арендная плата; в пятую очередь — погашение выкупной стоимости.</div>

<h2>4. Арендная плата и порядок выплат</h2>
<div class="para"><b>4.1.</b> Согласно п. 3.2 настоящего договора арендная плата является выкупной стоимостью транспортного средства.</div>
<div class="para"><b>4.2.</b> Арендатор обязуется платить за аренду транспортного средства <b>${p("buyout.paymentAmount")}</b> (${p("buyout.paymentAmountWords")}) рублей ${p("buyout.periodWord")}; всё уплаченное сверх этой суммы засчитывается в счёт выкупной стоимости транспортного средства.</div>
<div class="para"><b>4.3.</b> Арендатор оплачивает гарантийный взнос (аванс) в размере <b>${p("buyout.downPayment")}</b> (${p("buyout.downPaymentWords")}) рублей.</div>
<div class="para"><b>4.4.</b> График платежей (всего платежей: ${p("buyout.paymentsCount")}, остаток к выплате ${p("buyout.financed")} рублей):</div>
${p("buyout.scheduleTable")}

<h2>5. Права и обязанности сторон</h2>
<div class="para"><b>5.1.</b> Права и обязанности Арендодателя:</div>
<div class="para sub"><b>5.1.1.</b> Арендодатель обязан в 3-дневный срок с момента подписания настоящего договора передать Арендатору транспортное средство в технически исправном состоянии, полностью укомплектованным, свободным от прав третьих лиц. Приём и сдача транспортного средства производится по приёмо-сдаточному акту (Приложение № 1 к Договору).</div>
<div class="para sub"><b>5.1.2.</b> Передать Арендатору документы, относящиеся к транспортному средству и необходимые для нормальной эксплуатации.</div>
<div class="para sub"><b>5.1.3.</b> Арендодатель вправе проверять состояние ТС. Для этого Арендодатель не позднее 2 дней до дня проверки уведомляет Арендатора об этом. Арендатор не вправе препятствовать проведению осмотра транспортного средства.</div>
<div class="para sub"><b>5.1.4.</b> В случае сокрытия повреждений арендуемого транспортного средства Арендатором (независимо от наличия вины Арендатора) Арендодатель имеет право востребовать реальный ущерб, а также упущенную выгоду (п. 2 ст. 15 ГК РФ), провести независимую экспертизу.</div>
<div class="para sub"><b>5.1.5.</b> Арендодатель вправе расторгнуть договор и изъять транспортное средство без информирования Арендатора в случае просрочки платежа более чем на 7 дней.</div>
<div class="para sub"><b>5.1.6.</b> Арендодатель вправе расторгнуть договор и изъять транспортное средство по причине халатного отношения к транспортному средству либо неисполнения условий договора.</div>
<div class="para"><b>5.2.</b> Права и обязанности Арендатора:</div>
<div class="para sub"><b>5.2.1.</b> Арендатор обязан осмотреть состояние и комплектацию транспортного средства и принять его от Арендодателя, подписав акт приёма-передачи транспортного средства (Приложение № 1). Все замечания по ТС принимаются в письменном виде в месте заключения настоящего договора.</div>
<div class="para sub"><b>5.2.1.1.</b> Арендатор обязан ознакомиться с инструкцией по эксплуатации имущества и использовать имущество в строгом соответствии с ней.</div>
<div class="para sub"><b>5.2.2.</b> Арендатор обязуется использовать транспортное средство в строгом соответствии с его назначением, соблюдать Правила дорожного движения, нести ответственность за соблюдение требований по профилактике и учёту ДТП, содержать транспортное средство в технически исправном состоянии (производить замену масла в двигателе каждые 3 500 км), иметь при себе необходимые документы, требуемые сотрудниками ГИБДД. Арендатор обязуется строго соблюдать все требования по эксплуатации транспортного средства.</div>
<div class="para sub"><b>5.2.3.</b> Арендатор обязуется своевременно извещать Арендодателя и страховую компанию о ДТП, оформлять все необходимые документы для ГИБДД и страховой компании. В случае невыполнения данных требований Арендатор несёт полную материальную ответственность за повреждения, полученные в результате ДТП.</div>
<div class="para sub"><b>5.2.3.1.</b> Арендодатель является выгодоприобретателем во взаимоотношениях со страховыми компаниями на протяжении всего срока аренды транспортного средства.</div>
<div class="para sub"><b>5.2.4.</b> Арендатор не вправе заменять номерные агрегаты, установленные на ТС, без предварительного письменного согласия Арендодателя, а также нарушать пломбировочные покрытия, а конкретно поверхность пломбировочной краски и пломбировочных наклеек.</div>
<div class="para sub"><b>5.2.5.</b> При повреждении, утрате транспортного средства Арендатор обязуется незамедлительно известить об этом Арендодателя, а также уведомить о страховом случае страховую организацию в соответствии с договором страхования и законодательством.</div>
<div class="para sub"><b>5.2.5.1.</b> Арендатору запрещается эксплуатировать транспортное средство при нахождении его в любой форме опьянения. При нарушении этого пункта Арендатор несёт персональную ответственность в соответствии с законами РФ, а данный договор будет считаться расторгнутым.</div>
<div class="para sub"><b>5.2.6.</b> При ДТП, совершённом по вине Арендатора, в случаях, не относящихся к страховым случаям по договорам страхования (в том числе алкогольного опьянения и др.), Арендатор обязуется произвести все предусмотренные законом и настоящим договором действия для возврата Арендодателю повреждённого транспортного средства и возместить в течение 10 дней убытки Арендодателю либо выплатить Арендодателю остаточную стоимость транспортного средства (выкупить транспортное средство по остаточной стоимости).</div>
<div class="para sub"><b>5.2.7.</b> Обеспечить сохранность регистрационных и других необходимых для эксплуатации документов. В случае их утраты, независимо от наличия вины Арендатора, Арендатор обязуется возместить расходы Арендодателю по их восстановлению.</div>
<div class="para sub"><b>5.2.8.</b> Арендатор обязуется возместить в полном объёме ущерб, причинённый третьим лицам при эксплуатации транспортного средства (ст. 648 ГК РФ). В случае предъявления третьими лицами требований о возмещении ущерба к Арендодателю Арендатор обязан участвовать в судебных процессах по данному случаю, представить Арендодателю все документы, связанные с причинением ущерба, возместить Арендодателю все расходы по судебным процессам.</div>
<div class="para sub"><b>5.2.9.</b> По истечении срока действия Договора, если Арендатор не стал собственником транспортного средства согласно настоящему договору, а также в случае его досрочного расторжения, вернуть в течение 3 (трёх) дней со дня наступления указанного срока транспортное средство в технически исправном состоянии (с учётом нормального износа) в комплектации, полученной от Арендодателя, и оплатить фактические дни пользования транспортным средством. Передача осуществляется в порядке, установленном настоящим договором. Факт передачи оформляется актом приёма-передачи транспортного средства (Приложение № 2).</div>
<div class="para sub"><b>5.2.10.</b> При возвращении транспортного средства Арендодателю Арендатор обязан вернуть транспортное средство в комплектации, соответствующей акту приёма-передачи (Приложение № 1). При возврате транспортного средства с нарушением комплектности Арендатор уплачивает Арендодателю стоимость невозвращённого оборудования.</div>
<div class="para sub"><b>5.2.12.</b> Арендатору запрещается: сдавать транспортное средство в субаренду, закладывать в ломбард, оставлять в качестве залога под заём у третьих лиц, использовать в такси, совершать какие-либо регистрационные действия и действия по его отчуждению, а также допускать к управлению транспортным средством третьих лиц.</div>
<div class="para sub"><b>5.2.13.</b> Арендатор гарантирует, что: он имеет все необходимые разрешения, лицензии и удостоверения на управление ТС; он ни в одной стране ранее не был лишён права управления транспортным средством; в отношении него не имеется судебного решения о лишении водительского удостоверения и не проводится судебное разбирательство вследствие совершения дорожно-транспортного происшествия (далее — ДТП), фактов уголовного разбирательства вследствие совершения ДТП, фактов уголовного преследования; у него отсутствуют физические и/или психические заболевания, расстройства и иные обстоятельства, являющиеся препятствием к управлению транспортными средствами; он не был отстранён от управления ТС вследствие употребления алкоголя, наркотических веществ или иных запрещённых препаратов.</div>
<div class="para sub"><b>5.2.14.</b> Арендатор обязуется привозить арендуемое транспортное средство на осмотр Арендодателю по адресу г. Краснодар, ул. Корницкого, д. 47 каждое 15-е и 1-е число каждого месяца.</div>
<div class="para sub"><b>5.2.15.</b> Арендатор обязуется не выезжать на данном ТС за пределы г. Краснодара, за исключением случаев, письменно согласованных с Арендодателем. Штраф за несогласованный выезд за пределы г. Краснодара составляет 5 000 (пять тысяч) рублей. Арендатор обязуется оплатить все затраты по ремонту скутера и доставке в г. Краснодар в случае их возникновения за пределами г. Краснодара.</div>
<div class="para sub"><b>5.2.16.</b> При изменении своего адреса места жительства/регистрации, других реквизитов и контактных данных известить об этом Арендодателя в течение пяти рабочих дней со дня изменения.</div>
<div class="para sub"><b>5.2.17.</b> В случае расторжения договора Арендатором в одностороннем порядке в результате ДТП и ремонта ТС по ОСАГО Арендатор обязуется оплатить понесённые Арендодателем расходы, связанные с простоем ТС, из расчёта 700 рублей за сутки и до момента полного погашения задолженности по повреждениям ТС.</div>
<div class="para sub"><b>5.2.18.</b> Арендатору запрещается использовать транспортное средство в случае отсутствия оплаты по договору. При просрочке оплаты более чем на 7 дней необходимо вернуть транспортное средство Арендодателю до полного погашения задолженности. Штраф за отказ от добровольного возврата имущества составляет 10 000 (десять тысяч) рублей.</div>
<div class="para sub"><b>5.2.19.</b> Арендатору запрещается снимать фирменные наклейки и рекламные таблички со скутеров. Штраф за самовольное снятие рекламных материалов со скутера и шлема — 1 000 рублей.</div>

<h2>6. Ответственность сторон</h2>
<div class="para"><b>6.1.</b> За неисполнение или ненадлежащее исполнение своих обязательств по настоящему договору Стороны несут ответственность в соответствии с действующим законодательством Российской Федерации.</div>
<div class="para"><b>6.2.</b> Арендатор самостоятельно несёт гражданско-правовую ответственность за вред, причинённый транспортным средствам третьих лиц либо третьим лицам. Арендодатель не несёт ответственности за виды вреда, предусмотренные ГК РФ, причинённого третьим лицам.</div>
<div class="para"><b>6.2.1.</b> В случае попадания транспортного средства в ДТП Арендатор оплачивает штраф в размере 2 000 (двух тысяч) рублей Арендодателю, а также несёт ответственность в соответствии с законами РФ.</div>
<div class="para"><b>6.3.</b> За просрочку выполнения обязательства, указанного в п. 5.2.9, п. 4.2 и п. 6.6 настоящего Договора, Арендатор уплачивает Арендодателю сумму в размере 700 (семьсот) рублей за каждый день просрочки.</div>
<div class="para"><b>6.4.</b> В случае летального исхода Арендатора или Арендодателя действие договора распространяется на наследников по закону либо по завещанию.</div>
<div class="para"><b>6.5.</b> В случае неисполнения денежных обязательств Арендатора перед Арендодателем подлежат уплате проценты на сумму долга в соответствии со ст. 395 ГК РФ.</div>
<div class="para"><b>6.6.</b> В случае неисполнения денежных обязательств Арендатора перед Арендодателем Арендодатель имеет право востребовать с Арендатора сумму морального вреда в размере 5 000 рублей, а также требовать возмещения стоимости юридических услуг, которыми он воспользовался.</div>
<div class="para"><b>6.7.</b> При просрочке Арендатором возврата транспортного средства, а равно в случае, когда Арендодатель был вынужден изымать транспортное средство своими силами при отказе Арендатора вернуть транспортное средство в добровольном порядке, взимается штраф в размере 5 000 (пяти тысяч) рублей, а также Арендатор оплачивает Арендодателю все расходы, которые Арендодатель понёс в связи с необходимостью возврата транспортного средства своими силами.</div>
<div class="para"><b>6.8.</b> В случае повреждения Имущества, при возврате Имущества в некомплекте, появления на Имуществе трещин, дыр или разрывов, механических повреждений ЛКП, а также вмятин на корпусе или следов падения, или следов самостоятельного вскрытия гарантийных пломб Арендатор обязан в бесспорном порядке возместить стоимость причинённого ущерба и оплатить штраф в размере 5 000 (пять тысяч) рублей. Стороны договорились, что заключение о сумме ремонта, выданное Арендодателем, является достаточным для оценки стоимости ущерба.</div>
<div class="para"><b>6.9.</b> Арендатор обязан не допускать самостоятельного ремонта Имущества. При поломке Имущества немедленно сообщить Арендодателю. Арендатор обязуется возместить расходы Арендодателю по устранению последствий неквалифицированного ремонта в случае обнаружения такового, а также сумму в размере 10 000 (десяти тысяч) рублей как штраф за самостоятельный ремонт либо передачу техники в ремонт в сторонний сервис.</div>
<div class="para"><b>6.10.</b> Если в результате нарушения Арендатором правил дорожного движения и/или управления транспортным средством без водительского удостоверения соответствующей категории транспортное средство было направлено на штрафстоянку, Арендатор оплачивает штраф Арендодателю в размере 3 000 (трёх тысяч) рублей и самостоятельно оплачивает все расходы по эвакуации и хранению ТС на штрафстоянке.</div>

<h2>7. Действие договора</h2>
<div class="para"><b>7.1.</b> Настоящий договор вступает в силу с момента подписания и действует в течение ${p("buyout.validityDays")} дней, до ${p("buyout.validityEnd")}, 12:00 включительно.</div>
<div class="para"><b>7.2.</b> Договор может быть расторгнут досрочно по письменному соглашению Сторон.</div>
<div class="para"><b>7.3.</b> Настоящий Договор может быть расторгнут по инициативе одной из сторон. Сторона, являющаяся инициатором расторжения настоящего договора, обязана письменно уведомить другую о своём намерении в срок не позднее 2 дней до предполагаемой даты расторжения договора.</div>
<div class="para"><b>7.4.</b> В случае расторжения Договора по письменному соглашению Сторон перечисленная Арендатором выкупная цена не возмещается.</div>

<h2>8. Разрешение споров</h2>
<div class="para"><b>8.1.</b> Споры, которые могут возникнуть при исполнении настоящего договора, Стороны будут стремиться разрешать путём переговоров.</div>
<div class="para"><b>8.2.</b> Стороны договорились, что все споры по настоящему договору решаются в соответствии с законодательством РФ в Ленинском районном суде г. Краснодара или в Мировом суде судебного участка № 24 Западного внутригородского округа г. Краснодара.</div>

<h2>9. Заключительные положения</h2>
<div class="para"><b>9.1.</b> Договор может быть изменён по письменному соглашению Сторон.</div>
<div class="para"><b>9.2.</b> В части, не урегулированной настоящим Договором, Стороны руководствуются действующим законодательством Российской Федерации.</div>
<div class="para"><b>9.3.</b> Договор составлен в двух экземплярах, по одному для каждой Стороны, и имеет одинаковую юридическую силу.</div>
<div class="para"><b>9.4.</b> Условия настоящего договора являются конфиденциальными и не подлежат разглашению третьим лицам без письменного согласия другой Стороны.</div>
<div class="para"><b>9.5.</b> Все приложения к настоящему договору имеют юридическую силу, если они составлены в письменной форме и подписаны обеими Сторонами.</div>
<div class="para"><b>9.6.</b> В случае возникновения споров Стороны будут стремиться к разрешению их путём переговоров. При недостижении согласия спор передаётся на рассмотрение суда в соответствии с действующим законодательством РФ.</div>
<div class="para"><b>9.7.</b> Арендатор даёт своё согласие на передачу и обработку персональных данных Арендодателем любыми способами, предусмотренными п. 3 ст. 3 Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных», с целью заключения и исполнения настоящего Договора, а также в целях исполнения Арендодателем требований законодательства, регулирующего взаимоотношения организаций и налогового органа с физическим лицом, в течение срока, необходимого для достижения указанных целей, и 3 (трёх) лет после их достижения.</div>

<h2>10. Адреса, реквизиты и подписи сторон</h2>
<table class="req">
  <tr>
    <td><b>Арендатор:</b> ${p("client.name")}. Дата рождения ${p("client.birthDate")}. Паспорт серия ${p("client.passportSeries")} номер ${p("client.passportNumber")}. Дата выдачи ${p("client.passportIssuedOn")}. Кем выдан: ${p("client.passportIssuer")}. Код подразделения ${p("client.passportDivisionCode")}. Зарегистрирован: ${p("client.passportRegistration")}. Тел. ${p("client.phone")}</td>
    <td><b>Арендодатель:</b> ИП ${p("landlord.fullName")}, 350000, Краснодарский край, ${p("landlord.city")}. ИНН: ${p("landlord.inn")}; ОГРН: ${p("landlord.ogrn")}. Тел. ${p("landlord.phone")}</td>
  </tr>
</table>
<div class="sig">
  <div><div class="line"></div><div class="small">Арендатор: ${p("client.name")}, подпись</div></div>
  <div><div class="line"></div><div class="small">Арендодатель: ${p("landlord.fullName")}, подпись</div></div>
</div>

<div style="page-break-before: always"></div>
<div class="act">
  <div class="right small">Приложение № 1 к договору № ${p("buyout.number")} от ${p("buyout.date")}</div>
  <h1>Акт приёма-передачи</h1>
  <div class="city"><span>${p("landlord.city")}</span><span>${p("buyout.date")}</span></div>
  <div class="para"><b>Арендатор:</b> ${p("client.citizenshipPhrase")} ${p("client.name")}. Дата рождения ${p("client.birthDate")}. Паспорт серия ${p("client.passportSeries")} номер ${p("client.passportNumber")}. Дата выдачи ${p("client.passportIssuedOn")}. Кем выдан: ${p("client.passportIssuer")}. Код подразделения ${p("client.passportDivisionCode")}. Зарегистрирован: ${p("client.passportRegistration")}. Тел. ${p("client.phone")}</div>
  <div class="para"><b>Арендодатель:</b> ${p("landlord.fullName")}, паспорт серия ${p("landlord.passportSeries")} номер ${p("landlord.passportNumber")}, выдан ${p("landlord.passportIssuer")}, зарегистрирован по адресу: ${p("landlord.registrationAddress")}</div>
  <div class="para">составили настоящий акт о нижеследующем:</div>
  <div class="para">В соответствии с Договором аренды транспортного средства с правом выкупа № ${p("buyout.number")} Арендодатель передал, а Арендатор принял скутер:</div>
  <div class="spec">Марки, модели: <b>${p("buyout.scooterModel")}</b></div>
  <div class="spec">Наименование (тип ТС): Мопед</div>
  <div class="spec">Категория ТС: M</div>
  <div class="spec">Год выпуска: ${p("buyout.scooterYear")}</div>
  <div class="spec">№ двигателя: ${p("buyout.scooterEngine")}</div>
  <div class="spec">№ шасси (рама) / VIN: ${p("buyout.scooterFrame")}</div>
  <div class="spec">Цвет: ${p("buyout.scooterColor")}</div>
  <div class="spec">Пробег при передаче: ${p("buyout.scooterMileage")} км</div>
  <div class="spec">Техническое состояние скутера:</div>
  <div class="lines"></div><div class="lines"></div>
  <div class="para">Одновременно со скутером Арендодатель передал, а Арендатор принял следующие запасные части, аксессуары, дополнительное оборудование:</div>
  <div class="lines"></div><div class="lines"></div>
  <div class="para">Идентификационные номера сверены, комплектность проверена. Претензий к Арендодателю, в том числе имущественных, Арендатор не имеет.</div>
  <div class="para">Арендатор обязуется возместить Арендодателю расходы на устранение повреждений, полученных при эксплуатации скутера, согласно п. 1 настоящего Акта, в размере <span class="fill"></span> рублей.</div>
  <div class="sig">
    <div><div class="line"></div><div class="small">Арендодатель: ${p("landlord.fullName")}, подпись</div></div>
    <div><div class="line"></div><div class="small">Арендатор: ${p("client.name")}, подпись</div></div>
  </div>
</div>
`;
}

function wrapAsPage(title: string, body: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(title)}</title>${CSS}</head><body>
<div class="wrap">
${body}
</div>
</body></html>`;
}

/** Готовый договор: override из «Шаблонов» или системный текст + данные сделки. */
export async function renderBuyoutHtml(b: BuyoutBundle): Promise<string> {
  const [override] = await db
    .select()
    .from(documentTemplates)
    .where(eq(documentTemplates.templateKey, "contract_buyout"));
  const body = substituteBuyoutVariables(
    override ? override.body : renderBuyoutSystemForEditor(),
    b,
  );
  return wrapAsPage(
    `Договор аренды с правом выкупа № ${String(b.deal.id).padStart(4, "0")}`,
    body,
  );
}

/** Word-копия: тот же HTML без @page и с office-неймспейсами. */
export async function renderBuyoutHtmlForWord(b: BuyoutBundle): Promise<string> {
  const html = await renderBuyoutHtml(b);
  const stripped = html.replace(/@page\s*\{[^}]*\}/g, "");
  return stripped.replace(
    '<html lang="ru">',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ru">',
  );
}
