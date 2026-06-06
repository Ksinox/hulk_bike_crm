import { useState } from "react";
import {
  Phone,
  User,
  X,
  MapPin,
  CalendarDays,
  Package,
  Bike,
  Clock,
  Maximize2,
  ImageOff,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applicationFileUrl,
  type ApiApplication,
  type ApplicationFileKind,
  type ApplicationStatus,
} from "@/lib/api/clientApplications";
import { useApiEquipment } from "@/lib/api/equipment";

/**
 * Просмотр входящей заявки — единый компонент для мобилы и десктопа.
 * Apple-стиль: крупное селфи + имя, галерея документов с зумом, сгруппированные
 * секции (хочет арендовать / личное / документ / адрес). Только чтение —
 * действия (принять/отклонить) даёт обёртка.
 */

const DOC_ORDER: ApplicationFileKind[] = [
  "selfie",
  "passport_main",
  "passport_reg",
  "license",
];
const DOC_LABEL: Record<ApplicationFileKind, string> = {
  selfie: "Селфи",
  passport_main: "Паспорт",
  passport_reg: "Прописка",
  license: "Права",
};

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; cls: string }
> = {
  draft: { label: "Черновик", cls: "bg-surface-soft text-muted" },
  new: { label: "Новая", cls: "bg-orange-soft text-orange-ink" },
  viewed: { label: "Просмотрена", cls: "bg-blue-50 text-blue-700" },
  accepted: { label: "Принята", cls: "bg-green-soft text-green-ink" },
  rejected: { label: "Отклонена", cls: "bg-red-soft text-red-ink" },
  spam: { label: "Спам", cls: "bg-orange-soft text-orange-ink" },
  cancelled: { label: "Отменена", cls: "bg-surface-soft text-muted-2" },
};

const SOURCE_LABEL: Record<string, string> = {
  avito: "Авито",
  repeat: "Уже катался",
  ref: "Рекомендация",
  maps: "Карты",
  other: "Другое",
};

/** ISO (YYYY-MM-DD или полный) → ДД.ММ.ГГГГ. */
function ruDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU");
}
function ruDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceText(app: ApiApplication): string {
  if (!app.source) return "—";
  const base = SOURCE_LABEL[app.source] ?? app.source;
  return app.source === "other" && app.sourceCustom
    ? `${base}: ${app.sourceCustom}`
    : base;
}

