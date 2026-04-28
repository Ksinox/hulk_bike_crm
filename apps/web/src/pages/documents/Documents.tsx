import { useState } from "react";
import {
  Download,
  FileSignature,
  FileText,
  Pencil,
  Plus,
  Upload,
  Receipt,
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

      <div className="inline-flex w-fit rounded-[10px] bg-surface-soft p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition",
                tab === t.id
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted-2 hover:text-ink",
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
  rentalType?: "contract_full" | "act_return";
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
    id: "act_return",
    title: "Акт возврата",
    subtitle:
      "Подписывается при возврате скутера. Фиксирует пробег, состояние, отметку о повреждениях и наличие/возврат экипировки. Открывается из карточки аренды.",
    badge: "При возврате",
    badgeTone: "purple",
    icon: FileText,
    kind: "rental",
    rentalType: "act_return",
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

const BADGE_TONE_CLASSES: Record<TemplateMeta["badgeTone"], string> = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-green-soft text-green-ink",
  red: "bg-red-soft text-red-ink",
  purple: "bg-purple-soft text-purple-ink",
};

/** Какие шаблоны можно редактировать через Tiptap (override системного). */
const EDITABLE_KEYS = new Set(["contract_full", "act_return", "damage"]);

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
      <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
        Здесь собраны все системные шаблоны документов CRM. Каждый можно
        открыть как <b>образец</b> (превью на реальной аренде) или{" "}
        <b>редактировать</b> — текст подменится в редакторе и при
        генерации документа подставятся реальные данные. Чтобы добавить
        свой шаблон — кнопка <b>«+ Добавить документ»</b> ниже.
      </div>

      <AddDocumentBar
        onCreateEmpty={() => setEditing({ kind: "new", initialHtml: "<p></p>" })}
        onImport={(html) => setEditing({ kind: "new", initialHtml: html })}
      />

      {customs.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Мои документы ({customs.length})
          </div>
          <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
            {customs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEditing({ kind: "custom", id: c.id })}
                className="flex flex-col items-start gap-1 rounded-[14px] border border-border bg-surface p-4 text-left hover:border-blue-400 hover:bg-blue-50"
              >
                <div className="text-[13px] font-bold text-ink">{c.name}</div>
                <div className="text-[11px] text-muted-2">
                  обновлён{" "}
                  {new Date(c.updatedAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="mt-2 text-[11px] font-semibold text-blue-700">
                  Открыть в редакторе →
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
        Системные шаблоны
      </div>

      <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          const disabled =
            (t.kind === "rental" || t.kind === "damage" || t.kind === "statement") &&
            !sampleRental;
          return (
            <div
              key={t.id}
              className="flex h-full flex-col gap-3 rounded-[14px] border border-border bg-surface p-4"
            >
              <div className="flex items-start gap-2">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]",
                    BADGE_TONE_CLASSES[t.badgeTone],
                  )}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[14px] font-bold leading-tight text-ink">
                      {t.title}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        BADGE_TONE_CLASSES[t.badgeTone],
                      )}
                    >
                      {t.badge}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 text-[12px] leading-snug text-muted-2">
                {t.subtitle}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={disabled || isLoading}
                    onClick={() => setPreviewing(t)}
                    className={cn(
                      "inline-flex items-center justify-center gap-1.5 rounded-[10px] py-2 text-[12px] font-bold transition-colors",
                      disabled
                        ? "cursor-not-allowed bg-surface-soft text-muted-2"
                        : "bg-surface-soft text-ink hover:bg-blue-50 hover:text-blue-700",
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
                      className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ink py-2 text-[12px] font-bold text-white transition-colors hover:bg-blue-600"
                      title="Открыть в редакторе шаблонов"
                    >
                      <Pencil size={12} />{" "}
                      {hasOverride(t.id) ? "Редактировать" : "Редактировать"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-[10px] bg-surface-soft py-2 text-[12px] font-bold text-muted-2"
                      title="Редактирование этого шаблона будет доступно в следующих релизах — он генерируется программно с переменным числом строк (позиции ущерба / список платежей)."
                    >
                      <Pencil size={12} /> Редактировать
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-2">
                  <span>
                    {hasOverride(t.id) ? (
                      <span className="font-bold text-amber-700">
                        Изменён вами
                      </span>
                    ) : (
                      "системный по умолчанию"
                    )}
                  </span>
                  <span className="font-semibold text-muted">
                    {t.kind === "rental"
                      ? "из аренды"
                      : t.kind === "damage"
                        ? "из ущерба"
                        : "из клиента"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Будущие шаблоны — карточка-плейсхолдер */}
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border p-4 text-center">
          <Receipt size={20} className="text-muted-2" />
          <div className="text-[12px] font-semibold text-ink">
            Здесь появятся ваши шаблоны
          </div>
          <div className="text-[11px] text-muted-2">
            Добавите свои документы в редакторе (скоро)
          </div>
        </div>
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

/**
 * Панель «Добавить документ» — две кнопки:
 *  - «Создать пустой» → открывает чистый редактор для нового шаблона
 *  - «Импорт из файла» → загружает .docx/.md/.html/.txt, конвертирует
 *    в HTML и открывает в редакторе
 */
function AddDocumentBar({
  onCreateEmpty,
  onImport,
}: {
  onCreateEmpty: () => void;
  onImport: (html: string) => void;
}) {
  const [importing, setImporting] = useState(false);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    try {
      const html = await importFileToHtml(file);
      onImport(html);
      toast.success(
        "Файл загружен в редактор",
        `«${file.name}» — теперь можно расставить переменные через сайдбар.`,
      );
    } catch (e) {
      toast.error("Не удалось импортировать", (e as Error).message ?? "");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-dashed border-blue-300 bg-blue-50/40 p-3">
      <span className="text-[12px] font-semibold text-ink">
        Добавить новый документ:
      </span>
      <button
        type="button"
        onClick={onCreateEmpty}
        className="inline-flex items-center gap-1.5 rounded-[10px] bg-ink px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-600"
      >
        <Plus size={12} /> Создать пустой
      </button>
      <label
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] bg-white px-3 py-1.5 text-[12px] font-bold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50",
          importing && "cursor-wait opacity-60",
        )}
        title="Загрузить .docx (Word), .md (Markdown), .html или .txt"
      >
        <Upload size={12} />
        {importing ? "Загружаем…" : "Импорт из файла (Word / MD / HTML)"}
        <input
          type="file"
          accept=".docx,.md,.markdown,.html,.htm,.txt"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0] ?? null);
            e.target.value = ""; // позволить перевыбрать тот же файл
          }}
          disabled={importing}
        />
      </label>
      <span className="text-[10px] text-muted-2">
        Поддерживаются: .docx, .md, .html, .txt. Сохраняются заголовки,
        списки, таблицы, форматирование.
      </span>
    </div>
  );
}

/* Кнопка скачивания Word — на будущее, пока используем DocumentPreviewModal. */
export const _Download = Download;
