import { useState } from "react";
import {
  Download,
  FileSignature,
  FileText,
  Pencil,
  Tags,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Topbar } from "@/pages/dashboard/Topbar";
import { PriceListView } from "@/pages/rentals/PriceListView";
import { DocumentPreviewModal } from "@/pages/rentals/DocumentPreviewModal";
import { useApiRentals } from "@/lib/api/rentals";
import { TemplateEditorPage } from "./editor/TemplateEditorPage";
import { useApiDocumentTemplates } from "@/lib/api/document-templates";

type DocsTab = "templates" | "price";

const TABS: { id: DocsTab; label: string; icon: typeof FileText }[] = [
  { id: "templates", label: "Шаблоны документов", icon: FileSignature },
  { id: "price", label: "Прейскурант", icon: Tags },
];

/**
 * Раздел «Документы» — глобальный (один на всю CRM).
 *
 * Содержит:
 *  - **Шаблоны документов** — каталог системных шаблонов (договор,
 *    акты, выписки). Каждый можно открыть в режиме «образец» —
 *    превью на данных первой аренды из БД, чтобы видеть как
 *    выглядит результат.
 *  - **Прейскурант** — справочник цен (детали / штрафы / повреждения /
 *    экипировка) с привязкой групп к моделям. Используется при
 *    фиксации ущерба.
 *  - **Редактор шаблонов** — пока заглушка, в следующих релизах будет
 *    WYSIWYG-редактор с drag-and-drop переменных.
 */
export function Documents() {
  const [tab, setTab] = useState<DocsTab>("templates");

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <header className="flex items-baseline gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Документы
        </h1>
        <span className="text-[13px] text-muted-2">
          справочники и шаблоны
        </span>
      </header>

      <div className="inline-flex w-fit rounded-2xl border border-slate-200/60 bg-white/70 p-1 shadow-sm backdrop-blur">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition",
                tab === t.id
                  ? "bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-sm"
                  : "text-muted-2 hover:bg-slate-100 hover:text-ink",
              )}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface p-5 shadow-card-sm">
        {tab === "templates" && <TemplatesGallery />}
        {tab === "price" && <PriceListView />}
      </section>
    </main>
  );
}

/* =================== Каталог шаблонов =================== */

type TemplateMeta = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: "blue" | "amber" | "green" | "red" | "purple";
  icon: typeof FileText;
  /** Для открытия превью: rental-based, damage, statement. */
  kind: "rental" | "damage" | "statement";
  /** Тип документа в API (только для rental-based). */
  rentalType?:
    | "contract"
    | "contract_full"
    | "contract_full_intl"
    | "act_transfer"
    | "act_return"
    | "act_swap"
    | "purchase_deposit";
};

