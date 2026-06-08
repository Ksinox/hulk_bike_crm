import { useMemo, useState } from "react";
import {
  Phone,
  User,
  X,
  MapPin,
  CalendarClock,
  Package,
  Bike,
  Maximize2,
  ImageOff,
  FileText,
  AlertTriangle,
  IdCard,
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
 *   • Десктоп (lg+) — широкий 2-колоночный грид. Слева: герой (крупное селфи
 *     9:16 + имя + телефон), карта «Хочет арендовать» (КРУПНО модель
 *     аватаркой-героем + период нашим RangeCalendar, фирменный светлый стиль),
 *     фото документов. Справа сверху-вниз: информация о клиенте (паспорт +
 *     адрес), ключевые даты, финсводка.
 *   • Мобайл — те же блоки в одну колонку.
 *
 * Аватарки — ВСЕГДА avatarKey (прозрачный оригинал), НЕ avatarThumbKey
 * (кропнутый JPEG, у которого альфа залита чёрным).
 *
 * Только чтение — действия даёт обёртка (NewApplicationModal / AppDetail).
 */

/** Документы-сканы (без селфи — селфи крупно в герое, не дублируем). */
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

/** ISO YYYY-MM-DD → CalendarDate (для нашего RangeCalendar). */
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

  // Выбранная клиентом экипировка (объекты каталога).
  const selEquip = useMemo(
    () =>
      (app.requestedEquipmentIds ?? [])
        .map((id) => equipment.find((e) => e.id === id))
        .filter((e): e is NonNullable<typeof e> => !!e),
    [app.requestedEquipmentIds, equipment],
  );

  // Модель из каталога → аватарка + ставки. Сначала по точному имени
  // (новые заявки сохраняют requestedModelName, напр. «Yamaha Jog»), затем
  // по грубому enum (старые заявки: jog/gear/honda/tank → ищем модель, в
  // чьём имени это слово есть подстрокой).
  const model = useMemo(() => {
    const byName = app.requestedModelName?.trim().toLowerCase();
    if (byName) {
      const m = models.find((m) => m.name.trim().toLowerCase() === byName);
      if (m) return m;
    }
    const e = app.requestedModel?.trim().toLowerCase();
    if (e) {
      const m = models.find((m) => m.name.trim().toLowerCase().includes(e));
      if (m) return m;
    }
    return null;
  }, [app.requestedModelName, app.requestedModel, models]);

  // Аватарка модели — avatarKey (прозрачный), НЕ thumbKey (JPEG/чёрный фон).
  const modelAvatar = fileUrl(model?.avatarKey, { variant: "thumb" });

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
    !!app.requestedModelName ||
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
  // Имя для показа: точное сохранённое имя (новые заявки) → имя найденной
  // модели каталога → капитализированный enum (старые заявки без имени).
  const modelName =
    app.requestedModelName?.trim() ||
    model?.name ||
    (app.requestedModel
      ? app.requestedModel.charAt(0).toUpperCase() + app.requestedModel.slice(1)
      : null);

  const hasPassport = app.isForeigner
    ? !!app.passportRaw
    : !!(
        app.passportSeries ||
        app.passportNumber ||
        issued ||
        app.passportDivisionCode ||
        app.birthDate
      );

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
              "group relative aspect-[9/16] w-[130px] shrink-0 overflow-hidden rounded-[22px] ring-1 ring-inset ring-border shadow-card sm:w-[164px]",
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
                <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                  <Maximize2 size={13} />
                </span>
              </>
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-2">
                <User size={36} />
                <span className="text-[10px] font-semibold">нет селфи</span>
              </span>
            )}
          </button>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <span
              className={cn(
                "inline-block w-fit rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
                meta.cls,
              )}
            >
              {meta.label}
            </span>
            <h2 className="mt-2 font-display text-[24px] font-extrabold leading-tight text-ink">
              {app.name || "Без имени"}
            </h2>
            {app.phone && (
              <a
                href={`tel:${app.phone}`}
                className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[14px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
              >
                <Phone size={14} /> {app.phone}
              </a>
            )}
            <div className="mt-2 text-[11px] text-muted-2">
              Заявка #{String(app.id).padStart(4, "0")} · подана{" "}
              {ruDateTime(app.submittedAt ?? app.createdAt)}
            </div>
          </div>
        </section>

        {/* ── Что выбрал клиент: модель + экипировка + период + СУММА вместе,
            одной презентацией (как Apple-карточка) ── */}
        {hasWishes && (
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-surface to-blue-50/50 p-5 shadow-card ring-1 ring-inset ring-blue-100">
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700/60">
                <Bike size={13} /> Что выбрал клиент
              </span>

              {/* Имя модели — крупно, красивым шрифтом */}
              <h3 className="mt-1 font-display text-[40px] font-extrabold leading-none tracking-tight text-ink sm:text-[46px]">
                {modelName ?? "Модель не выбрана"}
              </h3>

              {/* Плашки: тариф + примерный срок */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {model && days > 0 && (
                  <span className="inline-flex items-center rounded-full bg-blue-600 px-3.5 py-1.5 text-[14px] font-bold text-white shadow-card-sm">
                    {rub(rateForDays(model, days))} ₽/сут
                  </span>
                )}
                {days > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-[13px] font-bold text-ink shadow-card-sm ring-1 ring-inset ring-blue-100">
                    <CalendarClock size={14} className="text-blue-600" />~{days}{" "}
                    {daysWord(days)}
                  </span>
                )}
                {model && days > 0 && (
                  <span className="inline-flex items-center rounded-full bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-muted ring-1 ring-inset ring-border">
                    {tierLabelForDays(days)}
                  </span>
                )}
              </div>

              {/* Экипировка — светлые чипы с аватарками */}
              {selEquip.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                    <Package size={12} /> Экипировка
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selEquip.map((e) => {
                      const av = fileUrl(e.avatarKey, { variant: "thumb" });
                      return (
                        <span
                          key={e.id}
                          className="inline-flex items-center gap-2 rounded-2xl bg-surface py-1.5 pl-1.5 pr-3 text-[13px] font-semibold text-ink shadow-card-sm ring-1 ring-inset ring-blue-50"
                        >
                          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-white to-blue-50 p-1 ring-1 ring-inset ring-blue-50">
                            {av ? (
                              <img
                                src={av}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <Package size={14} className="text-ink/40" />
                            )}
                          </span>
                          {e.name}
                          <span className="text-muted-2">
                            {e.isFree ? "бесплатно" : `+${rub(e.price)} ₽/сут`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Период + большая аватарка-герой ЗА календарём */}
              <div className="relative mt-5">
                {/* мобайл: аватарка-герой по центру над календарём */}
                {modelAvatar && (
                  <img
                    src={modelAvatar}
                    alt={modelName ?? "модель"}
                    className="mx-auto mb-3 block h-[120px] w-auto object-contain drop-shadow-lg sm:hidden"
                  />
                )}
                {/* десктоп: большая аватарка справа, ЗА календарём */}
                {modelAvatar && (
                  <img
                    src={modelAvatar}
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute right-0 top-1/2 z-0 hidden w-[230px] -translate-y-1/2 object-contain opacity-95 drop-shadow-xl sm:block lg:w-[270px]"
                  />
                )}

                <div className="relative z-10 flex justify-center sm:justify-start">
                  {startCd && endCd ? (
                    <div className="w-fit rounded-2xl bg-surface p-2.5 text-ink shadow-card-lg ring-1 ring-inset ring-border">
                      <I18nProvider locale="ru-RU">
                        <RangeCalendar
                          aria-label="Период аренды из заявки"
                          value={{ start: startCd, end: endCd }}
                          defaultFocusedValue={startCd}
                          isReadOnly
                        />
                      </I18nProvider>
                    </div>
                  ) : days > 0 ? (
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink shadow-card-sm ring-1 ring-inset ring-border">
                      <CalendarClock size={16} className="text-blue-600" />
                      Дату согласует менеджер
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Финсводка — внутри карточки выбора: «скутер + экипировка +
                  срок + СУММА» читаются одной презентацией. relative z-10 —
                  чтобы декоративная аватарка модели (absolute z-0) не
                  перекрывала суммы, когда блок периода низкий (даты не заданы). */}
              {quote && (
                <div className="relative z-10 mt-5 rounded-2xl bg-surface p-3.5 shadow-card-sm ring-1 ring-inset ring-border">
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
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 text-white shadow-card-sm">
                    <span className="text-[12px] font-bold uppercase tracking-wide text-white/80">
                      Итого к оплате
                    </span>
                    <span className="font-display text-[28px] font-extrabold leading-none tabular-nums">
                      {rub(quote.total)} ₽
                    </span>
                  </div>
                  <p className="mt-2 px-0.5 text-[10.5px] leading-snug text-muted-2">
                    Ориентир по тарифам каталога. Точную сумму зафиксируете при
                    оформлении аренды.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Документы (сканы) ── */}
        <div>
          <SectionLabel icon={<FileText size={12} />}>Документы</SectionLabel>
          <div className="rounded-2xl bg-surface px-3.5 py-1.5 shadow-card-sm ring-1 ring-inset ring-border">
            {app.files.length === 0 ? (
              <div className="my-1.5 flex items-center gap-2 rounded-xl border border-dashed border-red-soft bg-red-soft/40 px-3 py-2.5 text-[12.5px] font-semibold text-red-ink">
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
          </div>
        </div>
      </div>

      {/* ═══════════════ ПРАВАЯ КОЛОНКА (паспорт → даты → расчёт) ═══════════════ */}
      <div className="flex min-w-0 flex-col gap-4">
        {/* ── Личное дело: паспорт разнесён по полям (серия/номер/кем
            выдан/дата/код) + адрес + анкета. Раньше всё было «в кучу». ── */}
        {(hasPassport ||
          app.passportRegistration ||
          app.liveAddress ||
          app.extraPhone) && (
          <div>
            <SectionLabel icon={<IdCard size={12} />}>Личное дело</SectionLabel>
            <div className="rounded-2xl bg-surface p-3 shadow-card-sm ring-1 ring-inset ring-border">
              {hasPassport &&
                (app.isForeigner ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      wide
                      label="Документ иностранца"
                      value={app.passportRaw}
                    />
                    <Field label="Дата рождения" value={ruDate(app.birthDate)} />
                    <Field label="Гражданство" value="Иностранец" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Серия паспорта" value={app.passportSeries} />
                    <Field label="Номер паспорта" value={app.passportNumber} />
                    <Field wide label="Кем выдан" value={app.passportIssuer} />
                    <Field
                      label="Дата выдачи"
                      value={
                        app.passportIssuedOn
                          ? ruDate(app.passportIssuedOn)
                          : null
                      }
                    />
                    <Field
                      label="Код подразделения"
                      value={app.passportDivisionCode}
                    />
                    <Field label="Дата рождения" value={ruDate(app.birthDate)} />
                    <Field label="Гражданство" value="РФ" />
                  </div>
                ))}

              {/* Адрес и анкета — строками под паспортной сеткой. */}
              <div className="mt-1 px-0.5">
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
                  <InfoRow label="Проживание" value="совпадает с регистрацией" />
                )}
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
          </div>
        )}

        {/* ── Ключевые даты: воздух + синий бейдж длительности ── */}
        {hasWishes && (app.requestedStartDate || days > 0) && (
          <div>
            <SectionLabel icon={<CalendarClock size={12} />}>
              Ключевые даты
            </SectionLabel>
            <div className="relative rounded-2xl bg-surface px-4 py-4 shadow-card-sm ring-1 ring-inset ring-border">
              {days > 0 && (
                <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col items-center rounded-2xl bg-blue-600 px-4 py-2.5 text-white shadow-card-sm">
                  <span className="font-display text-[22px] font-extrabold leading-none tabular-nums">
                    {days}
                  </span>
                  <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80">
                    {daysWord(days)}
                  </span>
                </div>
              )}
              <DateNode
                filled
                label="Начало аренды"
                date={ruDate(app.requestedStartDate)}
                connector
              />
              <DateNode label="Конец периода" date={ruDate(endIso)} />
            </div>
          </div>
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

/* ===================== Заголовок секции ===================== */
function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-2">
      {icon}
      {children}
    </div>
  );
}

/* ===================== Узел таймлайна дат ===================== */
function DateNode({
  label,
  date,
  filled,
  connector,
}: {
  label: string;
  date: string;
  filled?: boolean;
  connector?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <span
          className={cn(
            "h-3 w-3 shrink-0 rounded-full ring-4 ring-surface",
            filled ? "bg-blue-600" : "border-2 border-ink bg-surface",
          )}
        />
        {connector && (
          <span className="my-1 min-h-[34px] w-px flex-1 bg-border" />
        )}
      </div>
      <div className={cn("min-w-0", connector ? "pb-4" : "")}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
          {label}
        </div>
        <div className="mt-0.5 font-display text-[19px] font-extrabold tabular-nums leading-tight text-ink">
          {date}
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
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <span
        className={cn("text-[13px]", muted ? "text-muted-2" : "text-muted")}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-[13.5px] font-bold tabular-nums",
          muted ? "text-muted-2" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ===================== Строка «ключ: значение» ===================== */
function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted">
        {icon}
        {label}
      </span>
      <span className="text-right text-[12.5px] font-semibold text-ink">
        {value}
      </span>
    </div>
  );
}

/* ===================== Поле паспорта (ячейка сетки) ===================== */
function Field({
  label,
  value,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  const empty =
    value == null || value === "" || value === "—" || value === false;
  return (
    <div
      className={cn(
        "rounded-xl bg-surface-soft/70 px-3 py-2 ring-1 ring-inset ring-border/70",
        wide && "col-span-2",
      )}
    >
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 break-words text-[13.5px] font-semibold tabular-nums",
          empty ? "text-muted-2" : "text-ink",
        )}
      >
        {empty ? "—" : value}
      </div>
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
