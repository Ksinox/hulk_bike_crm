/**
 * Печатная форма «Досудебная претензия» — для случая когда клиент
 * НЕ согласен с актом о повреждениях. Документ закрепляет:
 *  - данные обеих сторон
 *  - реквизиты договора и скутера
 *  - перечень повреждений и сумму ущерба
 *  - срок добровольной оплаты
 *  - предупреждение о переходе в суд
 *
 * Открывается через GET /api/damage-reports/:id/claim?format=html|docx
 */
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  damageReportItems,
  damageReports,
  documentTemplates,
  rentals,
  scooterModels,
  scooters,
} from "../db/schema.js";
import { LANDLORD } from "./landlord.js";

type ClaimBundle = {
  report: typeof damageReports.$inferSelect;
  rental: typeof rentals.$inferSelect;
  client: typeof clients.$inferSelect;
  scooter: typeof scooters.$inferSelect | null;
  model: typeof scooterModels.$inferSelect | null;
  items: (typeof damageReportItems.$inferSelect)[];
};

export async function loadClaimBundle(
  reportId: number,
): Promise<ClaimBundle | null> {
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
  return { report, rental, client, scooter, model, items };
}

function fmtDateRu(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
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

function escape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
        : thousands % 10 >= 2 &&
            thousands % 10 <= 4 &&
            (thousands % 100 < 12 || thousands % 100 > 14)
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
  h1 { font-size: 14pt; text-align: center; margin: 0 0 12pt; font-weight: bold; }
  h2 { font-size: 12pt; text-align: center; font-weight: bold; margin: 12pt 0 8pt; }
  .para { margin: 8pt 0; text-align: justify; }
  .sig { margin-top: 28pt; display: flex; justify-content: space-between; gap: 20pt; page-break-inside: avoid; }
  .sig > div { width: 48%; }
  .sig .line { border-bottom: 1px solid #000; height: 26pt; margin-bottom: 2pt; }
  .small { font-size: 9.5pt; color: #444; }
  ol.items { padding-left: 22pt; margin: 8pt 0; }
  ol.items li { margin: 2pt 0; }
  .wrap { background: #fff; }
  @media screen { body { background: #f5f5f5; } .wrap { margin: 0 auto; padding: 16pt; max-width: 820px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); } }
</style>
`;

/**
 * Формирует HTML-документ досудебной претензии — клиент признаёт вину
 * и обязуется выплатить сумму ущерба до указанного срока, иначе
 * передача в суд.
 */
function tplClaim(b: ClaimBundle): string {
  const { report, rental, client, scooter, model, items } = b;
  const reportNo = String(report.id).padStart(4, "0");
  const reportDate = fmtDateRu(report.createdAt);
  const contractDate = fmtDateRu(rental.startAt);
  const returnDate = fmtDateRu(rental.endActualAt ?? rental.endPlannedAt);
  const modelName = modelDisplayName(scooter, model);
  const total = report.total;
  // Срок добровольной оплаты — 21 день от даты составления претензии.
  const dueDate = (() => {
    const t = report.createdAt
      ? new Date(report.createdAt)
      : new Date();
    const due = new Date(t.getTime() + 21 * 86_400_000);
    return fmtDateRu(due);
  })();

  const itemsList = items
    .map((it, i) => `<li>${i + 1}. ${escape(it.name)}${it.comment ? ` — ${escape(it.comment)}` : ""}</li>`)
    .join("");

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Досудебная претензия № ${reportNo}</title>${CSS}</head><body>
<div class="wrap">
  <p class="para" style="text-align:right">
    <b>${escape(client.name)}</b>${client.birthDate ? ` Дата рождения ${fmtDateRu(client.birthDate)}` : ""}<br>
    ${
      client.passportSeries || client.passportNumber
        ? `Паспорт серия ${escape(client.passportSeries ?? "____")} № ${escape(client.passportNumber ?? "______")}`
        : ""
    }${
      client.passportIssuedOn
        ? `, выдан ${fmtDateRu(client.passportIssuedOn)}`
        : ""
    }${
      client.passportIssuer ? `<br>${escape(client.passportIssuer)}` : ""
    }${
      client.passportDivisionCode
        ? `, код подразделения ${escape(client.passportDivisionCode)}`
        : ""
    }${
      client.passportRegistration
        ? `<br>Зарегистрирован: ${escape(client.passportRegistration)}`
        : ""
    }
  </p>

  <p class="para" style="text-align:right">
    от <b>${escape(LANDLORD.fullName)}</b><br>
    Паспорт серия ${escape(LANDLORD.passportSeries)} № ${escape(LANDLORD.passportNumber)}<br>
    выдан ${escape(LANDLORD.passportIssuedOn)} ${escape(LANDLORD.passportIssuer)}<br>
    код подразделения ${escape(LANDLORD.passportDivisionCode)}<br>
    Зарегистрирован: ${escape(LANDLORD.registrationAddress)}
  </p>

  <h1>ПРЕТЕНЗИЯ (досудебная)</h1>

  <p class="para">
    ${contractDate}, между мной, <b>${escape(LANDLORD.fullName)}</b>, и Вами,
    <b>${escape(client.name)}</b> (далее — Арендатор и Арендодатель),
    был заключён договор проката № ${escape(String(rental.id))} транспортного средства Скутер: <b>${escape(modelName)}</b>${
      scooter?.year ? ` ${scooter.year} г.в.` : ""
    }${
      scooter?.engineNo ? `, № двигателя ${escape(scooter.engineNo)}` : ""
    }${
      scooter?.frameNumber
        ? `, № шасси/рамы ${escape(scooter.frameNumber)}`
        : ""
    }${
      scooter?.color ? `, цвет ${escape(scooter.color)}` : ""
    }, на период с ${contractDate} по ${returnDate}.
  </p>

  <p class="para">
    Согласно условиям подписанного между нами договора проката,
    транспортное средство, а именно скутер <b>${escape(modelName)}</b>,
    должно быть возвращено в исправном состоянии по акту. Также в
    подписанном договоре, в пункте 5.4, прописано, что в случае
    причинения вреда Скутеру Арендатор возмещает Арендодателю все
    расходы, связанные с причинением вреда Скутеру.
  </p>

  <p class="para">
    ${reportDate} при возврате Скутера в Акте приёма-передачи
    (Приложение № 2) выявлены следующие повреждения:
  </p>

  ${
    items.length > 0
      ? `<ol class="items">${itemsList}</ol>`
      : `<p class="para small"><i>Перечень повреждений приведён в Акте о повреждениях № ${reportNo}.</i></p>`
  }

  <p class="para">
    <b>Общая сумма задолженности: ${fmtMoney(total)} ₽ (${moneyWords(total)} рублей).</b>
    Арендатор обязуется выплатить сумму ущерба до <b>${dueDate}</b>.
  </p>

  <p class="para">
    В противном случае я буду вынужден подать на Вас в суд, что повлечёт
    дополнительные расходы за услуги юриста и судебные расходы.
  </p>

  <p class="para">
    Я, <b>${escape(client.name)}</b>, полностью ознакомился с содержанием
    данного документа и признаю свою вину в полном размере касаемо
    характера и объёма задолженности.
  </p>

  <p class="para">${reportDate}</p>

  <div class="sig">
    <div>
      <div>Арендодатель: ${escape(LANDLORD.fullName)}</div>
      <div class="line"></div>
      <div class="small">подпись / расшифровка</div>
    </div>
    <div>
      <div>Арендатор: ${escape(client.name)}</div>
      <div class="line"></div>
      <div class="small">подпись / расшифровка</div>
    </div>
  </div>
</div>
</body></html>`;
}

/**
 * Главная функция рендера досудебной претензии. Если в БД есть
 * пользовательский override (templateKey='claim') — использует его +
 * подстановку переменных. Иначе — системный хардкод.
 */
export async function renderClaimHtml(b: ClaimBundle): Promise<string> {
  const [override] = await db
    .select()
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.templateKey, "claim"),
        eq(documentTemplates.kind, "override"),
      ),
    );
  if (override) {
    // Импорт по-ленивому чтобы избежать circular dep.
    const { substituteVariables } = await import("./variables.js");
    const body = substituteVariables(override.body, {
      rental: b.rental,
      client: b.client,
      scooter: b.scooter,
      model: b.model,
      rootRentalId: b.rental.id,
      rootStartAt: b.rental.startAt ?? null,
    });
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Досудебная претензия № ${String(b.report.id).padStart(4, "0")}</title>${CSS}</head><body>
<div class="wrap">
${body}
</div>
</body></html>`;
  }
  return tplClaim(b);
}

export async function renderClaimHtmlForWord(
  b: ClaimBundle,
): Promise<string> {
  const html = await renderClaimHtml(b);
  const stripped = html.replace(/@page\s*\{[^}]*\}/g, "");
  return stripped.replace(
    '<html lang="ru">',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ru">',
  );
}
