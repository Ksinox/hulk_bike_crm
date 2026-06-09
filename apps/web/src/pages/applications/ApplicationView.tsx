import { useMemo, useState } from "react";
import {
  Phone,
  PhoneCall,
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
  ChevronDown,
  Check,
  Ban,
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
 * мобилы и десктопа, под прототип заказчика.
 *
 * Раскладка (v0.10 — по прототипу):
 *   • Десктоп (lg+) — 2 колонки. Слева: герой (селфи + имя + телефон) и
 *     «Что выбрал клиент» (модель + период + экипировка + сумма). Справа —
 *     «Проверка клиента»: аккордеоны (Документы / Паспортные данные / Адреса
 *     / Источник) + «Ключевые даты», а ПОД ними — действия (Принять /
 *     Отклонить; «Позвонить» на компе нет — с компьютера не звоним).
 *   • Мобайл — одна колонка: герой → что выбрал → ключевые даты →
 *     проверка-аккордеоны, а кнопки (Позвонить / Отклонить / Принять) —
 *     ВНИЗУ, sticky (под большой палец).
 *
 * Аватарки — ВСЕГДА avatarKey (прозрачный оригинал), НЕ avatarThumbKey.
 *
 * Действия пробрасываются обёрткой (NewApplicationModal / AppDetail) через
 * onAccept / onReject / onCall. readOnly — без кнопок.
 */

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

const SOURCE_LABEL: Record<string, string> = {
  avito: "Авито",
  repeat: "Уже катался",
  ref: "Рекомендация",
  maps: "Карты",
  other: "Другое",
};

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

export function ApplicationView({
  app,
  onAccept,
  onReject,
  onCall,
  onSpam,
  onDelete,
  onLater,
  acceptLabel = "Принять",
  acceptDisabled = false,
  readOnly = false,
}: {
  app: ApiApplication;
  /** Принять заявку (создать клиента/аренду). */
  onAccept?: () => void;
  /** Отклонить (открыть форму причины). */
  onReject?: () => void;
  /** Позвонить (моб.) — по умолчанию tel: по app.phone. */
  onCall?: () => void;
  /** Пометить спамом (вторичное). */
  onSpam?: () => void;
  /** Удалить заявку безвозвратно (вторичное). */
  onDelete?: () => void;
  /** Отложить (закрыть без действия) — вторичная ссылка на десктопе. */
  onLater?: () => void;
  acceptLabel?: string;
  acceptDisabled?: boolean;
  readOnly?: boolean;
}) {
  const [zoom, setZoom] = useState<ApplicationFileKind | null>(null);
  const haveKinds = new Set(app.files.map((f) => f.kind));
  const selfie = haveKinds.has("selfie");

  const { data: equipment = [] } = useApiEquipment();
  const { data: models = [] } = useApiScooterModels();

  const selEquip = useMemo(
    () =>
      (app.requestedEquipmentIds ?? [])
        .map((id) => equipment.find((e) => e.id === id))
        .filter((e): e is NonNullable<typeof e> => !!e),
    [app.requestedEquipmentIds, equipment],
  );

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
        app.passportIssuer ||
        app.passportIssuedOn ||
        app.passportDivisionCode ||
        app.birthDate
      );

  const docsPresent = DOC_ORDER.filter((k) => haveKinds.has(k)).length;
  const hasAddress = !!(app.passportRegistration || app.liveAddress);
  const addressBadge = app.sameAddress
    ? "Совпадают"
    : hasAddress
      ? "Заполнено"
      : null;
  const hasKeyDates = hasWishes && (app.requestedStartDate || days > 0);

  /* ───────────────────── Блоки (один источник для обоих деревьев) ───── */

  const heroBlock = (
    <section className="flex items-stretch gap-3.5 rounded-3xl bg-surface p-3.5 shadow-card ring-1 ring-inset ring-border sm:gap-4 sm:p-4">
      <button
        type="button"
        disabled={!selfie}
        onClick={() => selfie && setZoom("selfie")}
        className={cn(
          "group relative aspect-[3/4] w-[104px] shrink-0 overflow-hidden rounded-[20px] shadow-card ring-1 ring-inset ring-border sm:w-[124px]",
          selfie ? "bg-ink/5" : "bg-surface-soft",
        )}
        title={selfie ? "Открыть селфи" : undefined}
      >
        {selfie ? (
          <>
            <img
              src={applicationFileUrl(app.id, "selfie", { variant: "view" })}
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
            <User size={34} />
            <span className="text-[10px] font-semibold">нет селфи</span>
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h2 className="font-display text-[22px] font-extrabold leading-tight text-ink sm:text-[25px]">
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
        <div className="mt-2 text-[11.5px] text-muted-2">
          Заявка #{String(app.id).padStart(4, "0")} · подана{" "}
          {ruDateTime(app.submittedAt ?? app.createdAt)}
        </div>
      </div>
    </section>
  );

  const whatChosenBlock = hasWishes ? (
    <section className="relative overflow-hidden rounded-3xl bg-surface p-4 shadow-card ring-1 ring-inset ring-border sm:p-5">
      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700/70">
          <Bike size={13} /> Что выбрал клиент
        </span>

        <h3 className="mt-1 font-display text-[34px] font-extrabold leading-none tracking-tight text-ink sm:text-[42px]">
          {modelName ?? "Модель не выбрана"}
        </h3>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {model && days > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-600 px-3.5 py-1.5 text-[14px] font-bold text-white shadow-card-sm">
              {rub(rateForDays(model, days))} ₽/сут
            </span>
          )}
          {days > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-3.5 py-1.5 text-[13px] font-bold text-ink ring-1 ring-inset ring-border">
              <CalendarClock size={14} className="text-blue-600" />
              {days} {daysWord(days)}
            </span>
          )}
          {model && days > 0 && (
            <span className="inline-flex items-center rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-muted ring-1 ring-inset ring-border">
              {tierLabelForDays(days)}
            </span>
          )}
        </div>

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
                    className="inline-flex items-center gap-2 rounded-2xl bg-surface-soft py-1.5 pl-1.5 pr-3 text-[13px] font-semibold text-ink ring-1 ring-inset ring-border"
                  >
                    <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-white p-1 ring-1 ring-inset ring-border">
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

        {/* Период + аватарка-герой */}
        <div className="relative mt-5">
          {modelAvatar && (
            <img
              src={modelAvatar}
              alt={modelName ?? "модель"}
              className="pointer-events-none absolute right-0 top-1/2 z-0 hidden w-[200px] -translate-y-1/2 object-contain opacity-95 drop-shadow-xl sm:block lg:w-[230px]"
            />
          )}
          <div className="relative z-10 flex items-center justify-center gap-4 sm:justify-start">
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
              <div className="inline-flex items-center gap-2 rounded-2xl bg-surface-soft px-4 py-2.5 text-[13px] font-semibold text-ink ring-1 ring-inset ring-border">
                <CalendarClock size={16} className="text-blue-600" />
                Дату согласует менеджер
              </div>
            ) : null}
            {/* аватарка под календарём на мобилке */}
            {modelAvatar && (
              <img
                src={modelAvatar}
                alt=""
                aria-hidden
                className="h-[120px] w-auto object-contain drop-shadow-lg sm:hidden"
              />
            )}
          </div>
        </div>

        {quote && (
          <div className="relative z-10 mt-5 rounded-2xl bg-surface-soft p-3.5 ring-1 ring-inset ring-border">
            <FinRow label="Аренда" value={`${rub(quote.rentSum)} ₽`} />
            {quote.equipSum > 0 && (
              <FinRow label="Экипировка" value={`${rub(quote.equipSum)} ₽`} />
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
  ) : null;

  const keyDatesBlock = hasKeyDates ? (
    <KeyDatesCard
      start={ruDate(app.requestedStartDate)}
      end={ruDate(endIso)}
      days={days}
    />
  ) : null;

  const docsAccordion = (
    <AccordionCard
      icon={<FileText size={13} />}
      title="Документы"
      badge={`${docsPresent}/3`}
      badgeTone={docsPresent === 3 ? "green" : docsPresent > 0 ? "amber" : "red"}
      defaultOpen
    >
      {app.files.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-red-soft bg-red-soft/40 px-3 py-2.5 text-[12.5px] font-semibold text-red-ink">
          <AlertTriangle size={15} /> Документы не загружены
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
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
    </AccordionCard>
  );

  const passportAccordion = (
    <AccordionCard
      icon={<IdCard size={13} />}
      title="Паспортные данные"
      badge={hasPassport ? "Заполнено" : "Нет данных"}
      badgeTone={hasPassport ? "green" : "red"}
    >
      {hasPassport ? (
        app.isForeigner ? (
          <div className="grid grid-cols-2 gap-2">
            <Field wide label="Документ иностранца" value={app.passportRaw} />
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
              value={app.passportIssuedOn ? ruDate(app.passportIssuedOn) : null}
            />
            <Field label="Код подразделения" value={app.passportDivisionCode} />
            <Field label="Дата рождения" value={ruDate(app.birthDate)} />
            <Field label="Гражданство" value="РФ" />
          </div>
        )
      ) : (
        <div className="text-[12.5px] text-muted-2">Паспорт не заполнен.</div>
      )}
    </AccordionCard>
  );

  const addressAccordion = (
    <AccordionCard
      icon={<MapPin size={13} />}
      title="Адреса"
      badge={addressBadge ?? "—"}
      badgeTone={addressBadge ? "green" : "muted"}
    >
      <div className="px-0.5">
        {app.passportRegistration ? (
          <InfoRow
            icon={<MapPin size={14} />}
            label="Регистрация"
            value={app.passportRegistration}
          />
        ) : null}
        {app.liveAddress && !app.sameAddress && (
          <InfoRow label="Проживание" value={app.liveAddress} />
        )}
        {app.sameAddress && app.passportRegistration && (
          <InfoRow label="Проживание" value="совпадает с регистрацией" />
        )}
        {!hasAddress && (
          <div className="py-1 text-[12.5px] text-muted-2">
            Адрес не указан.
          </div>
        )}
      </div>
    </AccordionCard>
  );

  const sourceAccordion = (
    <AccordionCard
      icon={<Hash size={13} />}
      title="Источник / история"
      badge={sourceText(app)}
      badgeTone="muted"
    >
      <div className="px-0.5">
        <InfoRow icon={<Hash size={14} />} label="Источник" value={sourceText(app)} />
        {app.extraPhone && (
          <InfoRow
            icon={<Phone size={14} />}
            label="Доп. телефон"
            value={app.extraPhone}
          />
        )}
      </div>
    </AccordionCard>
  );

  const rejectionBlock = app.rejectionReason ? (
    <div className="flex items-start gap-2 rounded-2xl bg-red-soft/50 px-3.5 py-3 text-[12.5px] text-red-ink ring-1 ring-inset ring-red-soft">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>
        <b>Отклонена:</b> {app.rejectionReason}
      </span>
    </div>
  ) : null;

  // Главные действия (Принять/Отклонить/Позвонить). На моб. показываем
  // sticky-панель даже если можно только позвонить (заявка уже обработана).
  const showActions =
    !readOnly && (!!onAccept || !!onReject || !!onCall || !!app.phone);
  // Вторичные действия (Спам / Удалить / Позже) — тонкая строка-ссылки.
  const showSecondary = !readOnly && (!!onSpam || !!onDelete || !!onLater);

  const secondaryRow = showSecondary ? (
    <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[12px] font-semibold text-muted-2 lg:justify-start">
      {onLater && (
        <button
          type="button"
          onClick={onLater}
          className="rounded-full px-2.5 py-1.5 transition-colors hover:bg-surface-soft hover:text-ink"
        >
          Позже
        </button>
      )}
      {onSpam && (
        <>
          {onLater && <span className="text-border">·</span>}
          <button
            type="button"
            onClick={onSpam}
            className="rounded-full px-2.5 py-1.5 transition-colors hover:bg-orange-soft/60 hover:text-orange-ink"
          >
            Спам
          </button>
        </>
      )}
      {onDelete && (
        <>
          {(onLater || onSpam) && <span className="text-border">·</span>}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full px-2.5 py-1.5 text-red-600/80 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            Удалить заявку
          </button>
        </>
      )}
    </div>
  ) : null;

  return (
    <>
      {/* ═════════════ ДЕСКТОП (lg+) ═════════════ */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {heroBlock}
          {whatChosenBlock}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <SectionLabel>Проверка клиента</SectionLabel>
          {docsAccordion}
          {passportAccordion}
          {addressAccordion}
          {sourceAccordion}
          {keyDatesBlock}
          {rejectionBlock}
          {/* Кнопки — ПОД ключевыми датами. На компе «Позвонить» нет. */}
          {!readOnly && (onReject || onAccept) && (
            <div className="mt-1 flex gap-2">
              {onReject && (
                <button
                  type="button"
                  onClick={onReject}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-red-soft bg-surface px-4 text-[14px] font-bold text-red-ink transition-colors hover:bg-red-soft/40"
                >
                  <Ban size={16} /> Отклонить
                </button>
              )}
              {onAccept && (
                <button
                  type="button"
                  onClick={onAccept}
                  disabled={acceptDisabled}
                  className="inline-flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-full bg-blue-600 px-4 text-[14px] font-bold text-white shadow-card-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  <Check size={16} /> {acceptLabel}
                </button>
              )}
            </div>
          )}
          {/* Вторичные действия (Позже / Спам / Удалить) */}
          {secondaryRow}
        </div>
      </div>

      {/* ═════════════ МОБАЙЛ (<lg) ═════════════ */}
      <div className="flex flex-col gap-4 lg:hidden">
        {heroBlock}
        {whatChosenBlock}
        {keyDatesBlock}
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Проверка клиента</SectionLabel>
          {docsAccordion}
          {passportAccordion}
          {addressAccordion}
          {sourceAccordion}
        </div>
        {rejectionBlock}
        {/* Вторичные действия — в конце прокрутки, над sticky-панелью. */}
        {secondaryRow}
        {/* кнопки — внизу, sticky (под большой палец). С телефона «Позвонить» есть. */}
        {showActions && <div className="h-2" />}
      </div>

      {/* Мобильная нижняя панель действий — sticky, прилипает к низу модалки. */}
      {showActions && (
        <div className="sticky bottom-0 z-20 -mx-5 mt-1 flex gap-2 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur-md lg:hidden">
          {(onCall || app.phone) && (
            <button
              type="button"
              onClick={() => {
                if (onCall) onCall();
                else if (app.phone) window.location.href = `tel:${app.phone}`;
              }}
              className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[14px] font-bold text-blue-700 transition-colors hover:bg-blue-50"
            >
              <PhoneCall size={17} /> Позвонить
            </button>
          )}
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-red-soft bg-surface px-3 text-[14px] font-bold text-red-ink transition-colors hover:bg-red-soft/40"
            >
              <Ban size={17} /> Отклонить
            </button>
          )}
          {onAccept && (
            <button
              type="button"
              onClick={onAccept}
              disabled={acceptDisabled}
              className="inline-flex h-12 flex-[1.4] items-center justify-center gap-1.5 rounded-full bg-blue-600 px-3 text-[14px] font-bold text-white shadow-card-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Check size={17} /> {acceptLabel}
            </button>
          )}
        </div>
      )}

      {zoom && <Lightbox app={app} kind={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}

/* ===================== Заголовок секции ===================== */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-2">
      {children}
    </div>
  );
}

/* ===================== Аккордеон «Проверка клиента» ===================== */
function AccordionCard({
  icon,
  title,
  badge,
  badgeTone = "muted",
  defaultOpen = false,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  badge?: string;
  badgeTone?: "green" | "amber" | "red" | "muted";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toneCls =
    badgeTone === "green"
      ? "bg-green-soft text-green-ink"
      : badgeTone === "amber"
        ? "bg-orange-soft text-orange-ink"
        : badgeTone === "red"
          ? "bg-red-soft text-red-ink"
          : "bg-surface-soft text-muted";
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm ring-1 ring-inset ring-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-surface-soft/60"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-ink">
          {title}
        </span>
        {badge && (
          <span
            className={cn(
              "max-w-[140px] truncate rounded-full px-2 py-0.5 text-[11px] font-bold",
              toneCls,
            )}
          >
            {badge}
          </span>
        )}
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 text-muted-2 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3.5 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== Ключевые даты ===================== */
function KeyDatesCard({
  start,
  end,
  days,
}: {
  start: string;
  end: string;
  days: number;
}) {
  return (
    <div className="rounded-2xl bg-surface p-3.5 shadow-card-sm ring-1 ring-inset ring-border">
      <div className="mb-2.5 flex items-center gap-1.5 px-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        <CalendarClock size={12} /> Ключевые даты
      </div>
      {/* Десктоп: вертикальный таймлайн + круг-бейдж справа.
          Мобайл: горизонтально (начало — круг — конец). */}
      <div className="relative hidden sm:block">
        {days > 0 && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col items-center rounded-full bg-blue-600 px-3.5 py-3 text-white shadow-card-sm">
            <span className="font-display text-[20px] font-extrabold leading-none tabular-nums">
              {days}
            </span>
            <span className="mt-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white/80">
              {daysWord(days)}
            </span>
          </div>
        )}
        <DateNode filled label="Начало аренды" date={start} connector />
        <DateNode label="Конец периода" date={end} />
      </div>
      {/* Мобайл */}
      <div className="flex items-center justify-between gap-2 sm:hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Начало
            аренды
          </div>
          <div className="mt-0.5 font-display text-[17px] font-extrabold tabular-nums text-ink">
            {start}
          </div>
        </div>
        {days > 0 && (
          <div className="flex shrink-0 flex-col items-center rounded-full bg-blue-600 px-3.5 py-3 text-white shadow-card-sm">
            <span className="font-display text-[18px] font-extrabold leading-none tabular-nums">
              {days}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wide text-white/80">
              {daysWord(days)}
            </span>
          </div>
        )}
        <div className="min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">
            Конец периода{" "}
            <span className="h-2.5 w-2.5 rounded-full border-2 border-ink" />
          </div>
          <div className="mt-0.5 font-display text-[17px] font-extrabold tabular-nums text-ink">
            {end}
          </div>
        </div>
      </div>
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
        {connector && <span className="my-1 min-h-[30px] w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0", connector ? "pb-3" : "")}>
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">
          {label}
        </div>
        <div className="mt-0.5 font-display text-[18px] font-extrabold tabular-nums leading-tight text-ink">
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
      <span className={cn("text-[13px]", muted ? "text-muted-2" : "text-muted")}>
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
