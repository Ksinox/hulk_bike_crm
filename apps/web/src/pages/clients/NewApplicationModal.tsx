import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  Check,
  Clock,
  ExternalLink,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  applicationFileUrl,
  type ApiApplication,
  type ApplicationFile,
  type ApplicationFileKind,
} from "@/lib/api/clientApplications";

/**
 * Полноэкранная карточка-«личное дело» новой заявки.
 *
 * Layout:
 *  ┌─────────────────────────────────────┐
 *  │ [портрет]  ФИО, телефон, ДР…        │  верхний блок: фото-селфи
 *  │            гражданство              │  слева, основная инфа справа
 *  ├─────────────────────────────────────┤
 *  │ Паспорт: серия/номер/выдан…         │
 *  │ Адрес проживания                    │
 *  ├─────────────────────────────────────┤
 *  │ [Паспорт] [Прописка] [Права]        │  фото документов плитками
 *  └─────────────────────────────────────┘
 *  [Это спам]                [Позже] [Оформить сейчас]
 *
 * Все фото кликабельны — открываются на 90vh в lightbox.
 *
 * Cross-origin картинки: web на crm.hulkbike.ru, API на api.hulkbike.ru.
 * Чтобы <img> отдавал cookie hulk_session, нужен crossOrigin="use-credentials"
 * + сервер с CORS credentials:true (уже настроено в apps/api/src/index.ts).
 */

type Props = {
  application: ApiApplication;
  onConvertNow: () => void;
  onLater: () => void;
  onDelete: () => void;
};

const KIND_LABEL: Record<ApplicationFileKind, string> = {
  passport_main: "Паспорт",
  passport_reg: "Прописка",
  license: "Водительское",
  selfie: "Селфи",
};

