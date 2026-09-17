/**
 * Накладная по стороннему ремонту (выпуск 2.0.2, заказчик: «добавление
 * распечатки накладной по ремонту»).
 *
 * Документ для клиента: что делали, какие запчасти поставили, сколько к
 * оплате, сколько внесено авансом и какой остаток. Закупочных цен и прибыли
 * здесь нет. Пока ремонт в работе, накладная помечена как предварительная —
 * состав работ ещё может поменяться.
 *
 * Оформление — как у остальных документов CRM (Times New Roman, A4).
 */
import { LANDLORD } from "./landlord.js";
import { escape, moneyWords } from "./sale-document.js";

type InvoiceItem = { kind: string; name: string; qty: number; price: number };
type InvoicePayment = { kind: string; amount: number; method: string; paidAt: Date | string };
export type InvoiceOrder = {
  number: number;
  status: string;
  customerName: string;
  customerPhone: string | null;
  vehicle: string;
  vehicleNumber: string | null;
  complaint: string | null;
  acceptedAt: Date | string;
  completedAt: Date | string | null;
  paidAt: Date | string | null;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  totals: { works: number; parts: number; revenue: number; discount: number; due: number; paid: number; left: number };
};

const rub = (n: number) => Math.round(n).toLocaleString("ru-RU");

function day(d: Date | string | null | undefined, long = false): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: long ? "long" : "2-digit",
    year: "numeric",
  });
}

const METHOD: Record<string, string> = {
  cash: "наличные",
  transfer: "перевод",
  mixed: "наличные и перевод",
};

const STATUS: Record<string, string> = {
  in_work: "в работе",
  done: "готов к выдаче",
  paid: "оплачен",
  cancelled: "отменён",
};

