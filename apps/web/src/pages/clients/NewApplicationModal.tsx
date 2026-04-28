import { useEffect, useState } from "react";
import { Bell, Check, Clock, Trash2, X } from "lucide-react";
import {
  applicationFileUrl,
  type ApiApplication,
  type ApplicationFileKind,
} from "@/lib/api/clientApplications";

/**
 * Полноэкранная модалка «Новая заявка».
 *
 * Показывается автоматически когда `NewApplicationDetector` находит
 * заявку, которую менеджер ещё не видел. Поверх любой страницы CRM —
 * блокирует backdrop, чтобы менеджер не пропустил.
 *
 * Кнопки:
 *  • «Оформить сейчас» — открывает AddClientModal с предзаполненными
 *    полями + перенос фото (через convert API).
 *  • «Позже» — модалка закрывается, заявка помечается viewed.
 *  • «Это спам» — заявка удаляется (с confirm).
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
  license: "Права",
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

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm sm:p-8">
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-surface shadow-2xl">
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

        <div className="space-y-4 px-6 py-5">
          <Section title="Контакты">
            <Row label="ФИО" value={application.name} />
            <Row label="Телефон" value={application.phone} />
            {application.extraPhone && (
              <Row label="Доп. телефон" value={application.extraPhone} />
            )}
            <Row label="Дата рождения" value={formatDate(application.birthDate)} />
            <Row
              label="Гражданство"
              value={application.isForeigner ? "Иностранец" : "Россия"}
            />
          </Section>

          <Section title="Документ">
            {application.isForeigner ? (
              <Row label="Описание" value={application.passportRaw} multiline />
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
                <Row label="Кем выдан" value={application.passportIssuer} multiline />
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

          <Section title={`Фото (${application.files.length} из 4)`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                ["passport_main", "passport_reg", "license", "selfie"] as const
              ).map((k) => (
                <PhotoTile
                  key={k}
                  applicationId={application.id}
                  kind={k}
                  label={KIND_LABEL[k]}
                  hasFile={fileKinds.has(k)}
                  onZoom={() => setZoomed(k)}
                />
              ))}
            </div>
            <div className="mt-2 text-[11px] text-muted-2">
              Нажмите на фото для увеличения
            </div>
          </Section>
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
          <img
            src={applicationFileUrl(application.id, zoomed)}
            alt={KIND_LABEL[zoomed]}
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </div>
      <div className="rounded-xl border border-border bg-white p-3">{children}</div>
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
        <div className="text-[12px] uppercase tracking-wide text-muted">
          {label}
        </div>
        <div className="mt-0.5 text-[14px] text-ink">{value || "—"}</div>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-[12px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="text-right text-[14px] font-medium text-ink">
        {value || "—"}
      </span>
    </div>
  );
}

function PhotoTile({
  applicationId,
  kind,
  label,
  hasFile,
  onZoom,
}: {
  applicationId: number;
  kind: ApplicationFileKind;
  label: string;
  hasFile: boolean;
  onZoom: () => void;
}) {
  if (!hasFile) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-surface-soft text-[11px] text-muted-2">
        <span>{label}</span>
        <span>не загружено</span>
      </div>
    );
  }
  const url = applicationFileUrl(applicationId, kind);
  return (
    <button
      type="button"
      onClick={onZoom}
      className="group overflow-hidden rounded-lg border border-border bg-surface-soft text-left transition-transform hover:scale-[1.02] hover:border-ink"
      title={`Открыть «${label}»`}
    >
      <img
        src={url}
        alt={label}
        className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="px-2 py-1 text-[11px] font-medium text-ink">{label}</div>
    </button>
  );
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}