const TEMPLATES: TemplateMeta[] = [
  {
    id: "contract_full",
    title: "Договор + Акт приёма-передачи",
    subtitle:
      "Основной шаблон при выдаче скутера гражданину РФ. На двух страницах — договор и акт. Содержит все условия, реквизиты и описание ТС из карточки клиента и скутера.",
    badge: "Основной (РФ)",
    badgeTone: "blue",
    icon: FileSignature,
    kind: "rental",
    rentalType: "contract_full",
  },
  {
    id: "contract_full_intl",
    title: "Договор + Акт (для иностранца)",
    subtitle:
      "Версия основного шаблона для иностранного гражданина. Вместо РФ-полей паспорта — свободная строка из карточки клиента. Подставляется автоматически когда оператор печатает «Договор + Акт» по аренде с иностранцем.",
    badge: "Иностранец",
    badgeTone: "amber",
    icon: FileSignature,
    kind: "rental",
    rentalType: "contract_full_intl",
  },
  {
    id: "contract",
    title: "Договор проката (без акта)",
    subtitle:
      "Только сам договор без приложения с актом. Используется когда акт оформляется отдельно или подписывается заново при продлении/замене.",
    badge: "Только договор",
    badgeTone: "blue",
    icon: FileSignature,
    kind: "rental",
    rentalType: "contract",
  },
  {
    id: "act_transfer",
    title: "Акт приёма-передачи (выдача)",
    subtitle:
      "Приложение №1 к договору — самостоятельный акт выдачи скутера. Подписывается отдельно если ранее был распечатан только договор без акта.",
    badge: "При выдаче",
    badgeTone: "green",
    icon: FileText,
    kind: "rental",
    rentalType: "act_transfer",
  },
  {
    id: "act_return",
    title: "Акт возврата",
    subtitle:
      "Подписывается при окончательном возврате скутера в конце аренды. Фиксирует состояние, отметку о повреждениях и наличие/возврат экипировки. Открывается из карточки аренды → вкладка «Документы».",
    badge: "При возврате",
    badgeTone: "purple",
    icon: FileText,
    kind: "rental",
    rentalType: "act_return",
  },
  {
    id: "act_swap",
    title: "Акт приёма-передачи и замены скутера",
    subtitle:
      "Подкрепляется к действующему договору при замене скутера (ремонт, продажа, рассрочка). Содержит данные о возвращённом и о новом скутере, причину замены — подписывается клиентом.",
    badge: "При замене",
    badgeTone: "green",
    icon: FileText,
    kind: "rental",
    rentalType: "act_swap",
  },
  {
    id: "purchase_deposit",
    title: "Договор задатка (выкуп)",
    subtitle:
      "Используется при переводе скутера в рассрочку/выкуп. Фиксирует сумму задатка, схему оплаты и условия передачи права собственности. Подписывается одним документом в дополнение к основной аренде.",
    badge: "Выкуп",
    badgeTone: "purple",
    icon: FileSignature,
    kind: "rental",
    rentalType: "purchase_deposit",
  },
  {
    id: "damage",
    title: "Акт о повреждениях",
    subtitle:
      "Создаётся при фиксации ущерба по аренде. Список позиций из прейскуранта с количеством и комментариями, итог, зачёт залога, к доплате — для подписания клиентом.",
    badge: "Ущерб",
    badgeTone: "red",
    icon: AlertTriangle,
    kind: "damage",
  },
  {
    id: "statement",
    title: "Финансовая выписка по клиенту",
    subtitle:
      "Сводка для суда / претензий: все аренды клиента, все платежи (дата / тип / сумма / кто принял), акты ущерба с историей частичных оплат и остатком долга. Открывается с карточки клиента.",
    badge: "Для суда",
    badgeTone: "amber",
    icon: Wallet,
    kind: "statement",
  },
];

// Минималистичный дизайн — без цветовых акцентов на карточках,
// все одного нейтрального тона.

/** Какие шаблоны можно редактировать через Tiptap (override системного). */
const EDITABLE_KEYS = new Set([
  "contract",
  "contract_full",
  "contract_full_intl",
  "act_transfer",
  "act_return",
  "act_swap",
  "purchase_deposit",
  "damage",
]);