function itemsTable(title: string, rows: InvoiceItem[], total: number): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (r, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td>${escape(r.name)}</td>
      <td class="c">${r.qty}</td>
      <td class="r">${rub(r.price)}</td>
      <td class="r">${rub(r.price * r.qty)}</td>
    </tr>`,
    )
    .join("");
  return `<h2>${title}</h2>
  <table class="grid">
    <thead><tr><th class="c" style="width:6%">№</th><th>Наименование</th><th class="c" style="width:10%">Кол-во</th><th class="r" style="width:16%">Цена, ₽</th><th class="r" style="width:17%">Сумма, ₽</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="4" class="r"><b>Итого</b></td><td class="r"><b>${rub(total)}</b></td></tr></tfoot>
  </table>`;
}

export function renderServiceInvoiceHtml(o: InvoiceOrder): string {
  const no = String(o.number).padStart(4, "0");
  const works = o.items.filter((i) => i.kind === "work");
  const parts = o.items.filter((i) => i.kind !== "work");
  const t = o.totals;
  const preliminary = o.status === "in_work";
  const moneyIn = o.payments.filter((p) => p.amount !== 0);

  const payRows = moneyIn
    .map((p) => {
      const what =
        p.kind === "advance" ? "Аванс" : p.kind === "refund" ? "Возврат клиенту" : "Оплата";
      return `<tr><td>${what} ${day(p.paidAt)} · ${METHOD[p.method] ?? p.method}</td><td class="r">${
        p.amount < 0 ? "− " : ""
      }${rub(Math.abs(p.amount))} ₽</td></tr>`;
    })
    .join("");

  const stateLine =
    o.status === "paid"
      ? `Оплачено полностью ${day(o.paidAt)}.`
      : t.left > 0
        ? `Остаток к оплате: <b>${rub(t.left)} ₽</b> (${moneyWords(t.left)} рублей 00 копеек).`
        : "Оплачено.";

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Накладная по ремонту № ${no}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; line-height: 1.4; }
  .wrap { background: #fff; }
  .top { display: flex; justify-content: space-between; gap: 16pt; font-size: 9.5pt; color: #333; border-bottom: 1px solid #000; padding-bottom: 6pt; }
  h1 { font-size: 15pt; text-align: center; margin: 14pt 0 2pt; }
  .sub { text-align: center; margin-bottom: 10pt; }
  .pre { text-align: center; font-size: 9.5pt; color: #444; margin: -4pt 0 10pt; }
  h2 { font-size: 11.5pt; margin: 12pt 0 4pt; }
  table { width: 100%; border-collapse: collapse; }
  table.spec td { border: 1px solid #000; padding: 3pt 6pt; vertical-align: top; }
  table.spec td.k { width: 30%; background: #f2f2f2; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 3pt 5pt; vertical-align: top; }
  table.grid th { background: #f2f2f2; font-weight: bold; text-align: left; }
  .c { text-align: center !important; }
  .r { text-align: right !important; white-space: nowrap; }
  .sum { width: 60%; margin: 12pt 0 0 auto; }
  .sum td { padding: 2pt 0; }
  .sum tr.big td { border-top: 1px solid #000; padding-top: 4pt; font-size: 12pt; font-weight: bold; }
  .words { margin-top: 8pt; }
  .note { margin-top: 10pt; font-size: 10pt; }
  .sig { margin-top: 26pt; display: flex; justify-content: space-between; gap: 20pt; page-break-inside: avoid; }
  .sig > div { width: 47%; }
  .sig .line { border-bottom: 1px solid #000; height: 24pt; margin-bottom: 2pt; }
  .small { font-size: 9.5pt; color: #444; }
  @media screen { body { background: #f5f5f5; } .wrap { margin: 0 auto; padding: 18pt; max-width: 820px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); } }
  @media screen and (max-width: 600px) { .wrap { padding: 12pt; } .top { flex-direction: column; gap: 2pt; } .sum { width: 100%; } }
</style></head><body>
<div class="wrap">
  <div class="top">
    <div>ИП ${escape(LANDLORD.fullName)}<br>ИНН ${escape(LANDLORD.inn)} · ОГРНИП ${escape(LANDLORD.ogrn)}</div>
    <div style="text-align:right">${escape(LANDLORD.city)}<br>тел. ${escape(LANDLORD.phone)}</div>
  </div>

  <h1>НАКЛАДНАЯ № ${no}</h1>
  <div class="sub">на ремонт техники от ${day(o.acceptedAt, true)}</div>
  ${preliminary ? `<div class="pre">Предварительный расчёт: ремонт в работе, состав работ и запчастей может измениться.</div>` : ""}

  <table class="spec">
    <tr><td class="k">Заказчик</td><td>${escape(o.customerName)}${o.customerPhone ? `, тел. ${escape(o.customerPhone)}` : ""}</td></tr>
    <tr><td class="k">Техника</td><td>${escape(o.vehicle)}${o.vehicleNumber ? ` · ${escape(o.vehicleNumber)}` : ""}</td></tr>
    ${o.complaint ? `<tr><td class="k">С чем обратились</td><td>${escape(o.complaint).replace(/\n/g, "<br>")}</td></tr>` : ""}
    <tr><td class="k">Принята в ремонт</td><td>${day(o.acceptedAt)}${o.completedAt ? ` · готова ${day(o.completedAt)}` : ""}</td></tr>
    <tr><td class="k">Статус</td><td>${STATUS[o.status] ?? o.status}</td></tr>
  </table>

  ${itemsTable(preliminary ? "Работы" : "Выполненные работы", works, t.works)}
  ${itemsTable("Запчасти и материалы", parts, t.parts)}
  ${works.length + parts.length === 0 ? `<p class="note">Работы и запчасти пока не внесены.</p>` : ""}

  <table class="sum">
    <tr><td>Работы</td><td class="r">${rub(t.works)} ₽</td></tr>
    <tr><td>Запчасти и материалы</td><td class="r">${rub(t.parts)} ₽</td></tr>
    ${t.discount > 0 ? `<tr><td>Скидка</td><td class="r">− ${rub(t.discount)} ₽</td></tr>` : ""}
    <tr class="big"><td>Итого к оплате</td><td class="r">${rub(t.due)} ₽</td></tr>
    ${payRows}
    ${moneyIn.length ? `<tr class="big"><td>Остаток к оплате</td><td class="r">${rub(t.left)} ₽</td></tr>` : ""}
  </table>

  <div class="words">Итого к оплате: ${rub(t.due)} (${moneyWords(t.due)}) рублей 00 копеек. ${stateLine}</div>

  ${
    preliminary
      ? ""
      : `<div class="note">Работы выполнены в полном объёме. Заказчик технику получил, претензий к объёму, качеству и срокам выполнения работ не имеет.</div>`
  }

  <div class="sig">
    <div>
      <div><b>Исполнитель</b></div>
      <div class="line"></div>
      <div class="small">ИП ${escape(LANDLORD.fullName)}</div>
    </div>
    <div>
      <div><b>Заказчик</b></div>
      <div class="line"></div>
      <div class="small">${escape(o.customerName)}</div>
    </div>
  </div>
</div>
</body></html>`;
}

/** Word-копия: тот же HTML без @page и с office-неймспейсами. */
export function serviceInvoiceForWord(html: string): string {
  return html
    .replace(/@page\s*\{[^}]*\}/g, "")
    .replace(
      '<html lang="ru">',
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ru">',
    );
}
