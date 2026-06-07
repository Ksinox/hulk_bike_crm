import { useMemo, useState } from "react";
import {
  Phone,
  User,
  X,
  MapPin,
  CalendarDays,
  CalendarClock,
  Package,
  Bike,
  Maximize2,
  ImageOff,
  FileText,
  AlertTriangle,
  Wallet,
  IdCard,
  Flag,
  Clock,
  Globe,
  Hash,
} from "lucide-react";
import { I18nProvider } from "react-aria-components";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { RangeCalendar } from "@/components/ui/calendar-rac";
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
 * Просмотр входящей заявки — «личное дело» клиента. Единый компонент для
 * мобилы и десктопа.
 *
 * Раскладка:
 *   • Десктоп (lg+) — широкий 2-колоночный грид. Слева: герой (крупное
 *     селфи 9:16 + имя + телефон + «к оплате»), карта брони (модель с
 *     аватаркой + наш фирменный RangeCalendar периода + экипировка с
 *     аватарками + ориентир суммы), фото документов. Справа: ключевые
 *     даты, детали заявки (паспорт-блок + адрес + анкета), финсводка.
 *   • Мобайл — те же блоки в одну колонку.
 *
 * Только чтение — действия (принять/отклонить/оформить) даёт обёртка
 * (NewApplicationModal на десктопе, AppDetail на мобиле).
 */