function TemplatesGallery() {
  const { data: rentals = [], isLoading } = useApiRentals();
  const { data: overrides = [] } = useApiDocumentTemplates();
  const [previewing, setPreviewing] = useState<TemplateMeta | null>(null);
  /** Что открыто в редакторе. Раньше поддерживался ещё «custom» / «new»
   *  (произвольные шаблоны юзера), но мы их выпилили — заказчик ими не
   *  пользовался, а кнопка «Добавить шаблон» только путала. Остался один
   *  режим — редактирование override'ов системных шаблонов. */
  const [editing, setEditing] = useState<
    { kind: "system"; meta: TemplateMeta } | null
  >(null);

  // Если открыт редактор — показываем его.
  if (editing?.kind === "system") {
    return (
      <TemplateEditorPage
        templateKey={editing.meta.id}
        templateName={editing.meta.title}
        onBack={() => setEditing(null)}
      />
    );
  }

  // Берём первую попавшуюся аренду как «образцовую» для превью.
  const sampleRental = rentals.find((r) => r.scooterId && r.clientId) ?? rentals[0];
  const hasOverride = (key: string) =>
    overrides.some((o) => o.templateKey === key && o.kind === "override");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-2xl border border-blue-100/80 bg-gradient-to-br from-blue-50/80 to-indigo-50/40 p-4 text-[12.5px] leading-relaxed text-blue-900">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
          <FileSignature size={15} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-blue-950">Шаблоны документов CRM</div>
          <div className="mt-0.5 text-blue-900/80">
            Каждый можно открыть как <b>образец</b> (превью на реальной аренде)
            или <b>редактировать</b> — текст подменится в редакторе и при
            генерации документа подставятся реальные данные.
          </div>
        </div>
      </div>

      <SectionHeading
        label="Системные шаблоны"
        count={TEMPLATES.length}
        hint="Базовые документы CRM — образец и редактирование"
      />

      <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          const disabled =
            (t.kind === "rental" || t.kind === "damage" || t.kind === "statement") &&
            !sampleRental;
          const overridden = hasOverride(t.id);
          return (
            <div
              key={t.id}
              className={cn(
                "group flex h-full flex-col gap-3 rounded-xl border bg-white p-4 transition-colors",
                "border-slate-200 hover:border-slate-300",
                overridden && "border-slate-300",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icon size={16} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-semibold leading-tight tracking-tight text-slate-900">
                    {t.title}
                  </h3>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {t.kind === "rental"
                      ? "из аренды"
                      : t.kind === "damage"
                        ? "из ущерба"
                        : "из клиента"}
                  </div>
                </div>
                {overridden && (
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    Изменён
                  </span>
                )}
              </div>
              <p className="flex-1 text-[12.5px] leading-relaxed text-slate-600">
                {t.subtitle}
              </p>
              <div className="flex gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  disabled={disabled || isLoading}
                  onClick={() => setPreviewing(t)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[12px] font-medium transition",
                    disabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                  title={
                    disabled
                      ? "Сначала создайте аренду — образец нельзя посмотреть на пустой БД"
                      : "Посмотреть пример документа на реальной аренде"
                  }
                >
                  <FileText size={12} /> Образец
                </button>
                {EDITABLE_KEYS.has(t.id) ? (
                  <button
                    type="button"
                    onClick={() => setEditing({ kind: "system", meta: t })}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-900 bg-slate-900 py-1.5 text-[12px] font-medium text-white transition hover:bg-slate-800"
                    title="Открыть в редакторе шаблонов"
                  >
                    <Pencil size={12} /> Редактировать
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-[12px] font-medium text-slate-400"
                    title="Редактирование этого шаблона будет доступно в следующих релизах — он генерируется программно с переменным числом строк."
                  >
                    <Pencil size={12} /> Редактировать
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {previewing && sampleRental && (
        <TemplatePreview
          template={previewing}
          rentalId={sampleRental.id}
          clientId={sampleRental.clientId}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}

function TemplatePreview({
  template,
  rentalId,
  clientId,
  onClose,
}: {
  template: TemplateMeta;
  rentalId: number;
  clientId: number;
  onClose: () => void;
}) {
  const base =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

  let htmlUrl = "";
  let docxUrl = "";
  let docxFilename = "";

  if (template.kind === "rental" && template.rentalType) {
    htmlUrl = `${base}/api/rentals/${rentalId}/document/${template.rentalType}?format=html`;
    docxUrl = `${base}/api/rentals/${rentalId}/document/${template.rentalType}?format=docx`;
    docxFilename = `${template.title} (образец).doc`;
  } else if (template.kind === "damage") {
    // Для damage показываем превью по «любому» damage_report. Если
    // у sampleRental нет damage report — fall back на сам шаблон HTML
    // с пустыми данными. Пока просто откроем по rentalId — endpoint
    // отдаст 404 если нет акта.
    htmlUrl = `${base}/api/rentals/${rentalId}/document/act_return?format=html`;
    docxUrl = `${base}/api/rentals/${rentalId}/document/act_return?format=docx`;
    docxFilename = `${template.title} (образец).doc`;
  } else if (template.kind === "statement") {
    htmlUrl = `${base}/api/clients/${clientId}/statement?format=html`;
    docxUrl = `${base}/api/clients/${clientId}/statement?format=docx`;
    docxFilename = `${template.title} (образец).doc`;
  }

  // templateKey для редактирования шаблона прямо из превью образца:
  // - для rental-based шаблонов берём rentalType (act_transfer/act_return/...);
  // - для damage используем хардкод "damage" (в галерее свой ключ);
  // - для client statement редактирования нет.
  const editableKey: string | undefined =
    template.kind === "rental"
      ? template.rentalType
      : template.kind === "damage"
        ? "damage"
        : undefined;
  return (
    <DocumentPreviewModal
      title={`${template.title} — образец`}
      htmlUrl={htmlUrl}
      docxUrl={docxUrl}
      docxFilename={docxFilename}
      templateKey={editableKey}
      templateName={template.title}
      onClose={onClose}
    />
  );
}

/** Элегантный заголовок секции с цифрой и подсказкой. */
function SectionHeading({
  label,
  count,
  hint,
}: {
  label: string;
  count?: number;
  hint?: string;
}) {
  return (
    <div className="mt-2 flex items-end justify-between gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
          {label}
        </h2>
        {count != null && count > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-muted">
            {count}
          </span>
        )}
      </div>
      {hint && (
        <div className="text-[11px] italic text-muted-2">{hint}</div>
      )}
    </div>
  );
}

/* Кнопка скачивания Word — на будущее, пока используем DocumentPreviewModal. */
export const _Download = Download;
