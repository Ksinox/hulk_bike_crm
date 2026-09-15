/**
 * «Ревизия парка» — печатный лист для пересчёта техники (заказчик 06.09, п.2).
 *
 * Сотрудник идёт по гаражу с листом: категории парка, над каждой —
 * количество, в строке — VIN и клетка для галочки. Документ статический:
 * собирается на клиенте из тех же данных, что и раздел «Скутеры».
 */

export type InventoryRow = {
  /** Модель + арендный номер, как в CRM. */
  name: string;
  vin: string;
  /** Подстатус внутри категории: «в аренде», «готов», «ремонт»… */
  state: string;
  /** Кто держит технику (клиент), если есть. */
  holder?: string | null;
};

export type InventoryGroup = {
  title: string;
  hint: string;
  rows: InventoryRow[];
};

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildInventorySheetHtml(groups: InventoryGroup[], now = new Date()): string {
  const date = now.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  const total = groups.reduce((s, g) => s + g.rows.length, 0);
  const section = (g: InventoryGroup) => `
    <section class="group">
      <div class="ghead">
        <div><span class="gtitle">${esc(g.title)}</span><span class="ghint">${esc(g.hint)}</span></div>
        <div class="gcount"><b>${g.rows.length}</b> ед.</div>
      </div>
      ${
        g.rows.length === 0
          ? `<div class="empty">В этой категории техники нет</div>`
          : `<table>
        <thead><tr><th class="n">№</th><th>Техника</th><th>VIN / рама</th><th>Состояние</th><th class="chk">Есть</th></tr></thead>
        <tbody>
          ${g.rows
            .map(
              (r, i) => `<tr>
            <td class="n">${i + 1}</td>
            <td class="name">${esc(r.name)}</td>
            <td class="vin">${esc(r.vin || "—")}</td>
            <td class="state">${esc(r.state)}${r.holder ? `<span class="holder"> · ${esc(r.holder)}</span>` : ""}</td>
            <td class="chk"><span class="box"></span></td>
          </tr>`,
            )
            .join("")}
        </tbody>
      </table>`
      }
    </section>`;

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Ревизия парка — ${esc(date)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; margin: 0; padding: 20px; font-size: 12.5px; }
  .doc { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 800; margin: 0; }
  .sub { color: #6b7280; margin: 4px 0 14px; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; }
  .summary b { font-size: 15px; }
  .group { margin: 0 0 16px; page-break-inside: avoid; }
  .ghead { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #111827; padding-bottom: 4px; margin-bottom: 6px; }
  .gtitle { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; }
  .ghint { color: #6b7280; margin-left: 8px; font-size: 11.5px; }
  .gcount { font-size: 13px; }
  .gcount b { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  td { padding: 6px; border-bottom: 1px solid #eef0f3; vertical-align: middle; }
  td.n, th.n { width: 30px; color: #6b7280; }
  td.name { font-weight: 700; white-space: nowrap; }
  td.vin { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; letter-spacing: .02em; }
  td.state { color: #374151; }
  .holder { color: #6b7280; }
  th.chk, td.chk { width: 52px; text-align: center; }
  .box { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #111827; border-radius: 3px; }
  .empty { color: #9ca3af; padding: 8px 6px; font-style: italic; }
  .sign { margin-top: 26px; display: flex; gap: 30px; page-break-inside: avoid; }
  .sign div { flex: 1; }
  .line { border-bottom: 1px solid #111827; height: 26px; }
  .small { font-size: 10.5px; color: #6b7280; margin-top: 3px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="doc">
    <h1>Ревизия парка</h1>
    <div class="sub">${esc(date)} · отметьте галочкой технику, которая есть в наличии</div>
    <div class="summary">
      <div>Всего единиц: <b>${total}</b></div>
      ${groups.map((g) => `<div>${esc(g.title)}: <b>${g.rows.length}</b></div>`).join("")}
    </div>
    ${groups.map(section).join("")}
    <div class="sign">
      <div><div class="line"></div><div class="small">ревизию провёл — ФИО, подпись</div></div>
      <div><div class="line"></div><div class="small">дата и время окончания</div></div>
      <div><div class="line"></div><div class="small">расхождения / примечания</div></div>
    </div>
  </div>
</body>
</html>`;
}
