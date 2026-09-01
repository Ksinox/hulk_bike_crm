/**
 * Договор аренды с правом выкупа (01.09).
 *
 * Отдельный документ: в отличие от купли-продажи здесь техника остаётся
 * нашей до последнего платежа, а в тексте нужен график — сколько, когда и
 * какими платежами клиент гасит остаток.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  buyoutDeals,
  buyoutSchedule,
  clients,
  scooterModels,
  scooters,
} from "../db/schema.js";
import { LANDLORD } from "./landlord.js";

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

function escape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("ru-RU");

function fmtDateRu(d: Date | string | null | undefined): string {
  if (!d) return "____________";
  const date = typeof d === "string" ? new Date(`${d}T00:00:00`) : d;
  if (Number.isNaN(date.getTime())) return "____________";
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function moneyWords(n: number | null | undefined): string {
  if (!n) return "ноль";
  const num = Math.abs(Math.round(n));
  const u = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const t = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const h = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
  const triple = (n3: number, fem = false): string => {
    const out: string[] = [];
    if (n3 >= 100) out.push(h[Math.floor(n3 / 100)] ?? "");
    const rem = n3 % 100;
    if (rem >= 10 && rem < 20) out.push(teens[rem - 10] ?? "");
    else {
      if (rem >= 20) out.push(t[Math.floor(rem / 10)] ?? "");
      const last = rem % 10;
      if (last) {
        if (fem && last === 1) out.push("одна");
        else if (fem && last === 2) out.push("две");
        else out.push(u[last] ?? "");
      }
    }
    return out.filter(Boolean).join(" ");
  };
  const thousands = Math.floor(num / 1000);
  const ones = num % 1000;
  const parts: string[] = [];
  if (thousands > 0) {
    const w =
      thousands % 10 === 1 && thousands % 100 !== 11
        ? "тысяча"
        : thousands % 10 >= 2 && thousands % 10 <= 4 && (thousands % 100 < 12 || thousands % 100 > 14)
          ? "тысячи"
          : "тысяч";
    parts.push(`${triple(thousands, true)} ${w}`);
  }
  if (ones > 0 || parts.length === 0) parts.push(triple(ones));
  const r = parts.join(" ").trim();
  return r.charAt(0).toUpperCase() + r.slice(1);
}

const CSS = `
<style>
  @page { size: A4 portrait; margin: 18mm 16mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; line-height: 1.5; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4pt; font-weight: bold; }
  .city { display: flex; justify-content: space-between; margin: 10pt 0 14pt; }
  h2 { font-size: 12pt; font-weight: bold; margin: 12pt 0 6pt; }
  .para { margin: 6pt 0; text-align: justify; }
  table.spec, table.sched { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10.5pt; }
  table.spec td, table.sched td, table.sched th { border: 1px solid #000; padding: 4pt 6pt; vertical-align: top; }
  table.spec td.k { width: 42%; background: #f2f2f2; }
  table.sched th { background: #eee; font-weight: bold; }
  table.sched td.num { text-align: right; white-space: nowrap; }
  .sig { margin-top: 26pt; display: flex; justify-content: space-between; gap: 20pt; page-break-inside: avoid; }
  .sig > div { width: 48%; }
  .sig .line { border-bottom: 1px solid #000; height: 26pt; margin-bottom: 2pt; }
  .small { font-size: 9.5pt; color: #444; }
  .wrap { background: #fff; }
  @media screen { body { background: #f5f5f5; } .wrap { margin: 0 auto; padding: 16pt; max-width: 820px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); } }
</style>`;

function buyerPassport(c: BuyoutBundle["client"]): string {
  if (!c) return "____________________________";
  if (c.isForeigner && c.passportRaw) return escape(c.passportRaw);
  const parts: string[] = [];
  if (c.passportSeries || c.passportNumber) {
    parts.push(`паспорт ${escape(c.passportSeries)} ${escape(c.passportNumber)}`);
  }
  if (c.passportIssuedOn) parts.push(`выдан ${fmtDateRu(c.passportIssuedOn)}`);
  if (c.passportIssuer) parts.push(escape(c.passportIssuer));
  if (c.passportDivisionCode) parts.push(`код подразделения ${escape(c.passportDivisionCode)}`);
  if (c.passportRegistration) parts.push(`зарегистрирован(а): ${escape(c.passportRegistration)}`);
  return parts.length ? parts.join(", ") : "____________________________";
}

export function renderBuyoutHtmlSystem(b: BuyoutBundle): string {
  const { deal, client, scooter, model, schedule } = b;
  const num = String(deal.id).padStart(4, "0");
  const dateStr = fmtDateRu(deal.signedAt ?? deal.contractAt ?? deal.createdAt);
  const periodWord = deal.period === "week" ? "еженедельно" : "ежемесячно";
  const tech = escape(model?.name ?? deal.modelName ?? deal.scooterName ?? "скутер");

  const rows = schedule
    .map(
      (r) => `<tr>
        <td class="num">${r.seq}</td>
        <td>${fmtDateRu(r.dueDate)}</td>
        <td class="num">${fmt(r.amount)} ₽</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Договор аренды с правом выкупа № ${num}</title>${CSS}</head><body>
<div class="wrap">
  <h1>ДОГОВОР АРЕНДЫ ТРАНСПОРТНОГО СРЕДСТВА С ПРАВОМ ВЫКУПА № ${num}</h1>
  <div class="city"><span>${escape(LANDLORD.city)}</span><span>${dateStr}</span></div>

  <div class="para">
    Гр. <b>${escape(LANDLORD.fullName)}</b>, паспорт ${escape(LANDLORD.passportSeries)} ${escape(LANDLORD.passportNumber)},
    выдан ${escape(LANDLORD.passportIssuedOn)} ${escape(LANDLORD.passportIssuer)},
    зарегистрирован по адресу: ${escape(LANDLORD.registrationAddress)},
    именуемый в дальнейшем «<b>Арендодатель</b>», с одной стороны, и
    гр. <b>${escape(client?.name) || "____________________________"}</b>, ${buyerPassport(client)},
    именуемый в дальнейшем «<b>Арендатор</b>», с другой стороны, заключили
    настоящий договор о нижеследующем.
  </div>

  <h2>1. Предмет договора</h2>
  <div class="para"><b>1.1.</b> Арендодатель передаёт Арендатору во временное владение и пользование транспортное средство с правом последующего выкупа:</div>
  <table class="spec">
    <tr><td class="k">Наименование, марка, модель</td><td>${tech}</td></tr>
    <tr><td class="k">Год выпуска</td><td>${escape(scooter?.year ? String(scooter.year) : "—")}</td></tr>
    <tr><td class="k">Идентификационный номер (VIN) / № рамы</td><td>${escape(deal.vin || deal.frameNumber || "—")}</td></tr>
    <tr><td class="k">Номер двигателя</td><td>${escape(deal.engineNo || "—")}</td></tr>
    <tr><td class="k">Показания одометра на момент передачи</td><td>${fmt(deal.mileage ?? scooter?.mileage ?? 0)} км</td></tr>
  </table>
  <div class="para"><b>1.2.</b> Транспортное средство остаётся собственностью Арендодателя до полной выплаты выкупной стоимости, указанной в разделе 2.</div>
  <div class="para"><b>1.3.</b> Арендатор уведомлён и согласен, что на транспортном средстве установлено средство поиска (метка), необходимое для контроля сохранности имущества до перехода права собственности.</div>

  <h2>2. Выкупная стоимость и порядок расчётов</h2>
  <div class="para"><b>2.1.</b> Выкупная стоимость транспортного средства составляет <b>${fmt(deal.total)}</b> (${moneyWords(deal.total)}) рублей 00 копеек, из них стоимость транспортного средства ${fmt(deal.scooterPrice)} ₽ и вознаграждение за рассрочку на срок ${deal.termMonths} мес. — ${fmt(deal.markup)} ₽.</div>
  <div class="para"><b>2.2.</b> Первоначальный взнос — <b>${fmt(deal.downPayment)}</b> (${moneyWords(deal.downPayment)}) рублей — вносится Арендатором в день подписания настоящего договора.</div>
  <div class="para"><b>2.3.</b> Оставшаяся сумма <b>${fmt(deal.financed)}</b> (${moneyWords(deal.financed)}) рублей выплачивается ${periodWord} равными платежами по ${fmt(deal.paymentAmount)} ₽ согласно графику (раздел 3). Всего платежей: ${schedule.length || deal.paymentsCount}.</div>
  <div class="para"><b>2.4.</b> Арендатор вправе досрочно погасить остаток полностью или частично; при полном погашении право собственности переходит к Арендатору с момента внесения последнего платежа.</div>

  <h2>3. График платежей</h2>
  <table class="sched">
    <tr><th>№</th><th>Дата платежа</th><th>Сумма</th></tr>
    ${rows || `<tr><td colspan="3">График формируется при подписании договора.</td></tr>`}
  </table>

  <h2>4. Права и обязанности сторон</h2>
  <div class="para"><b>4.1.</b> Арендатор обязуется использовать транспортное средство по назначению, поддерживать его в исправном состоянии и нести расходы на его содержание.</div>
  <div class="para"><b>4.2.</b> До перехода права собственности Арендатор не вправе продавать, дарить, закладывать или иным образом отчуждать транспортное средство, а также передавать его третьим лицам.</div>
  <div class="para"><b>4.3.</b> При просрочке платежа более чем на 10 (десять) календарных дней Арендодатель вправе потребовать возврата транспортного средства и расторгнуть настоящий договор.</div>
  <div class="para"><b>4.4.</b> Риск случайной гибели или повреждения транспортного средства с момента передачи несёт Арендатор.</div>

  <h2>5. Заключительные положения</h2>
  <div class="para"><b>5.1.</b> Договор составлен в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из сторон.</div>
  <div class="para"><b>5.2.</b> Договор одновременно является актом приёма-передачи транспортного средства.</div>

  <div class="sig">
    <div>
      <div><b>Арендодатель</b></div>
      <div class="small">${escape(LANDLORD.fullName)}<br>тел. ${escape(LANDLORD.phone)}</div>
      <div class="line"></div>
      <div class="small">подпись</div>
    </div>
    <div>
      <div><b>Арендатор</b></div>
      <div class="small">${escape(client?.name) || "____________________"}<br>тел. ${escape(client?.phone) || "____________"}</div>
      <div class="line"></div>
      <div class="small">подпись</div>
    </div>
  </div>
</div>
</body></html>`;
}

export async function renderBuyoutHtml(b: BuyoutBundle): Promise<string> {
  return renderBuyoutHtmlSystem(b);
}

export async function renderBuyoutHtmlForWord(b: BuyoutBundle): Promise<string> {
  const html = await renderBuyoutHtml(b);
  return html
    .replace(/@page\s*\{[^}]*\}/g, "")
    .replace(
      '<html lang="ru">',
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ru">',
    );
}