export function NewApplicationModal({
  application,
  onConvertNow,
  onLater,
  onDelete,
}: Props) {
  const [zoomed, setZoomed] = useState<ApplicationFileKind | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomed) setZoomed(null);
        else onLater();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLater, zoomed]);

  const handleDelete = () => {
    if (window.confirm("Удалить заявку как спам? Действие необратимо.")) {
      onDelete();
    }
  };

  const fileKinds = new Set(application.files.map((f) => f.kind));
  const hasSelfie = fileKinds.has("selfie");

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm sm:p-8">
      <div className="my-6 w-full max-w-3xl rounded-2xl bg-surface shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border bg-amber-50 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">
            <Bell size={20} />
          </div>
          <div className="flex-1">
            <div className="text-[18px] font-bold text-ink">Новая заявка</div>
            <div className="text-[12px] text-muted">
              Заполнена клиентом по публичной ссылке
            </div>
          </div>
        </header>

        {/* Личное дело: портрет (селфи) + инфа справа */}
        <div className="grid gap-5 px-6 py-5 sm:grid-cols-[180px_1fr]">
          <div className="flex flex-col gap-2">
            <Portrait
              applicationId={application.id}
              file={application.files.find((f) => f.kind === "selfie") ?? null}
              onZoom={() => hasSelfie && setZoomed("selfie")}
            />
            <div className="text-center text-[11px] text-muted">
              {hasSelfie ? "Нажмите для увеличения" : "Селфи не приложено"}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-[20px] font-bold text-ink">
                {application.name || "Имя не указано"}
              </div>
              <div className="text-[13px] text-muted">
                {application.phone || "Телефон не указан"}
                {application.extraPhone && (
                  <span> · доп. {application.extraPhone}</span>
                )}
              </div>
            </div>

            <Section>
              <Row
                label="Дата рождения"
                value={formatDate(application.birthDate)}
              />
              <Row
                label="Гражданство"
                value={application.isForeigner ? "Иностранец" : "Россия"}
              />
            </Section>

            <Section title="Документ">
              {application.isForeigner ? (
                <Row
                  label="Описание"
                  value={application.passportRaw}
                  multiline
                />
              ) : (
                <>
                  <Row
                    label="Паспорт"
                    value={
                      application.passportSeries && application.passportNumber
                        ? `${application.passportSeries} ${application.passportNumber}`
                        : null
                    }
                  />
                  <Row
                    label="Кем выдан"
                    value={application.passportIssuer}
                    multiline
                  />
                  <Row
                    label="Дата выдачи"
                    value={formatDate(application.passportIssuedOn)}
                  />
                  {application.passportDivisionCode && (
                    <Row
                      label="Код подразделения"
                      value={application.passportDivisionCode}
                    />
                  )}
                  <Row
                    label="Регистрация"
                    value={application.passportRegistration}
                    multiline
                  />
                </>
              )}
            </Section>

            <Section title="Адрес проживания">
              <Row
                label="Адрес"
                value={
                  application.sameAddress
                    ? "Совпадает с регистрацией"
                    : application.liveAddress
                }
                multiline
              />
            </Section>
          </div>
        </div>

        {/* Документы внизу — большие плитки */}
        <div className="border-t border-border px-6 py-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">
              Фото документов
            </div>
            <div className="text-[11px] text-muted-2">
              {application.files.length} из 4 загружено · нажмите для увеличения
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["passport_main", "passport_reg", "license"] as const).map((k) => (
              <DocumentTile
                key={k}
                applicationId={application.id}
                kind={k}
                label={KIND_LABEL[k]}
                file={application.files.find((f) => f.kind === k) ?? null}
                onZoom={() => setZoomed(k)}
              />
            ))}
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-border bg-surface-soft px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 size={14} /> Это спам
          </button>
          <div className="flex flex-1 gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onLater}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-white px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-soft sm:flex-initial"
            >
              <Clock size={16} /> Позже
            </button>
            <button
              type="button"
              onClick={onConvertNow}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink px-5 text-[14px] font-semibold text-white transition-colors hover:bg-ink-2 sm:flex-initial"
            >
              <Check size={16} /> Оформить сейчас
            </button>
          </div>
        </footer>
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomed(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(null);
            }}
            title="Закрыть (Esc)"
          >
            <X size={20} />
          </button>
          <ZoomImage
            applicationId={application.id}
            kind={zoomed}
            file={application.files.find((f) => f.kind === zoomed) ?? null}
            label={KIND_LABEL[zoomed]}
          />
        </div>
      )}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function Portrait({
  applicationId,
  file,
  onZoom,
}: {
  applicationId: number;
  file: ApplicationFile | null;
  onZoom: () => void;
}) {
  const [broken, setBroken] = useState(false);

  if (!file) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-soft text-muted">
        <User size={48} />
      </div>
    );
  }
  if (broken) {
    return (
      <BrokenPlaceholder
        applicationId={applicationId}
        kind="selfie"
        file={file}
        aspect="aspect-square"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onZoom}
      className="group aspect-square w-full overflow-hidden rounded-2xl border border-border bg-surface-soft transition-transform hover:scale-[1.02] hover:border-ink"
      title="Открыть селфи"
    >
      <img
        src={applicationFileUrl(applicationId, "selfie")}
        alt="Селфи"
        crossOrigin="use-credentials"
        className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
        onError={() => setBroken(true)}
      />
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {title && (
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {title}
        </div>
      )}
      <div className="rounded-xl border border-border bg-white p-3">
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <div className="border-b border-border py-2 last:border-0">
        <div className="text-[11px] uppercase tracking-wide text-muted">
          {label}
        </div>
        <div className="mt-0.5 text-[14px] text-ink">{value || "—"}</div>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="text-right text-[14px] font-medium text-ink">
        {value || "—"}
      </span>
    </div>
  );
}

