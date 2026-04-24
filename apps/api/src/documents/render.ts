/**
 * Сборщик данных + рендер HTML договоров и актов.
 * Подставляет поля из rental/client/scooter/model + реквизиты landlord.
 * HTML-строку потом можно отдать либо как preview (Content-Type: text/html),
 * либо сконвертить в .docx через html-to-docx.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients, rentals, scooterModels, scooters } from "../db/schema.js";
import { LANDLORD } from "./landlord.js";

export type DocumentType =
  | "contract" // Договор проката скутера
  | "act_transfer" // Приложение №1 — Акт приёма-передачи (выдача)
  | "act_return" // Приложение №2 — Акт возврата
  | "purchase_deposit"; // Договор задатка при купле-продаже

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  contract: "Договор проката",
  act_transfer: "Акт приёма-передачи (выдача)",
  act_return: "Акт возврата",
  purchase_deposit: "Договор задатка (выкуп)",
};

type Bundle = {
  rental: typeof rentals.$inferSelect;
  client: typeof clients.$inferSelect;
  scooter: typeof scooters.$inferSelect | null;
  model: typeof scooterModels.$inferSelect | null;
};

export async function loadBundle(rentalId: number): Promise<Bundle | null> {
  const [rental] = await db
    .select()
    .from(rentals)
    .where(eq(rentals.id, rentalId));
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
  return { rental, client, scooter, model };
}

/* ============ helpers ============ */

