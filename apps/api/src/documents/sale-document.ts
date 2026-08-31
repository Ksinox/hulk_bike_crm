/**
 * Договор купли-продажи техники (блок «Продажи», 31.08).
 *
 * Самостоятельный документ: собирает данные сделки, покупателя и техники,
 * отдаёт готовый HTML (печать из браузера) либо Word-копию. Формат и стили
 * — те же, что у остальных документов CRM (Times New Roman, A4, поля 18/16).
 */
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  saleDeals,
  saleManagers,
  scooterModels,
  scooters,
} from "../db/schema.js";
import { LANDLORD } from "./landlord.js";

export type SaleBundle = {
  deal: typeof saleDeals.$inferSelect;
  client: typeof clients.$inferSelect | null;
  scooter: typeof scooters.$inferSelect | null;
  model: typeof scooterModels.$inferSelect | null;
  manager: typeof saleManagers.$inferSelect | null;
};

export async function loadSaleBundle(id: number): Promise<SaleBundle | null> {
  const [deal] = await db.select().from(saleDeals).where(eq(saleDeals.id, id));
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
  const [manager] = deal.managerId
    ? await db.select().from(saleManagers).where(eq(saleManagers.id, deal.managerId))
    : [];
  return {
    deal,
    client: client ?? null,
    scooter: scooter ?? null,
    model: model ?? null,
    manager: manager ?? null,
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

function fmtMoney(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("ru-RU");
}

function fmtDateRu(d: Date | string | null | undefined): string {
  if (!d) return "____________";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "____________";
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** «150000 → Сто пятьдесят тысяч». */
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
  const millions = Math.floor(num / 1_000_000);
  const thousands = Math.floor((num % 1_000_000) / 1000);
  const ones = num % 1000;
  const parts: string[] = [];
  if (millions > 0) {
    const w =
      millions % 10 === 1 && millions % 100 !== 11
        ? "миллион"
        : millions % 10 >= 2 && millions % 10 <= 4 && (millions % 100 < 12 || millions % 100 > 14)
          ? "миллиона"
          : "миллионов";
    parts.push(`${triple(millions)} ${w}`);
  }
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
  table.spec { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 10.5pt; }
  table.spec td { border: 1px solid #000; padding: 4pt 6pt; vertical-align: top; }
  table.spec td.k { width: 42%; background: #f2f2f2; }
  .sig { margin-top: 26pt; display: flex; justify-content: space-between; gap: 20pt; page-break-inside: avoid; }
  .sig > div { width: 48%; }
  .sig .line { border-bottom: 1px solid #000; height: 26pt; margin-bottom: 2pt; }
  .small { font-size: 9.5pt; color: #444; }
  .wrap { background: #fff; }
  @media screen { body { background: #f5f5f5; } .wrap { margin: 0 auto; padding: 16pt; max-width: 820px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); } }
  @media print { .noprint { display: none !important; } }
</style>`;

/** Паспортные данные покупателя одной строкой. */
function buyerPassport(c: SaleBundle["client"]): string {
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

function techName(b: SaleBundle): string {
  return escape(b.model?.name ?? b.deal.modelName ?? b.deal.scooterName ?? "скутер");
}

export function renderSaleHtmlSystem(b: SaleBundle): string {
  const { deal, client, scooter } = b;
  const price = deal.price ?? 0;
  const num = String(deal.id).padStart(4, "0");
  const dateStr = fmtDateRu(deal.signedAt ?? deal.contractAt ?? deal.createdAt);

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Договор купли-продажи № ${num}</title>${CSS}</head><body>
<div class="wrap">
  <h1>ДОГОВОР КУПЛИ-ПРОДАЖИ ТРАНСПОРТНОГО СРЕДСТВА № ${num}</h1>
  <div class="city"><span>${escape(LANDLORD.city)}</span><span>${dateStr}</span></div>

  <div class="para">
    Гр. <b>${escape(LANDLORD.fullName)}</b>, паспорт ${escape(LANDLORD.passportSeries)} ${escape(LANDLORD.passportNumber)},
    выдан ${escape(LANDLORD.passportIssuedOn)} ${escape(LANDLORD.passportIssuer)},
    код подразделения ${escape(LANDLORD.passportDivisionCode)},
    зарегистрирован по адресу: ${escape(LANDLORD.registrationAddress)},
    именуемый в дальнейшем «<b>Продавец</b>», с одной стороны, и
    гр. <b>${escape(client?.name) || "____________________________"}</b>, ${buyerPassport(client)},
    именуемый в дальнейшем «<b>Покупатель</b>», с другой стороны,
    заключили настоящий договор о нижеследующем.
  </div>

  <h2>1. Предмет договора</h2>
  <div class="para"><b>1.1.</b> Продавец продал, а Покупатель купил и оплатил транспортное средство со следующими характеристиками:</div>
  <table class="spec">
    <tr><td class="k">Наименование, марка, модель</td><td>${techName(b)}</td></tr>
    <tr><td class="k">Год выпуска</td><td>${escape(scooter?.year ? String(scooter.year) : "—")}</td></tr>
    <tr><td class="k">Идентификационный номер (VIN) / № рамы</td><td>${escape(deal.vin || deal.frameNumber || "—")}</td></tr>
    <tr><td class="k">Номер двигателя</td><td>${escape(deal.engineNo || "—")}</td></tr>
    <tr><td class="k">Цвет</td><td>${escape(scooter?.color || "—")}</td></tr>
    <tr><td class="k">Показания одометра на момент продажи</td><td>${fmtMoney(deal.mileage ?? scooter?.mileage ?? 0)} км</td></tr>
  </table>
  <div class="para"><b>1.2.</b> Продавец гарантирует, что указанное транспортное средство принадлежит ему на праве собственности, не заложено, не арестовано, не является предметом исков третьих лиц.</div>

  <h2>2. Цена и порядок расчётов</h2>
  <div class="para"><b>2.1.</b> Стоимость транспортного средства составляет <b>${fmtMoney(price)}</b> (${moneyWords(price)}) рублей 00 копеек.</div>
  <div class="para"><b>2.2.</b> Расчёт между сторонами произведён полностью в момент подписания настоящего договора.</div>

  <h2>3. Передача транспортного средства</h2>
  <div class="para"><b>3.1.</b> Продавец передал, а Покупатель принял указанное транспортное средство, ключи и относящиеся к нему документы в момент подписания настоящего договора. Настоящий договор одновременно является актом приёма-передачи.</div>
  <div class="para"><b>3.2.</b> Покупатель осмотрел транспортное средство, проверил его техническое состояние и претензий к внешнему виду и комплектности не имеет. Транспортное средство продаётся в состоянии «как есть», бывшим в употреблении, с учётом естественного износа.</div>
  <div class="para"><b>3.3.</b> Право собственности на транспортное средство переходит к Покупателю с момента подписания настоящего договора.</div>

  <h2>4. Заключительные положения</h2>
  <div class="para"><b>4.1.</b> Настоящий договор составлен в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из сторон.</div>
  <div class="para"><b>4.2.</b> Обязанность по постановке транспортного средства на регистрационный учёт возлагается на Покупателя.</div>
  <div class="para"><b>4.3.</b> Все споры разрешаются сторонами путём переговоров, а при недостижении согласия — в порядке, установленном законодательством РФ.</div>

  <div class="sig">
    <div>
      <div><b>Продавец</b></div>
      <div class="small">${escape(LANDLORD.fullName)}<br>тел. ${escape(LANDLORD.phone)}</div>
      <div class="line"></div>
      <div class="small">подпись</div>
    </div>
    <div>
      <div><b>Покупатель</b></div>
      <div class="small">${escape(client?.name) || "____________________"}<br>тел. ${escape(client?.phone) || "____________"}</div>
      <div class="line"></div>
      <div class="small">подпись</div>
    </div>
  </div>

  <div class="small" style="margin-top:14pt;">Денежные средства получил, транспортное средство передал: ______________ / ${escape(LANDLORD.fullName)}</div>
  <div class="small">Транспортное средство получил, претензий не имею: ______________ / ${escape(client?.name) || "____________________"}</div>
</div>
</body></html>`;
}

export async function renderSaleHtml(b: SaleBundle): Promise<string> {
  return renderSaleHtmlSystem(b);
}

/** Word-копия: тот же HTML без @page и с office-неймспейсами. */
export async function renderSaleHtmlForWord(b: SaleBundle): Promise<string> {
  const html = await renderSaleHtml(b);
  const stripped = html.replace(/@page\s*\{[^}]*\}/g, "");
  return stripped.replace(
    '<html lang="ru">',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ru">',
  );
}