/** Документы-сканы (без селфи — селфи живёт крупно в герое, не дублируем). */
const DOC_ORDER: ApplicationFileKind[] = [
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

const STATUS_META: Record<ApplicationStatus, { label: string; cls: string }> = {
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

/** ISO YYYY-MM-DD → CalendarDate (для нашего RangeCalendar). null если не парсится. */
function isoToCd(iso: string | null | undefined): CalendarDate | null {
  if (!iso) return null;
  try {
    return parseDate(String(iso).slice(0, 10));
  } catch {
    return null;
  }
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

  // Выбранная клиентом экипировка (объекты каталога) — для чипов с аватарками
  // и расчёта суммы.
  const selEquip = useMemo(
    () =>
      (app.requestedEquipmentIds ?? [])
        .map((id) => equipment.find((e) => e.id === id))
        .filter((e): e is NonNullable<typeof e> => !!e),
    [app.requestedEquipmentIds, equipment],
  );

  // Модель из каталога по имени → аватарка + ставки для ориентира суммы.
  const model = useMemo(() => {
    if (!app.requestedModel) return null;
    const want = app.requestedModel.trim().toLowerCase();
    return models.find((m) => m.name.trim().toLowerCase() === want) ?? null;
  }, [app.requestedModel, models]);

  const modelAvatar = fileUrl(model?.avatarThumbKey ?? model?.avatarKey, {
    variant: "thumb",
  });

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

  const endIso =
    app.requestedStartDate && days > 0
      ? addDaysIso(app.requestedStartDate, days)
      : null;
  const startCd = isoToCd(app.requestedStartDate);
  const endCd = isoToCd(endIso);

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
  const modelName = app.requestedModel
    ? app.requestedModel.charAt(0).toUpperCase() + app.requestedModel.slice(1)
    : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
      {/* ═══════════════ ЛЕВАЯ КОЛОНКА ═══════════════ */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* ── Герой: крупное селфи 9:16 + имя + телефон + «к оплате» ── */}
        <section className="flex flex-wrap items-stretch gap-4 rounded-3xl bg-surface p-4 shadow-card ring-1 ring-inset ring-border">
          <button
            type="button"
            disabled={!selfie}
            onClick={() => selfie && setZoom("selfie")}
            className={cn(
              "group relative aspect-[9/16] w-[120px] shrink-0 overflow-hidden rounded-[22px] ring-1 ring-inset ring-border shadow-card-sm sm:w-[136px]",
              selfie ? "bg-ink/5" : "bg-surface-soft",
            )}
            title={selfie ? "Открыть селфи" : undefined}
          >
            {selfie ? (
              <>
                <img
                  src={applicationFileUrl(app.id, "selfie", {
                    variant: "view",
                  })}
                  crossOrigin="use-credentials"
                  alt="селфи"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <Maximize2 size={13} />
                </span>
              </>
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted-2">
                <User size={40} />
              </span>
            )}
          </button>

          <div className="flex min-w-0 flex-1 flex-col">
            <div>
              <span
                className={cn(
                  "inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
                  meta.cls,
                )}
              >
                {meta.label}
              </span>
              <h2 className="mt-1.5 font-display text-[22px] font-extrabold leading-tight text-ink">
                {app.name || "Без имени"}
              </h2>
              {app.phone && (
                <a
                  href={`tel:${app.phone}`}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[14px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
                >
                  <Phone size={14} /> {app.phone}
                </a>
              )}
              <div className="mt-1.5 text-[11px] text-muted-2">
                Заявка #{String(app.id).padStart(4, "0")} · подана{" "}
                {ruDateTime(app.submittedAt ?? app.createdAt)}
              </div>
            </div>

            {/* «К оплате» — итог-ориентир, как клиент бы заплатил при выдаче. */}
            {quote && (
              <div className="mt-3 self-start rounded-2xl bg-blue-50 px-4 py-2.5 ring-1 ring-inset ring-blue-100">
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700/70">
                  К оплате (ориентир)
                </div>
                <div className="font-display text-[26px] font-extrabold leading-none text-blue-700">
                  {rub(quote.total)} ₽
                </div>
                <div className="mt-1 text-[11.5px] font-semibold text-muted">
                  аренда {rub(quote.rentSum)}
                  {quote.equipSum > 0 && <> · экип. {rub(quote.equipSum)}</>} ·
                  залог {rub(quote.deposit)}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Бронирование: модель + период (наш календарь) + экипировка ── */}
        {hasWishes && (
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-ink to-ink-2 text-white shadow-card-lg">
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55">
                  <Bike size={13} /> Бронирование
                </span>
                {quote && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm">
                    ориентир {rub(quote.total)} ₽
                  </span>
                )}
              </div>

              {/* Модель: аватарка + название + ставка */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-card-sm">
                  {modelAvatar ? (
                    <img
                      src={modelAvatar}
                      alt={modelName ?? "модель"}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Bike size={26} className="text-ink/25" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[26px] font-extrabold leading-none">
                    {modelName ?? "Модель не выбрана"}
                  </div>
                  {model && days > 0 && (
                    <div className="mt-1.5 text-[12.5px] text-white/70">
                      {rub(rateForDays(model, days))} ₽/сут ·{" "}
                      {tierLabelForDays(days)}
                    </div>
                  )}
                </div>
              </div>

              {/* Экипировка — чипы с аватарками */}
              {selEquip.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-white/50">
                    <Package size={12} /> Экипировка
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selEquip.map((e) => {
                      const av = fileUrl(e.avatarThumbKey ?? e.avatarKey, {
                        variant: "thumb",
                      });
                      return (
                        <span
                          key={e.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-2.5 text-[12px] font-semibold backdrop-blur-sm"
                        >
                          <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-white">
                            {av ? (
                              <img
                                src={av}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <Package size={12} className="text-ink/40" />
                            )}
                          </span>
                          {e.name}
                          <span className="text-white/55">
                            {e.isFree ? "бесплатно" : `+${rub(e.price)} ₽`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Период — наш фирменный RangeCalendar (read-only) на белой плашке */}
              {startCd && endCd ? (
                <div className="mt-4 rounded-2xl bg-surface p-2.5 text-ink shadow-card-sm">
                  <div className="mb-1 flex items-center justify-between gap-2 px-1">
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                      <CalendarDays size={14} className="text-blue-600" />
                      {ruDate(app.requestedStartDate)} — {ruDate(endIso)}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11.5px] font-bold text-blue-700">
                      {days} {daysWord(days)}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <I18nProvider locale="ru-RU">
                      <RangeCalendar
                        aria-label="Период аренды из заявки"
                        value={{ start: startCd, end: endCd }}
                        defaultFocusedValue={startCd}
                        isReadOnly
                      />
                    </I18nProvider>
                  </div>
                </div>
              ) : days > 0 ? (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 px-3.5 py-2.5 text-[12.5px] font-semibold backdrop-blur-sm">
                  <CalendarClock size={15} className="text-white/70" />
                  Срок {days} {daysWord(days)}
                  <span className="text-white/55">· дату согласует менеджер</span>
                </div>
              ) : null}

              {/* Состав ориентира */}
              {quote && (
                <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl bg-white/10 px-3.5 py-2.5 text-[12px] backdrop-blur-sm">
                  <span className="inline-flex items-center gap-1.5 text-white/70">
                    <Wallet size={14} /> к выдаче
                  </span>
                  <span className="text-right text-white/85">
                    аренда {rub(quote.rentSum)}
                    {quote.equipSum > 0 && <> · экип. {rub(quote.equipSum)}</>} ·
                    залог {rub(quote.deposit)} ={" "}
                    <b className="text-white">{rub(quote.total)} ₽</b>
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Документы (сканы) ── */}
        <Section title="Документы" icon={<FileText size={12} />}>
          {app.files.length === 0 ? (
            <div className="my-1 flex items-center gap-2 rounded-xl border border-dashed border-red-soft bg-red-soft/40 px-3 py-2.5 text-[12.5px] font-semibold text-red-ink">
              <AlertTriangle size={15} /> Документы не загружены
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 py-1.5">
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
      </div>

      {/* ═══════════════ ПРАВАЯ КОЛОНКА ═══════════════ */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* ── Ключевые даты ── */}
        {hasWishes && (app.requestedStartDate || days > 0) && (
          <Section title="Ключевые даты" icon={<CalendarClock size={12} />}>
            <div className="py-1.5">
              <KeyDateRow
                icon={<CalendarDays size={15} />}
                tone="blue"
                label="Начало аренды"
                value={ruDate(app.requestedStartDate)}
                connector
              />
              <KeyDateRow
                icon={<Flag size={15} />}
                tone="ink"
                label="Конец периода"
                value={ruDate(endIso)}
                connector
              />
              <KeyDateRow
                icon={<Clock size={15} />}
                tone="muted"
                label="Длительность"
                value={days > 0 ? `${days} ${daysWord(days)}` : "—"}
              />
            </div>
          </Section>
        )}

        {/* ── Детали заявки: паспорт-блок + адрес + анкета ── */}
        <Section title="Детали заявки" icon={<IdCard size={12} />}>
          <div className="space-y-3 py-2">
            {/* Паспорт — обособленный блок, визуально «как паспорт» */}
            {(app.isForeigner
              ? app.passportRaw
              : app.passportSeries ||
                app.passportNumber ||
                issued ||
                app.passportDivisionCode ||
                app.birthDate) && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-blue-700/80">
                  <IdCard size={13} />
                  {app.isForeigner ? "Документ иностранца" : "Паспорт РФ"}
                </div>
                {app.isForeigner ? (
                  <div className="font-display text-[15px] font-bold leading-snug text-ink">
                    {app.passportRaw ?? "—"}
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <PassportField
                        label="Серия"
                        value={app.passportSeries ?? "—"}
                      />
                      <PassportField
                        label="Номер"
                        value={app.passportNumber ?? "—"}
                      />
                    </div>
                    <div className="mt-1">
                      {issued && (
                        <InfoRow label="Кем и когда выдан" value={issued} />
                      )}
                      {app.passportDivisionCode && (
                        <InfoRow
                          label="Код подразделения"
                          value={app.passportDivisionCode}
                        />
                      )}
                      <InfoRow
                        label="Дата рождения"
                        value={ruDate(app.birthDate)}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Адрес */}
            {(app.passportRegistration || app.liveAddress) && (
              <div className="px-0.5">
                {app.passportRegistration && (
                  <InfoRow
                    icon={<MapPin size={14} />}
                    label="Регистрация"
                    value={app.passportRegistration}
                  />
                )}
                {app.liveAddress && !app.sameAddress && (
                  <InfoRow label="Проживание" value={app.liveAddress} />
                )}
                {app.sameAddress && app.passportRegistration && (
                  <InfoRow
                    label="Проживание"
                    value="совпадает с регистрацией"
                  />
                )}
              </div>
            )}

            {/* Анкета (прочее) */}
            <div className="px-0.5">
              <InfoRow
                icon={<Globe size={14} />}
                label="Гражданство"
                value={app.isForeigner ? "Иностранец" : "РФ"}
              />
              {app.extraPhone && (
                <InfoRow
                  icon={<Phone size={14} />}
                  label="Доп. телефон"
                  value={app.extraPhone}
                />
              )}
              <InfoRow
                icon={<Hash size={14} />}
                label="Источник"
                value={sourceText(app)}
              />
            </div>
          </div>
        </Section>

        {/* ── Финансовая сводка ── */}
        {quote && (
          <Section title="Финансовая сводка" icon={<Wallet size={12} />}>
            <div className="py-1.5">
              <FinRow label="Аренда" value={`${rub(quote.rentSum)} ₽`} />
              {quote.equipSum > 0 && (
                <FinRow
                  label="Экипировка"
                  value={`${rub(quote.equipSum)} ₽`}
                />
              )}
              <FinRow
                label="Залог (возвратный)"
                value={`${rub(quote.deposit)} ₽`}
                muted
              />
              <FinRow
                label="Итого к оплате"
                value={`${rub(quote.total)} ₽`}
                total
              />
            </div>
            <div className="-mx-0.5 mt-1 rounded-xl bg-surface-soft px-2.5 py-1.5 text-[10.5px] leading-snug text-muted-2">
              Ориентир по тарифам каталога. Точную сумму зафиксируете при
              оформлении аренды.
            </div>
          </Section>
        )}

        {/* ── Причина отказа ── */}
        {app.rejectionReason && (
          <div className="flex items-start gap-2 rounded-2xl bg-red-soft/50 px-3.5 py-3 text-[12.5px] text-red-ink ring-1 ring-inset ring-red-soft">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              <b>Отклонена:</b> {app.rejectionReason}
            </span>
          </div>
        )}
      </div>

      {zoom && <Lightbox app={app} kind={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

/* ===================== Ячейка серия/номер паспорта ===================== */
function PassportField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl bg-surface px-3 py-2 ring-1 ring-inset ring-blue-100">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">
        {label}
      </div>
      <div className="font-display text-[19px] font-extrabold tabular-nums leading-tight text-ink">
        {value}
      </div>
    </div>
  );
}

/* ===================== Ключевая дата (timeline-строка) ===================== */
function KeyDateRow({
  icon,
  label,
  value,
  tone,
  connector,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "ink" | "muted";
  connector?: boolean;
}) {
  const toneCls =
    tone === "blue"
      ? "bg-blue-50 text-blue-600"
      : tone === "ink"
        ? "bg-ink/5 text-ink"
        : "bg-surface-soft text-muted";
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            toneCls,
          )}
        >
          {icon}
        </span>
        {connector && <span className="my-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0 flex-1", connector ? "pb-2.5" : "")}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
          {label}
        </div>
        <div className="mt-0.5 font-display text-[16px] font-bold tabular-nums leading-tight text-ink">
          {value}
        </div>
      </div>
    </div>
  );
}

/* ===================== Строка финсводки ===================== */
function FinRow({
  label,
  value,
  muted,
  total,
}: {
  label: string;
  value: string;
  muted?: boolean;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        total
          ? "mt-1 border-t border-border pt-2.5"
          : "border-b border-border last:border-b-0",
      )}
    >
      <span
        className={cn(
          "text-[13px]",
          total ? "font-bold text-ink" : muted ? "text-muted-2" : "text-muted",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          total
            ? "font-display text-[18px] font-extrabold text-ink"
            : cn("text-[13.5px] font-bold", muted ? "text-muted-2" : "text-ink"),
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ============================ Секция ============================ */
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {icon}
        {title}
      </div>
      <div className="rounded-2xl bg-surface px-3.5 shadow-card-sm ring-1 ring-inset ring-border">
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
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          "text-right text-[12.5px] text-ink",
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
    <div className="flex flex-col items-center gap-1.5">
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
          "text-[11px] font-semibold",
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