function fmtDateRu(d: Date | string | null | undefined): string {
  if (!d) return "«___» __________ ____г.";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "«___» __________ ____г.";
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;
}
function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return "___.___.____";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "___.___.____";
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getFullYear()).slice(-2)}г.`;
}
function fmtTimeMsk(d: Date | string | null | undefined): string {
  if (!d) return "___:___";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "___:___";
  const msk = new Date(dt.getTime() + 3 * 3600 * 1000);
  return `${String(msk.getUTCHours()).padStart(2, "0")}:${String(msk.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtMoney(n: number | null | undefined, withCents = true): string {
  if (n == null) return "0,00";
  const s = Math.abs(Math.round(n)).toLocaleString("ru-RU");
  return withCents ? `${s},00` : s;
}
function orDash(v: string | number | null | undefined, dashes = "___________"): string {
  if (v == null || v === "") return dashes;
  return String(v);
}

/** Полный блок реквизитов клиента как в исходном договоре */
function clientBlock(client: Bundle["client"]): string {
  const parts: string[] = [];
  parts.push(`<b>${client.name}</b>`);
  if (client.birthDate) parts.push(`Дата рождения ${fmtDateRu(client.birthDate)}`);
  if (client.passportSeries || client.passportNumber) {
    parts.push(
      `Паспорт серия ${orDash(client.passportSeries, "____")} номер ${orDash(client.passportNumber, "______")}`,
    );
  }
  if (client.passportIssuedOn)
    parts.push(`Дата выдачи ${fmtDateRu(client.passportIssuedOn)}`);
  if (client.passportIssuer) parts.push(`Кем выдан: ${client.passportIssuer}`);
  if (client.passportDivisionCode)
    parts.push(`Код подразделения ${client.passportDivisionCode}`);
  if (client.passportRegistration)
    parts.push(`Зарегистрирован: ${client.passportRegistration}`);
  if (client.phone) parts.push(`Тел. ${client.phone}`);
  return parts.join(". ");
}

/** Реквизиты арендодателя одной строкой */
function landlordBlock(): string {
  return `<b>${LANDLORD.fullName}</b>, паспорт серия ${LANDLORD.passportSeries} номер ${LANDLORD.passportNumber}, выдан ${LANDLORD.passportIssuedOn} ${LANDLORD.passportIssuer}, код подразделения ${LANDLORD.passportDivisionCode}. Зарегистрирован: ${LANDLORD.registrationAddress}. Тел. ${LANDLORD.phone}`;
}

/** Чек-бокс Word-совместимый (печатный символ вместо input) */
function checkbox(checked: boolean): string {
  return checked ? "☑" : "☐";
}

/* ============ общий css (встраивается в каждый HTML) ============ */

const CSS = `
<style>
  /*
   * @page { margin: 0 } в Chromium убирает стандартные колонтитулы
   * браузера (URL и заголовок), которые он дорисовывает сам при печати.
   * Поля документа делаем через padding у body.
   */
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt; color: #000; line-height: 1.4;
    padding: 18mm 16mm;
  }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4pt; page-break-after: avoid; }
  h2 { font-size: 12pt; margin: 10pt 0 4pt; page-break-after: avoid; }
  .subtitle { text-align: center; font-size: 10pt; color: #444; margin-bottom: 12pt; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 10pt; font-size: 10pt; }
  ol { padding-left: 18pt; }
  li { margin-bottom: 3pt; }
  .para { margin: 6pt 0; text-align: justify; }
  /* Подписи и таблицы не должны разрываться между страницами */
  .sig { margin-top: 24pt; display: flex; justify-content: space-between; gap: 20pt; page-break-inside: avoid; }
  .sig > div { width: 48%; }
  .sig .line { border-bottom: 1px solid #000; height: 28pt; margin-bottom: 2pt; }
  .small { font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 8pt; page-break-inside: avoid; }
  tr { page-break-inside: avoid; }
  td, th { border: 1px solid #000; padding: 6pt; vertical-align: top; font-size: 10.5pt; }
  .equipment-list { list-style: none; padding-left: 0; }
  .equipment-list li { padding: 2pt 0; }
  .keep-together { page-break-inside: avoid; }
  /* Экранная обёртка (в iframe для preview), при печати — прозрачно */
  .wrap { background: #fff; }
  @media screen { body { background: #f5f5f5; } .wrap { margin: 0 auto; padding: 16pt; max-width: 820px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); } }
</style>
`;

/**
 * Раньше тут был тулбар с кнопкой печати — теперь документ открывается
 * в модалке внутри CRM, кнопки управления у модалки.
 */
const TOOLBAR = "";

/* ============ шаблоны ============ */

function tplContract(b: Bundle): string {
  const { rental, client, scooter, model } = b;
  const contractNumber = String(rental.id);
  const contractDate = fmtDateRu(rental.startAt);
  const depositAmount = rental.deposit;
  const depositLine =
    rental.depositItem && rental.deposit === 0
      ? `предмета «${rental.depositItem}»`
      : `денежных средств в размере ${fmtMoney(depositAmount)} (${moneyWords(depositAmount)}) рублей`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Договор проката №${contractNumber}</title>${CSS}</head><body>
${TOOLBAR}
<div class="wrap">
  <h1>Договор проката Скутера № ${contractNumber}</h1>
  <div class="meta-row">
    <span>${LANDLORD.city}</span>
    <span>дата: ${contractDate}</span>
  </div>

  <div class="para">
    Мы, нижеподписавшиеся, гражданин РФ ${landlordBlock()}, именуемый в дальнейшем «Арендодатель», с одной стороны, и гражданин РФ ${clientBlock(client)}, именуемый в дальнейшем «Арендатор», с другой стороны, заключили настоящий Договор (далее — «Договор»), о нижеследующем:
  </div>

  <h2>1. Предмет договора</h2>
  <ol>
    <li>Арендодатель предоставляет Арендатору во временное владение и пользование за обусловленную настоящим Договором плату транспортное средство (далее — «Скутер»), характеристики которого указаны в Приложении №1 к настоящему Договору.</li>
    <li>Арендодатель предоставляет Арендатору Скутер в исправном состоянии и без повреждений внешних частей корпуса по Акту приёма-передачи (Приложение №1). Акт приёма-передачи является неотъемлемой частью настоящего Договора.</li>
    <li>Арендатор, подписав Акт приёма-передачи, подтверждает, что Скутер в исправном состоянии и соответствует условиям договора.</li>
    <li>Скутер передаётся Арендатору на срок, указанный в п. 3.1. настоящего Договора.</li>
    <li>Стороны согласовали, что Скутер (категории М, А1, А, В) передаётся в прокат под залог ${depositLine}.</li>
  </ol>

  <h2>2. Права и обязанности сторон</h2>
  <div class="para"><b>2.1. Арендодатель обязан:</b> Предоставить во временное владение и пользование Арендатору транспортное средство указанное в п. 1.2. настоящего Договора в технически исправном состоянии согласно и на условиях, указанных в п. 1.3. настоящего Договора.</div>

  <div class="para"><b>2.2. Арендодатель вправе:</b></div>
  <ol>
    <li>Расторгнуть настоящий Договор в одностороннем порядке и потребовать возврата Скутера в случае, если Арендатор нарушает правила эксплуатации Скутера и/или условия Договора.</li>
    <li>Отказать Арендатору в продлении срока действия настоящего Договора.</li>
    <li>Арендодатель подтверждает, что имущество не является предметом залога и не обременено иными правами третьих лиц.</li>
  </ol>

  <div class="para"><b>2.3. Арендатор обязан:</b></div>
  <ol>
    <li>Использовать Скутер в соответствии с его целевым назначением без права использования в коммерческих целях, проявляя должную осмотрительность и бережность.</li>
    <li>Уплачивать Арендодателю арендную плату в размере, сроки и порядке, предусмотренные пунктом 3.1–3.4 настоящего Договора.</li>
    <li>Нести дополнительные расходы, связанные с эксплуатацией Скутера (ГСМ, компенсация вреда третьим лицам, штрафы ГИБДД, эвакуаторы и т.п.).</li>
    <li>Самостоятельно и в установленные сроки оплачивать штрафы за нарушение правил дорожного движения.</li>
    <li>Не передавать Скутер в пользование и владение третьих лиц.</li>
    <li>Содержать Скутер в полной технической исправности.</li>
    <li>Возместить Арендодателю стоимость ремонта Скутера (его деталей) в полном объёме. Ремонт производится только самостоятельно Арендодателем либо привлечёнными им третьими лицами.</li>
    <li>Хранить Скутер в местах, обеспечивающих его надлежащую сохранность (охраняемая стоянка, гараж, бокс).</li>
    <li>В случае утраты Скутера компенсировать его стоимость, установленную п. 4.1. Договора.</li>
    <li>В случае утраты деталей — оплатить стоимость детали в полном объёме.</li>
    <li>В случае утраты документов на Скутер оплатить расходы на восстановление в размере 1 500 (одна тысяча пятьсот) рублей.</li>
    <li>Компенсировать Арендодателю упущенную выгоду в сумме ежедневного тарифа за каждый день простоя Скутера.</li>
    <li>Обязанности по компенсации ущерба возникают в том числе если в момент ДТП/утери Арендатор находился в состоянии опьянения.</li>
    <li>По истечении срока проката передать Скутер Арендодателю в состоянии, в котором он был получен (Приложение №2). При наличии загрязнений — оплатить мойку в размере 150 рублей.</li>
    <li>При возврате Скутера подписать Акт приёма-передачи (возврата) (Приложение №2).</li>
    <li>При немотивированном отказе Арендатора от подписания Акта, акт составляется Арендодателем в присутствии двух представителей общественности.</li>
    <li>Не наносить логотипы, надписи, маркировку; не изменять брендирование. За порчу брендирования взыскивается 3 000 рублей за один элемент.</li>
  </ol>

  <div class="para"><b>2.4. Арендатор не вправе:</b></div>
  <ol>
    <li>Передавать Скутер в субаренду.</li>
    <li>Предоставлять Скутер в безвозмездное пользование третьим лицам.</li>
    <li>Передавать Скутер в залог, вносить в уставный капитал.</li>
    <li>Управлять транспортным средством в состоянии алкогольного/наркотического/токсического опьянения.</li>
    <li>Изменять внешний вид, заменять или ремонтировать детали без согласования.</li>
  </ol>

  <h2>3. Арендная плата, порядок и сроки расчётов</h2>
  <ol>
    <li>Скутер предоставляется Арендатору в прокат посуточно. Одни сутки — 24 часа.
      <ol>
        <li>Скутер выдан: ${fmtDateShort(rental.startAt)} в <b>${fmtTimeMsk(rental.startAt)}</b></li>
        <li>Срок возврата скутера: ${fmtDateShort(rental.endPlannedAt)} в <b>${fmtTimeMsk(rental.endPlannedAt)}</b></li>
      </ol>
    </li>
    <li>Время, указанное в п. 3.1.1–3.1.2, является расчётным. При возврате Скутера с превышением более чем на 60 минут — компенсация в размере половины п. 3.3, свыше 120 минут — 300 рублей за каждые 60 минут просрочки.</li>
    <li>Арендная плата Скутера за срок аренды составляет <b>${fmtMoney(rental.sum)} (${moneyWords(rental.sum)}) рублей</b> и производится Арендатором наличными либо на банковские реквизиты Арендодателя.</li>
    <li>Плата вносится в день получения Скутера.</li>
    <li>В случае невозврата Арендатором Скутера в установленные сроки наступает ответственность, предусмотренная УК РФ (квалифицируется как угон).</li>
  </ol>

  <h2>4. Цена имущества</h2>
  <ol>
    <li>Стороны соглашаются, что стоимость Скутера оценивается в ${fmtMoney(scooter?.purchasePrice ?? 0)} (${moneyWords(scooter?.purchasePrice ?? 0)}) рублей.</li>
    <li>Арендатор компенсирует стоимость утраченных/повреждённых комплектующих в полном объёме.</li>
    <li>Стороны договариваются о возмещении ущерба исходя из рыночной стоимости запчастей и работ.</li>
  </ol>

  <h2>5. Ответственность сторон</h2>
  <div class="para"><b>5.1. Арендатор несёт ответственность:</b></div>
  <ol>
    <li>В случае нецелевого использования Скутера, полученного по настоящему Договору, Арендатор уплачивает Арендодателю компенсацию в размере 1 000,00 (одна тысяча) рублей.</li>
    <li>В случае нанесения повреждений Скутеру, а равно фирменному брендированию, из суммы залога удерживается стоимость ремонта. В случае если стоимость ремонта превышает размер залога, Арендатор обязан возместить Арендодателю денежную сумму, превышающую размер залога, исходя из рыночной стоимости при возврате Скутера.</li>
    <li>Арендатор обязуется вернуть Скутер Арендодателю в исправном состоянии по акту до истечения срока, указанного в п. 3.1.2. настоящего Договора, а в случае поломки/порчи/уничтожения Скутера Арендатор обязуется собственными силами и за счёт собственных средств доставить Скутер в пункт проката.</li>
  </ol>

  <ol start="2">
    <li>В случае нарушения Арендатором условий договора, техники безопасности, повлекших за собой вред здоровью Арендатора, — Арендодатель ответственности не несёт.</li>
    <li>В случае причинения вреда Арендатором третьим лицам ответственность перед третьими лицами несёт Арендатор.</li>
    <li>В случае гибели, хищения или причинения вреда Скутеру Арендатор возмещает Арендодателю все расходы, связанные с причинением вреда или утратой Скутера.</li>
    <li>Арендатор несёт ответственность перед Арендодателем в объёме, указанном в настоящем Договоре, а также за счёт залога.</li>
    <li>В случае невозврата Арендатором арендованного Скутера в установленные настоящим договором сроки и непродлении настоящего договора в отношении Арендатора наступает ответственность, предусмотренная Уголовным кодексом Российской Федерации, и квалифицируется как незаконное завладение транспортным средством.</li>
    <li>В случае неисполнения Арендатором обязанности по компенсации ущерба, причинённого им Скутеру, при возврате Скутера Арендодателю с Арендатора подлежит взысканию (кроме суммы ущерба) компенсация в размере 1 000,00 (одна тысяча) рублей за каждый день до момента полной компенсации причинённого ущерба (оплаты ремонта).</li>
    <li>В случае, указанном в п. 2.3.16. настоящего договора, также наступают последствия, установленные п. 5.7. настоящего договора.</li>
    <li>Арендодатель также уведомляет Арендатора о том, что в случаях:
      <ul>
        <li>немотивированного отказа Арендатора от подписания Акта приёма-передачи (Приложение №2 к настоящему Договору),</li>
        <li>немотивированного отказа Арендатора от оплаты задолженности по арендной плате или компенсации причинённого Скутеру ущерба,</li>
      </ul>
      Арендодатель вправе обратиться за защитой нарушенных прав в судебном порядке. В результате чего с Арендатора кроме сумм задолженности по арендной плате, компенсации ущерба, штрафа (п. 5.7. настоящего договора) будут взысканы судебные расходы (оплата услуг представителей, государственная пошлина).
    </li>
  </ol>

  <h2>6. Срок действия договора</h2>
  <ol>
    <li>Договор вступает в силу с даты подписания и действует до исполнения сторонами всех обязательств.</li>
    <li>Арендатор не имеет преимущественного права на продление.</li>
    <li>По желанию Арендатора Договор может быть досрочно расторгнут; уплаченная аренда возврату не подлежит.</li>
  </ol>

  <h2>7. Порядок возврата Скутера</h2>
  <ol>
    <li>По истечении срока Арендатор обязан незамедлительно передать Скутер по Акту приёма-передачи (возврата).</li>
    <li>Скутер должен быть возвращён в том состоянии, в котором Арендатор его получил.</li>
  </ol>

  <h2>8. Заключительные положения</h2>
  <ol>
    <li>Все изменения и дополнения действительны, если составлены в письменной форме и подписаны Сторонами.</li>
    <li>Настоящий договор подписан в двух экземплярах, имеющих одинаковую юридическую силу.</li>
    <li>Споры подлежат рассмотрению в Центральном районном суде г. Краснодара.</li>
    <li>Арендатор подтверждает, что физически и психически готов к заезду, проинструктирован о правилах пользования Скутером и берёт ответственность на себя.</li>
    <li>Арендатор обязуется не выезжать за пределы г. Краснодара далее 30 км от границы.</li>
    <li>Подписывая Договор, Арендатор даёт добровольное согласие на обработку персональных данных.</li>
  </ol>

  <h2>9. Реквизиты сторон</h2>
  <table>
    <tr>
      <td style="width:50%;"><b>Арендодатель:</b><br>${LANDLORD.fullName}<br>
        Паспорт серия ${LANDLORD.passportSeries} номер ${LANDLORD.passportNumber}, выдан ${LANDLORD.passportIssuedOn}<br>
        ${LANDLORD.passportIssuer}<br>
        Код подразделения ${LANDLORD.passportDivisionCode}<br>
        Зарегистрирован: ${LANDLORD.registrationAddress}<br>
        Тел.: ${LANDLORD.phone}<br><br>
        ${LANDLORD.inn ? "ИНН: " + LANDLORD.inn + "<br>" : ""}
        Подпись: _______________ / ${LANDLORD.fullName} /
      </td>
      <td style="width:50%;"><b>Арендатор:</b><br>
        ${client.name}<br>
        ${client.birthDate ? "Дата рождения: " + fmtDateRu(client.birthDate) + "<br>" : ""}
        Паспорт серия ${orDash(client.passportSeries, "____")} номер ${orDash(client.passportNumber, "______")}<br>
        ${client.passportIssuedOn ? "Дата выдачи: " + fmtDateRu(client.passportIssuedOn) + "<br>" : ""}
        ${client.passportIssuer ? client.passportIssuer + "<br>" : ""}
        ${client.passportDivisionCode ? "Код подразделения: " + client.passportDivisionCode + "<br>" : ""}
        ${client.passportRegistration ? "Зарегистрирован: " + client.passportRegistration + "<br>" : ""}
        Тел.: ${client.phone}<br><br>
        Подпись: _______________ / ${client.name} /
      </td>
    </tr>
  </table>
</div>
</body></html>`;
  // unused suppress
  void model;
}

function tplActTransfer(b: Bundle): string {
  return tplAct(b, "transfer");
}
function tplActReturn(b: Bundle): string {
  return tplAct(b, "return");
}

function tplAct(b: Bundle, kind: "transfer" | "return"): string {
  const { rental, client, scooter, model } = b;
  const title =
    kind === "transfer"
      ? "Приложение №1"
      : "Приложение №2";
  const subtitle =
    kind === "transfer"
      ? "Акт приёма-передачи"
      : "Акт приёма-передачи (возврата)";
  const handOver =
    kind === "transfer"
      ? "Арендодатель передал, а Арендатор принял Скутер"
      : "Арендодатель принял, а Арендатор передал Скутер";
  const contractNumber = String(rental.id);
  const actDate = fmtDateRu(
    kind === "transfer" ? rental.startAt : rental.endActualAt ?? rental.endPlannedAt,
  );

  const equipmentRows = (rental.equipmentJson ?? []) as Array<{
    name: string;
    free: boolean;
    price: number;
  }>;
  const equipmentSet = new Set(equipmentRows.map((e) => e.name.toLowerCase()));
  const STANDARD = [
    "Зарядка",
    "Держатель телефона",
    "Увеличенный багажник",
    "Шлем",
    "Цепь",
    "Резинка",
    "Муфты",
  ];

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${subtitle} по договору №${contractNumber}</title>${CSS}</head><body>
${TOOLBAR}
<div class="wrap">
  <div class="subtitle"><b>${title}</b><br>К договору № ${contractNumber} от ${fmtDateRu(rental.startAt)} г.</div>
  <h1>${subtitle}</h1>
  <div class="meta-row">
    <span>${LANDLORD.city}</span>
    <span>${actDate}</span>
  </div>

  <div class="para"><b>Арендатор:</b> ${clientBlock(client)}</div>
  <div class="para"><b>Арендодатель:</b> ${landlordBlock()}</div>

  <div class="para">составили настоящий акт о нижеследующем:<br>
    В соответствии с Договором проката транспортного средства скутера, ${handOver}:
  </div>

  <div class="para">
    Марка, модель: <b>${orDash(model?.name ?? scooter?.name, "________")}</b><br>
    Наименование (тип ТС): Скутер<br>
    Категория ТС: М<br>
    Год выпуска: <b>${orDash(scooter?.year, "______")}</b><br>
    № двигателя: <b>${orDash(scooter?.engineNo, "______________")}</b><br>
    № шасси (рама): <b>${orDash(scooter?.frameNumber ?? scooter?.vin, "______________")}</b><br>
    Цвет: <b>${orDash(scooter?.color, "____________")}</b><br>
    ${scooter?.name ? "Внутренний номер: " + scooter.name : ""}<br>
    Пробег на момент ${kind === "transfer" ? "выдачи" : "возврата"}: <b>${orDash(scooter?.mileage != null ? `${scooter.mileage} км` : null, "______ км")}</b><br>
    Техническое состояние скутера: ${kind === "transfer" ? "зафиксировано посредством фото-видео фиксации и отправлено в общий чат в мессенджере «WhatsApp»" : "_______________________________________________________________"}
  </div>

  <div class="para">
    ${kind === "transfer" ? "Одновременно со Скутером Арендодатель передал, а Арендатор принял" : "Одновременно со Скутером возвращены"} следующие запасные части, аксессуары, дополнительное оборудование:
  </div>
  <ul class="equipment-list">
    ${STANDARD.map(
      (item) =>
        `<li>${checkbox(equipmentSet.has(item.toLowerCase()))} ${item}</li>`,
    ).join("")}
  </ul>

  ${
    kind === "return"
      ? `<div class="para">Примечания: ________________________________________________________________________________</div>`
      : ""
  }

  <div class="para">Идентификационные номера сверены, комплектность проверена.<br>
    Претензий к Арендодателю, в том числе имущественных, Арендатор не имеет${kind === "return" ? " (имеет)" : ""}.<br>
    Арендатор обязуется возместить Арендодателю расходы на устранение повреждений, полученных при эксплуатации скутера, в размере _______________________ рублей.
  </div>

  <div class="sig">
    <div>
      <div class="line"></div>
      <div class="small">
        ${kind === "transfer" ? "Арендодатель транспортное средство передал" : "Арендодатель транспортное средство получил"}<br>
        (подпись / расшифровка) — ${LANDLORD.fullName}
      </div>
    </div>
    <div>
      <div class="line"></div>
      <div class="small">
        ${kind === "transfer" ? "Арендатор транспортное средство получил" : "Арендатор транспортное средство передал"}<br>
        (подпись / расшифровка) — ${client.name}
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

function tplPurchaseDeposit(b: Bundle): string {
  const { rental, client, scooter, model } = b;
  const today = fmtDateRu(new Date());
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>Договор задатка при купле-продаже скутера</title>${CSS}</head><body>
${TOOLBAR}
<div class="wrap">
  <h1>Договор задатка<br>при купле-продаже скутера</h1>
  <div class="meta-row">
    <span>${LANDLORD.city}</span>
    <span>${today}</span>
  </div>

  <div class="para">
    <b>${LANDLORD.fullName}</b> (паспорт серия ${LANDLORD.passportSeries}, номер ${LANDLORD.passportNumber}, выдан ${LANDLORD.passportIssuedOn}), именуемый в дальнейшем «Продавец», с одной стороны, и
    <b>${client.name}</b> ${client.birthDate ? `, ${fmtDateRu(client.birthDate)} года рождения` : ""} (паспорт серия ${orDash(client.passportSeries, "____")}, номер ${orDash(client.passportNumber, "______")}${client.passportIssuedOn ? `, выдан ${fmtDateRu(client.passportIssuedOn)}` : ""}), именуемый в дальнейшем «Покупатель», с другой стороны, вместе именуемые Стороны, а по отдельности — Сторона, заключили настоящий договор (далее — Договор) о нижеследующем:
  </div>

  <h2>1.</h2>
  <div class="para">В целях фиксации серьёзности намерений Сторон и исполнения ими достигнутых договорённостей о купле-продаже транспортного средства, Покупатель передал, а Продавец получил задаток (далее — «Задаток») в размере _______________________________ (_________________________________________) руб.</div>

  <h2>2.</h2>
  <div class="para">Транспортное средство представляет собой скутер (далее — «скутер»), идентифицируемый следующими параметрами:</div>
  <ul>
    <li>Марка, модель: <b>${orDash(model?.name ?? scooter?.name, "________")}</b></li>
    <li>Идентификационный номер (VIN): <b>${orDash(scooter?.vin, "_________________")}</b></li>
    <li>Год выпуска: <b>${orDash(scooter?.year, "_______")}</b></li>
    <li>Номер двигателя: <b>${orDash(scooter?.engineNo, "_______________")}</b></li>
    <li>Номер шасси/рамы: <b>${orDash(scooter?.frameNumber, "_______________")}</b></li>
    <li>Цвет: <b>${orDash(scooter?.color, "__________")}</b></li>
  </ul>

  <h2>3.</h2>
  <div class="para">Стороны договорились, что стоимость скутера с момента подписания настоящего Договора и до подписания договора купли-продажи (далее — «Основной договор») не изменится и составит: <b>${fmtMoney(scooter?.purchasePrice ?? 0)}</b> (${moneyWords(scooter?.purchasePrice ?? 0)}) рублей.</div>

  <h2>4.</h2>
  <div class="para">Стороны договорились, что крайний срок заключения Основного договора «___» _____________ ________ г.</div>

  <h2>5.</h2>
  <div class="para">В случае, если в момент заключения Основного договора Продавец изменяет стоимость скутера в сторону увеличения, Покупатель имеет право потребовать возврат Задатка в полном размере и штраф в размере суммы Задатка, а Продавец обязуется выполнить требование Покупателя.</div>

  <h2>6.</h2>
  <div class="para">В случае, если после подписания настоящего Договора Покупатель отказывается от заключения Основного договора или не в состоянии оплатить полную стоимость скутера, указанную в п. 3., Продавец имеет право не возвращать полученный по этому договору Задаток.</div>

  <h2>7.</h2>
  <div class="para">Стороны договорились, что в случаях, не предусмотренных настоящим Договором задатка, Стороны решают вопрос путём переговоров.</div>

  <h2>8.</h2>
  <div class="para">Скутер принадлежит Продавцу по праву собственности.<br>Договор составлен в двух экземплярах — по одному для каждой из Сторон.</div>

  <h2>Адреса и реквизиты сторон</h2>
  <table>
    <tr>
      <td style="width:50%;"><b>Продавец:</b><br>
        ${LANDLORD.fullName}<br>
        Адрес: ${LANDLORD.registrationAddress}<br>
        Паспорт: ${LANDLORD.passportSeries} ${LANDLORD.passportNumber}<br>
        Тел.: ${LANDLORD.phone}<br><br>
        Подпись: ________________
      </td>
      <td style="width:50%;"><b>Покупатель:</b><br>
        ${client.name}<br>
        Адрес: ${orDash(client.passportRegistration, "_______________")}<br>
        Паспорт: ${orDash(client.passportSeries, "____")} ${orDash(client.passportNumber, "______")}<br>
        Тел.: ${orDash(client.phone, "_______________")}<br><br>
        Подпись: ________________
      </td>
    </tr>
  </table>

  <div class="small" style="margin-top:12pt; color:#666;">Рента аренды (если связано): № договора проката ${rental.id}, заключён ${fmtDateRu(rental.startAt)}.</div>
</div>
</body></html>`;
  void model;
}

/** Упрощённое словесное представление — «1800 (Одна тысяча восемьсот) рублей». */
function moneyWords(n: number): string {
  if (n == null) return "ноль";
  const num = Math.abs(Math.round(n));
  if (num === 0) return "ноль";

  const units = [
    "",
    "один",
    "два",
    "три",
    "четыре",
    "пять",
    "шесть",
    "семь",
    "восемь",
    "девять",
    "десять",
    "одиннадцать",
    "двенадцать",
    "тринадцать",
    "четырнадцать",
    "пятнадцать",
    "шестнадцать",
    "семнадцать",
    "восемнадцать",
    "девятнадцать",
  ];
  const tens = [
    "",
    "",
    "двадцать",
    "тридцать",
    "сорок",
    "пятьдесят",
    "шестьдесят",
    "семьдесят",
    "восемьдесят",
    "девяносто",
  ];
  const hundreds = [
    "",
    "сто",
    "двести",
    "триста",
    "четыреста",
    "пятьсот",
    "шестьсот",
    "семьсот",
    "восемьсот",
    "девятьсот",
  ];

  function tri(n: number, feminine = false): string {
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    const parts: string[] = [];
    if (h) parts.push(hundreds[h]!);
    if (n % 100 < 20) {
      const v = units[n % 100];
      if (v) {
        parts.push(
          feminine
            ? v.replace(/^один$/, "одна").replace(/^два$/, "две")
            : v,
        );
      }
    } else {
      if (t) parts.push(tens[t]!);
      if (u) {
        const v = units[u]!;
        parts.push(
          feminine
            ? v.replace(/^один$/, "одна").replace(/^два$/, "две")
            : v,
        );
      }
    }
    return parts.join(" ");
  }

  const mln = Math.floor(num / 1_000_000);
  const thou = Math.floor((num % 1_000_000) / 1000);
  const rest = num % 1000;
  const parts: string[] = [];

  if (mln) {
    parts.push(tri(mln) + " " + pluralRu(mln, ["миллион", "миллиона", "миллионов"]));
  }
  if (thou) {
    parts.push(tri(thou, true) + " " + pluralRu(thou, ["тысяча", "тысячи", "тысяч"]));
  }
  if (rest) {
    parts.push(tri(rest));
  }
  const s = parts.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/* ============ точка входа ============ */

export function renderDocumentHtml(type: DocumentType, bundle: Bundle): string {
  switch (type) {
    case "contract":
      return tplContract(bundle);
    case "act_transfer":
      return tplActTransfer(bundle);
    case "act_return":
      return tplActReturn(bundle);
    case "purchase_deposit":
      return tplPurchaseDeposit(bundle);
  }
}

/**
 * Для Word: отдаём HTML без тулбара, без `@page`/CSS-обвязки которую
 * Word может неправильно интерпретировать. Word сам применит свои поля
 * страницы. Используем спец namespace office/word чтобы Word понял что
 * это его формат.
 */
export function renderDocumentHtmlForWord(
  type: DocumentType,
  bundle: Bundle,
): string {
  const full = renderDocumentHtml(type, bundle);
  // Удаляем тулбар (он внутри .no-print) и @page — Word их не понимает
  const stripped = full
    .replace(/<div class="top-actions[\s\S]*?<\/div>\s*<div class="wrap">/, "<div>")
    .replace(/@page\s*\{[^}]*\}/g, "");
  return stripped.replace(
    "<html lang=\"ru\">",
    "<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\" xmlns=\"http://www.w3.org/TR/REC-html40\" lang=\"ru\">",
  );
}
