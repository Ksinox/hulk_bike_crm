import { useMemo, useState } from "react";
import {
  Phone,
  User,
  X,
  MapPin,
  CalendarDays,
  Package,
  Bike,
  Maximize2,
  ImageOff,
  FileText,
  AlertTriangle,
  Wallet,
  IdCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applicationFileUrl,
  type ApiApplication,
  type ApplicationFileKind,
  type ApplicationStatus,
} from "@/lib/api/clientApplications";
import { useApiEquipment } from "@/lib/api/equipment";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import {
  computeQuote,
  rateForDays,
  tierLabelForDays,
  addDaysIso,
  daysWord,
  rub,
} from "@/lib/calc/rentalQuote";

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
  const { data: models = [] } = useApiScooterModels();

  // Выбранная экипировка (объекты) — для чипов и расчёта суммы.
  const selEquip = useMemo(
    () =>
      (app.requestedEquipmentIds ?? [])
        .map((id) => equipment.find((e) => e.id === id))
        .filter((e): e is NonNullable<typeof e> => !!e),
    [app.requestedEquipmentIds, equipment],
  );

  // Модель из каталога по имени → ставки для расчёта ориентира суммы.
  const model = useMemo(() => {
    if (!app.requestedModel) return null;
    const want = app.requestedModel.trim().toLowerCase();
    return models.find((m) => m.name.trim().toLowerCase() === want) ?? null;
  }, [app.requestedModel, models]);

  const days = app.requestedDays ?? 0;
  const quote = useMemo(
    () =>
      days > 0
        ? computeQuote({
            model: model
              ? {
                  dayRate: model.dayRate,
                  shortRate: model.shortRate,
                  weekRate: model.weekRate,
                  monthRate: model.monthRate,
                }
              : null,
            equipment: selEquip.map((e) => ({
              price: e.price,
              isFree: e.isFree,
            })),
            days,
          })
        : null,
    [model, selEquip, days],
  );

  const hasWishes =
    !!app.requestedModel ||
    !!app.requestedDays ||
    !!app.requestedStartDate ||
    (app.requestedEquipmentIds?.length ?? 0) > 0;
  const issued =
    app.passportIssuedOn || app.passportIssuer
      ? `${ruDate(app.passportIssuedOn)}${
          app.passportIssuer ? ` · ${app.passportIssuer}` : ""
        }`
      : null;
  const meta = STATUS_META[app.status];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Hero: крупное селфи (личное дело) + имя + статус + телефон ── */}
      <div className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-slate-50 to-surface p-3.5 ring-1 ring-inset ring-border">
        <button
          type="button"
          disabled={!selfie}
          onClick={() => selfie && setZoom("selfie")}
          className={cn(
            "group relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[26px] ring-1 ring-inset ring-border shadow-card-sm",
            selfie ? "bg-ink/5" : "bg-surface-soft",
          )}
          title={selfie ? "Открыть селфи" : undefined}
        >
          {selfie ? (
            <>
              <img
                src={applicationFileUrl(app.id, "selfie", { variant: "thumb" })}
                crossOrigin="use-credentials"
                alt="селфи"
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 size={12} />
              </span>
            </>
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-2">
              <User size={34} />
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
          <h2 className="mt-1 truncate font-display text-[21px] font-extrabold leading-tight text-ink">
            {app.name || "Без имени"}
          </h2>
          {app.phone && (
            <a
              href={`tel:${app.phone}`}
              className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[13px] font-bold text-blue-700"
            >
              <Phone size={13} /> {app.phone}
            </a>
          )}
          <div className="mt-1 text-[11px] text-muted-2">
            подана {ruDateTime(app.submittedAt ?? app.createdAt)}
          </div>
        </div>
      </div>

      {/* ── Хочет арендовать — главный смысловой блок (Apple-презентация) ── */}
      {hasWishes && (
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-card-md">
          <div className="flex items-center gap-1.5 px-5 pt-4 text-[11px] font-bold uppercase tracking-wider text-white/70">
            <Bike size={13} /> Хочет арендовать
          </div>
          {/* Модель + ставка */}
          <div className="flex items-end justify-between gap-3 px-5 pt-1">
            <div className="min-w-0">
              <div className="font-display text-[30px] font-extrabold leading-none">
                {app.requestedModel
                  ? app.requestedModel.charAt(0).toUpperCase() +
                    app.requestedModel.slice(1)
                  : "Модель не выбрана"}
              </div>
              {model && days > 0 && (
                <div className="mt-1 text-[12.5px] text-white/75">
                  {rub(rateForDays(model, days))} ₽/сут · {tierLabelForDays(days)}
                </div>
              )}
            </div>
            {quote && (
              <div className="shrink-0 rounded-2xl bg-white/15 px-3 py-1.5 text-right backdrop-blur-sm">
                <div className="text-[10px] uppercase tracking-wide text-white/70">
                  ориентир
                </div>
                <div className="font-display text-[20px] font-extrabold leading-none">
                  {rub(quote.total)} ₽
                </div>
              </div>
            )}
          </div>

          {/* Период + мини-календарь */}
          {app.requestedStartDate && days > 0 && (
            <div className="mx-5 mt-4 rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2 text-[13px] font-bold">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={15} className="text-white/80" />
                  {ruDate(app.requestedStartDate)} →{" "}
                  {ruDate(addDaysIso(app.requestedStartDate, days))}
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px]">
                  {days} {daysWord(days)}
                </span>
              </div>
              <MiniCalendar startIso={app.requestedStartDate} days={days} />
            </div>
          )}
          {!app.requestedStartDate && days > 0 && (
            <div className="mx-5 mt-3 text-[13px] font-semibold text-white/90">
              Срок: {days} {daysWord(days)}{" "}
              <span className="text-white/60">· дату согласует менеджер</span>
            </div>
          )}

          {/* Экипировка-чипы */}
          {selEquip.length > 0 && (
            <div className="px-5 pt-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">
                <Package size={12} /> Экипировка
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selEquip.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold"
                  >
                    {e.name}
                    <span className="text-white/65">
                      {e.isFree ? "бесплатно" : `+${rub(e.price)} ₽`}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Состав ориентира */}
          {quote && (
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/15 bg-black/10 px-5 py-3 text-[12px] text-white/80">
              <span className="inline-flex items-center gap-1.5">
                <Wallet size={14} /> к выдаче (ориентир)
              </span>
              <span className="text-right">
                аренда {rub(quote.rentSum)}
                {quote.equipSum > 0 && <> · экип. {rub(quote.equipSum)}</>} ·
                залог {rub(quote.deposit)} ={" "}
                <b className="text-white">{rub(quote.total)} ₽</b>
              </span>
            </div>
          )}
        </div>
      )}

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

      {/* ── Паспорт (разбито: серия / номер отдельно) ── */}
      {(app.isForeigner
        ? app.passportRaw
        : app.passportSeries ||
          app.passportNumber ||
          issued ||
          app.passportDivisionCode) && (
        <Section title="Паспорт" icon={<IdCard size={12} />}>
          {app.isForeigner ? (
            <InfoRow label="Документ" value={app.passportRaw ?? "—"} strong />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 border-b border-border py-2.5">
                <PassportCell label="Серия" value={app.passportSeries ?? "—"} />
                <PassportCell label="Номер" value={app.passportNumber ?? "—"} />
              </div>
              {issued && <InfoRow label="Кем и когда выдан" value={issued} />}
              {app.passportDivisionCode && (
                <InfoRow
                  label="Код подразделения"
                  value={app.passportDivisionCode}
                />
              )}
              <InfoRow label="Дата рождения" value={ruDate(app.birthDate)} />
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

      {/* ── Прочее ── */}
      <Section title="Анкета" icon={<User size={12} />}>
        <InfoRow
          label="Гражданство"
          value={app.isForeigner ? "Иностранец" : "РФ"}
        />
        {app.extraPhone && (
          <InfoRow label="Доп. телефон" value={app.extraPhone} />
        )}
        <InfoRow label="Источник" value={sourceText(app)} />
      </Section>

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

/* ===================== Паспорт-ячейка (серия/номер) ===================== */
function PassportCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-2">
        {label}
      </div>
      <div className="font-display text-[18px] font-extrabold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

/* ===================== Мини-календарь периода ===================== */
function MiniCalendar({ startIso, days }: { startIso: string; days: number }) {
  const [y, m, d] = startIso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d);
  end.setDate(end.getDate() + days); // дата возврата (включительно в подсветке)
  // Месяц старта.
  const monthFirst = new Date(y, m - 1, 1);
  const monthName = monthFirst.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
  const daysInMonth = new Date(y, m, 0).getDate();
  // День недели первого числа (Пн=0).
  const firstDow = (monthFirst.getDay() + 6) % 7;
  const startTs = start.getTime();
  const endTs = end.getTime();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let dd = 1; dd <= daysInMonth; dd++) cells.push(dd);

  return (
    <div className="mt-3">
      <div className="mb-1.5 text-center text-[11px] font-semibold capitalize text-white/70">
        {monthName}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px]">
        {["П", "В", "С", "Ч", "П", "С", "В"].map((w, i) => (
          <div key={i} className="text-white/45">
            {w}
          </div>
        ))}
        {cells.map((dd, i) => {
          if (dd == null) return <div key={i} />;
          const ts = new Date(y, m - 1, dd).getTime();
          const inRange = ts >= startTs && ts <= endTs;
          const isEdge = ts === startTs || ts === endTs;
          return (
            <div key={i} className="flex items-center justify-center">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full tabular-nums",
                  isEdge
                    ? "bg-white font-bold text-blue-700"
                    : inRange
                      ? "bg-white/25 text-white"
                      : "text-white/55",
                )}
              >
                {dd}
              </span>
            </div>
          );
        })}
      </div>
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