function DocumentTile({
  applicationId,
  kind,
  label,
  file,
  onZoom,
}: {
  applicationId: number;
  kind: ApplicationFileKind;
  label: string;
  file: ApplicationFile | null;
  onZoom: () => void;
}) {
  const [broken, setBroken] = useState(false);

  if (!file) {
    return (
      <div className="flex aspect-[3/2] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface-soft p-2 text-center text-[11px] text-muted-2">
        <span className="font-semibold">{label}</span>
        <span>не загружено</span>
      </div>
    );
  }
  if (broken) {
    return (
      <div className="flex aspect-[3/2] flex-col overflow-hidden rounded-xl border border-amber-300 bg-amber-50">
        <BrokenPlaceholder
          applicationId={applicationId}
          kind={kind}
          file={file}
          aspect="flex-1"
        />
        <div className="bg-white px-2 py-1 text-[11px] font-semibold text-ink">
          {label}
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onZoom}
      className="group flex aspect-[3/2] flex-col overflow-hidden rounded-xl border border-border bg-surface-soft text-left transition-transform hover:scale-[1.02] hover:border-ink"
      title={`Открыть «${label}»`}
    >
      <div className="relative flex-1 overflow-hidden">
        <img
          src={applicationFileUrl(applicationId, kind)}
          alt={label}
          crossOrigin="use-credentials"
          className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
          onError={() => setBroken(true)}
        />
      </div>
      <div className="bg-white px-2 py-1 text-[11px] font-semibold text-ink">
        {label}
      </div>
    </button>
  );
}

/** Большое фото в lightbox с onError-fallback. */
function ZoomImage({
  applicationId,
  kind,
  file,
  label,
}: {
  applicationId: number;
  kind: ApplicationFileKind;
  file: ApplicationFile | null;
  label: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = applicationFileUrl(applicationId, kind);
  if (broken && file) {
    const ext = (file.fileName.split(".").pop() ?? "").toUpperCase();
    const sizeKb = Math.round(file.size / 1024);
    return (
      <div
        className="rounded-2xl bg-white p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <AlertCircle size={48} className="mx-auto text-amber-500" />
        <div className="mt-3 text-[16px] font-semibold text-ink">
          {label} не отображается в браузере
        </div>
        <div className="mt-1 text-[13px] text-muted">
          Файл: {file.fileName} · {ext || file.mimeType} · {sizeKb} КБ
        </div>
        <div className="mt-2 text-[12px] text-muted-2">
          Скорее всего формат HEIC/HEIF (с iPhone) — не отображается в Chrome.
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink-2"
        >
          <ExternalLink size={14} /> Открыть в новой вкладке
        </a>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={label}
      crossOrigin="use-credentials"
      className="max-h-[90vh] max-w-full rounded-lg object-contain"
      onClick={(e) => e.stopPropagation()}
      onError={() => setBroken(true)}
    />
  );
}

/**
 * Плейсхолдер на случай если <img> упал onError. Показывает причину
 * (формат файла и размер) + кнопку «Открыть в новой вкладке» —
 * браузер скачает или откроет встроенным просмотрщиком.
 */
function BrokenPlaceholder({
  applicationId,
  kind,
  file,
  aspect,
}: {
  applicationId: number;
  kind: ApplicationFileKind;
  file: ApplicationFile;
  aspect: string;
}) {
  const url = applicationFileUrl(applicationId, kind);
  const ext = (file.fileName.split(".").pop() ?? "").toUpperCase();
  const sizeKb = Math.round(file.size / 1024);
  return (
    <div
      className={`${aspect} flex w-full flex-col items-center justify-center gap-1.5 bg-amber-50 p-3 text-center`}
    >
      <AlertCircle size={20} className="text-amber-600" />
      <div className="text-[11px] font-semibold text-amber-800">
        Не отображается
      </div>
      <div className="text-[10px] text-amber-700">
        {ext || file.mimeType} · {sizeKb} КБ
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-ink hover:bg-amber-100"
      >
        <ExternalLink size={10} /> Открыть
      </a>
    </div>
  );
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}
