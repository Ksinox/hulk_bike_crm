import { useState } from "react";
import {
  Download,
  FileSignature,
  FileText,
  Pencil,
  Receipt,
  Tags,
  Wallet,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Topbar } from "@/pages/dashboard/Topbar";
import { PriceListView } from "@/pages/rentals/PriceListView";
import { DocumentPreviewModal } from "@/pages/rentals/DocumentPreviewModal";
import { useApiRentals } from "@/lib/api/rentals";
import { TemplateEditorPage } from "./editor/TemplateEditorPage";
import { useApiDocumentTemplates } from "@/lib/api/document-templates";

type DocsTab = "templates" | "price" | "editor";

const TABS: { id: DocsTab; label: string; icon: typeof FileText }[] = [
  { id: "templates", label: "Шаблоны документов", icon: FileSignature },
  { id: "price", label: "Прейскурант", icon: Tags },
  { id: "editor", label: "Редактор шаблонов", icon: Wrench },
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
        {tab === "editor" && <EditorPlaceholder />}
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

function TemplatesGallery() {
  const { data: rentals = [], isLoading } = useApiRentals();
  const [previewing, setPreviewing] = useState<TemplateMeta | null>(null);

  // Берём первую попавшуюся аренду как «образцовую» для превью.
  // Приоритет: с реально заполненной парой клиент+скутер.
  const sampleRental = rentals.find((r) => r.scooterId && r.clientId) ?? rentals[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
        Здесь собраны все системные шаблоны документов CRM. Каждый можно
        открыть как <b>образец</b> — увидишь готовый вид документа на
        реальных данных.{" "}
        <span className="text-blue-700">
          В следующих релизах появится возможность редактировать тексты
          шаблонов прямо здесь.
        </span>
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
                <button
                  type="button"
                  disabled={disabled || isLoading}
                  onClick={() => setPreviewing(t)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-[10px] py-2 text-[12px] font-bold transition-colors",
                    disabled
                      ? "cursor-not-allowed bg-surface-soft text-muted-2"
                      : "bg-ink text-white hover:bg-blue-600",
                  )}
                  title={
                    disabled
                      ? "Сначала создайте аренду — образец нельзя посмотреть на пустой БД"
                      : undefined
                  }
                >
                  <FileText size={12} /> Посмотреть образец
                </button>
                <div className="flex items-center justify-between text-[10px] text-muted-2">
                  <span>где используется:</span>
                  <span className="font-semibold text-muted">
                    {t.kind === "rental"
                      ? "карточка аренды"
                      : t.kind === "damage"
                        ? "при фиксации ущерба"
                        : "карточка клиента"}
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

/* =================== Редактор шаблонов =================== */

type TemplateBucket = {
  key: string;
  name: string;
  description: string;
  icon: typeof FileText;
  tone: TemplateMeta["badgeTone"];
};

const EDITABLE_TEMPLATES: TemplateBucket[] = [
  {
    key: "contract_full",
    name: "Договор + Акт приёма-передачи",
    description:
      "Двухстраничный документ при выдаче. Можно редактировать любые формулировки, добавлять/удалять пункты и вставлять переменные клиента/скутера/аренды.",
    icon: FileSignature,
    tone: "blue",
  },
  {
    key: "act_return",
    name: "Акт возврата",
    description:
      "Подписывается при возврате скутера. Фиксирует пробег, состояние, отметки о повреждениях и наличие/возврат экипировки.",
    icon: FileText,
    tone: "purple",
  },
];

function EditorPlaceholder() {
  const { data: templates = [] } = useApiDocumentTemplates();
  const [editing, setEditing] = useState<TemplateBucket | null>(null);

  if (editing) {
    return (
      <TemplateEditorPage
        templateKey={editing.key}
        templateName={editing.name}
        onBack={() => setEditing(null)}
      />
    );
  }

  const hasOverride = (key: string) =>
    templates.some((t) => t.templateKey === key);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
        Здесь можно редактировать тексты системных шаблонов договоров.
        Отредактированный шаблон автоматически применяется при генерации
        документов из карточек аренды. Можно вставлять переменные через
        панель слева (drag-and-drop или клик), форматировать текст и
        работать с таблицами.
      </div>
      <div className="grid items-stretch gap-3 md:grid-cols-2">
        {EDITABLE_TEMPLATES.map((t) => {
          const Icon = t.icon;
          const overridden = hasOverride(t.key);
          return (
            <div
              key={t.key}
              className="flex h-full flex-col gap-3 rounded-[14px] border border-border bg-surface p-4"
            >
              <div className="flex items-start gap-2">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]",
                    BADGE_TONE_CLASSES[t.tone],
                  )}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[14px] font-bold leading-tight text-ink">
                      {t.name}
                    </div>
                    {overridden ? (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Изменён
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                        Системный
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 text-[12px] leading-snug text-muted-2">
                {t.description}
              </div>
              <button
                type="button"
                onClick={() => setEditing(t)}
                className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ink py-2 text-[12px] font-bold text-white hover:bg-blue-600"
              >
                <Pencil size={12} />{" "}
                {overridden ? "Открыть редактор" : "Редактировать"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="rounded-[10px] bg-surface-soft px-3 py-2 text-[11px] text-muted-2">
        💡 Совет: начни с открытия «Договор + Акт» — он самый часто
        используемый. Слева ты увидишь все доступные переменные, сгруппированные
        по сущностям (Клиент / Арендодатель / Скутер / Аренда). Перетащи их в
        нужные места текста — при генерации документа подставятся реальные
        данные конкретной аренды.
      </div>
    </div>
  );
}

/* Кнопка скачивания Word — на будущее, пока используем DocumentPreviewModal. */
export const _Download = Download;
