import { useState } from "react";
import {
  Download,
  FileSignature,
  FileText,
  Pencil,
  Plus,
  Upload,
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
import { CustomTemplateEditor } from "./editor/CustomTemplateEditor";
import { useApiDocumentTemplates } from "@/lib/api/document-templates";
import { importFileToHtml } from "./editor/importFile";
import { toast } from "@/lib/toast";

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
  /** Для открытия превью: rental-based ('contract_full', 'act_return',
   *  'damage') или client-based ('statement'). */
  kind: "rental" | "damage" | "statement";
  /** Тип документа в API (только для rental-based). */
  rentalType?: "contract_full" | "act_return" | "act_swap";
};

const TEMPLATES: TemplateMeta[] = [
  {
    id: "contract_full",
    title: "Договор + Акт приёма-передачи",
    subtitle:
      "Основной шаблон при выдаче скутера. На двух страницах — договор и акт. Содержит все условия, реквизиты и описание ТС из карточки клиента и скутера.",
    badge: "Основной",
    badgeTone: "blue",
    icon: FileSignature,
    kind: "rental",
    rentalType: "contract_full",
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
  "contract_full",
  "act_return",
  "act_swap",
  "damage",
]);

function TemplatesGallery() {
  const { data: rentals = [], isLoading } = useApiRentals();
  const { data: overrides = [] } = useApiDocumentTemplates();
  const [previewing, setPreviewing] = useState<TemplateMeta | null>(null);
  /** Что открыто в редакторе:
   *  - { kind:'system', meta } — редактируем системный шаблон
   *  - { kind:'custom', id }    — редактируем существующий custom-шаблон
   *  - { kind:'new', initialHtml } — создаём новый custom (опц. из импорта)
   */
  const [editing, setEditing] = useState<
    | { kind: "system"; meta: TemplateMeta }
    | { kind: "custom"; id: number }
    | { kind: "new"; initialHtml: string }
    | null
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
  if (editing?.kind === "custom" || editing?.kind === "new") {
    return (
      <CustomTemplateEditor
        existingId={editing.kind === "custom" ? editing.id : null}
        initialHtmlForNew={
          editing.kind === "new" ? editing.initialHtml : undefined
        }
        onBack={() => setEditing(null)}
      />
    );
  }

  // Берём первую попавшуюся аренду как «образцовую» для превью.
  const sampleRental = rentals.find((r) => r.scooterId && r.clientId) ?? rentals[0];
  const hasOverride = (key: string) =>
    overrides.some((o) => o.templateKey === key && o.kind === "override");
  const customs = overrides.filter((t) => t.kind === "custom");

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
            генерации документа подставятся реальные данные. Чтобы добавить
            свой шаблон — карточка <b>«+ Добавить шаблон»</b> в разделе ниже.
          </div>
        </div>
      </div>

      {/* Зона «Мои шаблоны»: карточки custom-шаблонов + интерактивная
          dropzone-карточка «+ Добавить» в той же сетке. Клик по dropzone
          открывает пустой редактор; перетаскивание файла на dropzone
          импортирует .docx/.md/.html/.txt и открывает в редакторе. */}
      <SectionHeading
        label="Мои шаблоны"
        count={customs.length}
        hint="Кастомные документы — клик чтобы открыть в редакторе"
      />
      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        {customs.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setEditing({ kind: "custom", id: c.id })}
            className="group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
          >
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 via-sky-400 to-indigo-400" />
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-sm">
              <FileText size={18} strokeWidth={2.2} />
            </div>
            <div className="text-[14px] font-bold leading-tight tracking-tight text-ink">
              {c.name}
            </div>
            <div className="text-[11px] text-muted-2">
              обновлён{" "}
              {new Date(c.updatedAt).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            <div className="mt-auto inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 transition-transform group-hover:translate-x-0.5">
              Открыть в редакторе →
            </div>
          </button>
        ))}
        <AddTemplateDropzone
          onCreateEmpty={() =>
            setEditing({ kind: "new", initialHtml: "<p></p>" })
          }
          onImport={(html) => setEditing({ kind: "new", initialHtml: html })}
        />
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

  return (
    <DocumentPreviewModal
      title={`${template.title} — образец`}
      htmlUrl={htmlUrl}
      docxUrl={docxUrl}
      docxFilename={docxFilename}
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

/**
 * Карточка-dropzone «+ Добавить шаблон» — встаёт в сетку «Мои шаблоны».
 *
 * Поведение:
 *  - Клик по карточке → открывает пустой редактор (создание нового шаблона)
 *  - Drag-and-drop файла на карточку → импортирует .docx/.md/.html/.txt
 *    и открывает в редакторе
 *  - Кнопка «Загрузить файл» внутри карточки — альтернатива drop'у через
 *    нативный файловый диалог
 *
 * Визуально: gradient dashed border blue, при ховере/drag — выразительная
 * подсветка с пульсацией.
 */
function AddTemplateDropzone({
  onCreateEmpty,
  onImport,
}: {
  onCreateEmpty: () => void;
  onImport: (html: string) => void;
}) {
  const [importing, setImporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const html = await importFileToHtml(file);
      onImport(html);
      toast.success(
        "Файл загружен в редактор",
        `«${file.name}» — теперь расставьте переменные через сайдбар.`,
      );
    } catch (e) {
      toast.error("Не удалось импортировать", (e as Error).message ?? "");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCreateEmpty}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onCreateEmpty();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dragActive) setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleFile(file);
      }}
      className={cn(
        "group relative flex h-full min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl border-2 border-dashed p-5 text-center transition-all duration-200 focus:outline-none",
        dragActive
          ? "scale-[1.01] border-blue-500 bg-gradient-to-br from-blue-100 to-indigo-100 shadow-lg ring-4 ring-blue-200/60"
          : "border-blue-300 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md",
        importing && "cursor-wait opacity-70",
      )}
      title="Кликните чтобы создать пустой шаблон, или перетащите Word/Markdown/HTML файл"
    >
      {/* Декоративные капли в углах для жизни */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-blue-300/20 blur-2xl transition-all group-hover:bg-blue-400/30" />
      <div className="pointer-events-none absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-indigo-300/20 blur-2xl transition-all group-hover:bg-indigo-400/30" />

      <div
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-md transition-all duration-300",
          dragActive
            ? "scale-110 bg-gradient-to-br from-blue-500 to-indigo-600 text-white"
            : "bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600 group-hover:scale-110 group-hover:from-blue-500 group-hover:to-indigo-600 group-hover:text-white",
        )}
      >
        {importing ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Plus size={26} strokeWidth={2.5} />
        )}
      </div>
      <div className="relative text-[15px] font-bold tracking-tight text-ink">
        {importing
          ? "Загружаем файл…"
          : dragActive
            ? "Отпустите файл здесь"
            : "Добавить шаблон"}
      </div>
      <div className="relative max-w-[260px] text-[11.5px] leading-relaxed text-muted-2">
        Кликни чтобы создать <b className="text-ink">пустой</b>, или{" "}
        <b className="text-ink">перетащи</b> сюда файл —<br />
        Word, Markdown, HTML или TXT
      </div>
      <label
        className="relative mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-700 shadow-sm ring-1 ring-blue-200 transition hover:bg-blue-50 hover:shadow"
        onClick={(e) => e.stopPropagation()}
      >
        <Upload size={12} /> Выбрать файл
        <input
          type="file"
          accept=".docx,.md,.markdown,.html,.htm,.txt"
          className="hidden"
          onChange={(e) => {
            void handleFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
          disabled={importing}
        />
      </label>
    </div>
  );
}

/* Кнопка скачивания Word — на будущее, пока используем DocumentPreviewModal. */
export const _Download = Download;