export function ApplicationView({ app }: { app: ApiApplication }) {
  const [zoom, setZoom] = useState<ApplicationFileKind | null>(null);
  const haveKinds = new Set(app.files.map((f) => f.kind));
  const selfie = haveKinds.has("selfie");

  const { data: equipment = [] } = useApiEquipment();
  const eqNames = (app.requestedEquipmentIds ?? [])
    .map((id) => equipment.find((e) => e.id === id)?.name)
    .filter((x): x is string => !!x);

  const hasWishes =
    !!app.requestedModel ||
    !!app.requestedDays ||
    !!app.requestedStartDate ||
    (app.requestedEquipmentIds?.length ?? 0) > 0;
  const passportFull =
    app.passportSeries || app.passportNumber
      ? `${app.passportSeries ?? ""} ${app.passportNumber ?? ""}`.trim()
      : null;
  const issued =
    app.passportIssuedOn || app.passportIssuer
      ? `${ruDate(app.passportIssuedOn)}${
          app.passportIssuer ? ` · ${app.passportIssuer}` : ""
        }`
      : null;
  const meta = STATUS_META[app.status];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Hero: селфи + имя + статус + телефон ── */}
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          disabled={!selfie}
          onClick={() => selfie && setZoom("selfie")}
          className={cn(
            "relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[20px] ring-1 ring-inset ring-border",
            selfie ? "bg-ink/5" : "bg-surface-soft",
          )}
        >
          {selfie ? (
            <img
              src={applicationFileUrl(app.id, "selfie", { variant: "thumb" })}
              crossOrigin="use-credentials"
              alt="селфи"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-2">
              <User size={28} />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
              meta.cls,
            )}
          >
            {meta.label}
          </span>
          <h2 className="mt-1 truncate font-display text-[19px] font-extrabold leading-tight text-ink">
            {app.name || "Без имени"}
          </h2>
          {app.phone && (
            <a
              href={`tel:${app.phone}`}
              className="mt-0.5 inline-flex items-center gap-1 text-[13.5px] font-semibold text-blue-600"
            >
              <Phone size={13} /> {app.phone}
            </a>
          )}
        </div>
      </div>

      {/* ── Документы ── */}
      <Section title="Документы" icon={<FileText size={12} />}>
        {app.files.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-red-soft bg-red-soft/40 px-3 py-2.5 text-[12.5px] font-semibold text-red-ink">
            <AlertTriangle size={15} /> Документы не загружены
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {DOC_ORDER.map((kind) => (
              <DocTile
                key={kind}
                app={app}
                kind={kind}
                exists={haveKinds.has(kind)}
                onZoom={() => setZoom(kind)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ── Хочет арендовать (приоритет для оператора) ── */}
      {hasWishes && (
        <Section title="Хочет арендовать" icon={<Bike size={12} />} tone="blue">
          {app.requestedModel && (
            <InfoRow label="Модель" value={app.requestedModel} strong />
          )}
          {app.requestedDays != null && (
            <InfoRow
              label="Срок"
              value={`${app.requestedDays} дн.`}
              icon={<Clock size={13} />}
            />
          )}
          {app.requestedStartDate && (
            <InfoRow
              label="Старт"
              value={ruDate(app.requestedStartDate)}
              icon={<CalendarDays size={13} />}
            />
          )}
          {(app.requestedEquipmentIds?.length ?? 0) > 0 && (
            <InfoRow
              label="Экипировка"
              value={
                eqNames.length
                  ? eqNames.join(", ")
                  : `${app.requestedEquipmentIds!.length} поз.`
              }
              icon={<Package size={13} />}
            />
          )}
        </Section>
      )}

      {/* ── Личные данные ── */}
      <Section title="Личные данные" icon={<User size={12} />}>
        <InfoRow label="Дата рождения" value={ruDate(app.birthDate)} />
        <InfoRow
          label="Гражданство"
          value={app.isForeigner ? "Иностранец" : "РФ"}
        />
        {app.extraPhone && (
          <InfoRow label="Доп. телефон" value={app.extraPhone} />
        )}
        <InfoRow label="Источник" value={sourceText(app)} />
        <InfoRow label="Подана" value={ruDateTime(app.submittedAt ?? app.createdAt)} />
      </Section>

      {/* ── Документ (детали) ── */}
      {(app.isForeigner ? app.passportRaw : passportFull || issued) && (
        <Section title="Документ" icon={<FileText size={12} />}>
          {app.isForeigner ? (
            <InfoRow label="Документ" value={app.passportRaw ?? "—"} />
          ) : (
            <>
              {passportFull && (
                <InfoRow label="Паспорт" value={passportFull} strong />
              )}
              {issued && <InfoRow label="Выдан" value={issued} />}
              {app.passportDivisionCode && (
                <InfoRow label="Код подразделения" value={app.passportDivisionCode} />
              )}
            </>
          )}
        </Section>
      )}

      {/* ── Адрес ── */}
      {(app.passportRegistration || app.liveAddress) && (
        <Section title="Адрес" icon={<MapPin size={12} />}>
          {app.passportRegistration && (
            <InfoRow label="Регистрация" value={app.passportRegistration} />
          )}
          {app.liveAddress && !app.sameAddress && (
            <InfoRow label="Проживание" value={app.liveAddress} />
          )}
          {app.sameAddress && app.passportRegistration && (
            <InfoRow label="Проживание" value="совпадает с регистрацией" />
          )}
        </Section>
      )}

      {/* ── Причина отказа ── */}
      {app.rejectionReason && (
        <div className="flex items-start gap-2 rounded-xl bg-red-soft/50 px-3 py-2.5 text-[12.5px] text-red-ink">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>Отклонена:</b> {app.rejectionReason}
          </span>
        </div>
      )}

      {zoom && (
        <Lightbox app={app} kind={zoom} onClose={() => setZoom(null)} />
      )}
    </div>
  );
}

/* ============================ Секция ============================ */
function Section({
  title,
  icon,
  tone,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  tone?: "blue";
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {icon}
        {title}
      </div>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-1 shadow-card-sm",
          tone === "blue" ? "bg-blue-50/60 ring-1 ring-inset ring-blue-100" : "bg-surface",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "text-right text-[13px] text-ink",
          strong ? "font-bold" : "font-semibold",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ============================ Плитка документа ============================ */
function DocTile({
  app,
  kind,
  exists,
  onZoom,
}: {
  app: ApiApplication;
  kind: ApplicationFileKind;
  exists: boolean;
  onZoom: () => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={!exists || broken}
        onClick={onZoom}
        className={cn(
          "group relative aspect-square w-full overflow-hidden rounded-xl ring-1 ring-inset ring-border transition-transform active:scale-95",
          exists && !broken ? "bg-ink/5" : "bg-surface-soft",
        )}
      >
        {exists && !broken ? (
          <>
            <img
              src={applicationFileUrl(app.id, kind, { variant: "thumb" })}
              crossOrigin="use-credentials"
              alt={DOC_LABEL[kind]}
              onError={() => setBroken(true)}
              className="h-full w-full object-cover"
            />
            <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Maximize2 size={11} />
            </span>
          </>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-2">
            <ImageOff size={18} />
          </span>
        )}
      </button>
      <span
        className={cn(
          "text-[10.5px] font-semibold",
          exists && !broken ? "text-ink-2" : "text-muted-2",
        )}
      >
        {DOC_LABEL[kind]}
      </span>
    </div>
  );
}

/* ============================ Лайтбокс ============================ */
function Lightbox({
  app,
  kind,
  onClose,
}: {
  app: ApiApplication;
  kind: ApplicationFileKind;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/90 p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mb-2 flex w-full max-w-[900px] items-center justify-between text-white">
        <span className="text-[13px] font-semibold">{DOC_LABEL[kind]}</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 active:scale-90"
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>
      </div>
      <img
        src={applicationFileUrl(app.id, kind, { variant: "view" })}
        crossOrigin="use-credentials"
        alt={DOC_LABEL[kind]}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[82vh] max-w-full rounded-xl object-contain"
      />
      <a
        href={applicationFileUrl(app.id, kind)}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-3 rounded-full bg-white/15 px-4 py-2 text-[12.5px] font-semibold text-white"
      >
        Открыть оригинал
      </a>
    </div>
  );
}
