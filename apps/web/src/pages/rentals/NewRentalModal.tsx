import { useEffect, useMemo, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { initialsOf, type Client } from "@/lib/mock/clients";
import {
  MIN_RENTAL_DAYS,
  MODEL_LABEL,
  periodForDays,
  ratePeriodForDays,
  TARIFF,
  TARIFF_PERIOD_LABEL,
  type PaymentMethod,
  type Rental,
  type ScooterModel,
} from "@/lib/mock/rentals";
import { addRental, addRentalAsync, useRentals } from "./rentalsStore";
import { toast } from "@/lib/toast";
import { useAllClients } from "@/pages/clients/clientStore";
import { AddClientModal } from "@/pages/clients/AddClientModal";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiEquipment } from "@/lib/api/equipment";
import { DatePicker } from "@/components/ui/date-picker";
import { useIsMobile } from "@/lib/useIsMobile";
import { ChevronLeft, ArrowRight } from "lucide-react";

// Заголовки шагов мобильного мастера аренды.
const STEP_TITLES = ["Клиент", "Скутер", "Срок", "Оплата"] as const;

/** Сегодня в формате DD.MM.YYYY (локальное время). */
function todayRuDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** DD.MM.YYYY → ISO YYYY-MM-DD (для DatePicker). null если невалидно. */
function ruToIso(ru: string): string | null {
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** ISO YYYY-MM-DD → DD.MM.YYYY (после выбора в DatePicker). */
function isoToRu(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function currentHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type ActiveScooterName = Set<string>;

function modelOfScooter(name: string): ScooterModel {
  if (name.startsWith("Jog")) return "jog";
  if (name.startsWith("Gear")) return "gear";
  if (name.startsWith("Tank")) return "tank";
  return "honda";
}

function activeScooters(rentals: Rental[]): ActiveScooterName {
  const set = new Set<string>();
  for (const r of rentals) {
    if (r.status === "active" || r.status === "overdue" || r.status === "returning") {
      set.add(r.scooter);
    }
  }
  return set;
}

function addDays(base: string, days: number): string {
  const m = base.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return base;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  d.setDate(d.getDate() + days);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function NewRentalModal({
  onClose,
  onCreated,
  preselectedScooterName,
  initialClientId,
  initialModelFilter,
  initialDays,
  initialEquipmentIds,
  initialStart,
}: {
  onClose: () => void;
  onCreated?: (rental: Rental) => void;
  /** Если задан — откроется с уже выбранным скутером. Используется из карточки скутера. */
  preselectedScooterName?: string;
  /** G3: предзаполнение из заявки/конвертации — клиент уже выбран. */
  initialClientId?: number | null;
  /** G3: предвыбранная модель (фильтр списка скутеров) из заявки. */
  initialModelFilter?: string;
  /** G3: предвыбранный срок аренды (дней) из заявки. */
  initialDays?: number;
  /** G3: предвыбранная экипировка (id из каталога) из заявки. */
  initialEquipmentIds?: number[];
  /** G3: желаемая дата начала (ISO YYYY-MM-DD) из заявки — в дату выдачи. */
  initialStart?: string;
}) {
  const rentals = useRentals();
  const allClients = useAllClients();
  const { data: apiScooters } = useApiScooters();
  const { data: modelsCatalog = [] } = useApiScooterModels();
  const { data: equipmentCatalog = [] } = useApiEquipment();
  const blocked = activeScooters(rentals);
  const [closing, setClosing] = useState(false);
  // Мобильный мастер: форма разбивается на 4 шага (Клиент → Скутер →
  // Срок и тариф → Экипировка/залог/оплата). На десктопе все блоки сразу.
  const isMobile = useIsMobile();
  const [step, setStep] = useState(1);

  const [clientId, setClientId] = useState<number | null>(
    initialClientId ?? null,
  );
  const [clientQuery, setClientQuery] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  // Фильтр по модели в селекторе скутеров — пустая строка = все модели.
  const [scooterModelFilter, setScooterModelFilter] = useState<string>(
    initialModelFilter ?? "",
  );
  const [scooterName, setScooterName] = useState<string | null>(
    preselectedScooterName ?? null,
  );
  const [start, setStart] = useState(() => {
    // G3: дата из заявки (ISO) → формат DD.MM.YYYY; иначе сегодня.
    if (initialStart && /^\d{4}-\d{2}-\d{2}/.test(initialStart)) {
      const [y, m, d] = initialStart.slice(0, 10).split("-");
      return `${d}.${m}.${y}`;
    }
    return todayRuDate();
  });
  const [startTime, setStartTime] = useState(() => currentHHMM());
  // 7 дней — самый популярный период проката (тариф «неделя»),
  // ставим дефолтом, чтобы оператор не правил каждый раз.
  const [days, setDays] = useState(initialDays && initialDays > 0 ? initialDays : 7);
  /** Выбранные позиции экипировки — id из equipment_items каталога */
  const [equipmentIds, setEquipmentIds] = useState<number[]>(
    initialEquipmentIds ?? [],
  );
  // v0.9: способ стартового платежа НЕ выбран по умолчанию — оператор
  // обязан осознанно указать нал/безнал (для корректной статистики).
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [note, setNote] = useState("");

  /** Залог: режим — сумма или предмет */
  const [depositMode, setDepositMode] = useState<"sum" | "item">("sum");
  const [depositSum, setDepositSum] = useState<number>(2000);
  const [depositItemText, setDepositItemText] = useState<string>("");

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const client = useMemo(
    () =>
      clientId != null
        ? allClients.find((c) => c.id === clientId) ?? null
        : null,
    [clientId, allClients],
  );

  /** Скутер, выбранный для аренды (из списка API) */
  const selectedScooter = useMemo(
    () => (apiScooters ?? []).find((s) => s.name === scooterName) ?? null,
    [apiScooters, scooterName],
  );

  const model: ScooterModel = scooterName ? modelOfScooter(scooterName) : "jog";

  /**
   * Ставка ₽/сутки:
   * 1. Если у скутера modelId → берём ставки из каталога моделей.
   * 2. Иначе fallback на legacy TARIFF по enum-модели.
   */
  // period — для ПОЛЯ tariffPeriod в БД (short/week/month).
  // ratePeriod — для расчёта ставки ₽/сут (знает "day" для 1-2 дней).
  const period = periodForDays(days);
  const ratePeriod = ratePeriodForDays(days);
  const modelFromCatalog = useMemo(
    () =>
      selectedScooter?.modelId
        ? modelsCatalog.find((m) => m.id === selectedScooter.modelId) ?? null
        : null,
    [selectedScooter, modelsCatalog],
  );
  const computedRate = useMemo(() => {
    if (modelFromCatalog) {
      if (ratePeriod === "day") return modelFromCatalog.dayRate;
      if (ratePeriod === "short") return modelFromCatalog.shortRate;
      if (ratePeriod === "week") return modelFromCatalog.weekRate;
      return modelFromCatalog.monthRate;
    }
    return TARIFF[model][ratePeriod];
  }, [modelFromCatalog, ratePeriod, model]);

  /**
   * v0.4.25: чекбокс «Произвольный тариф» + единица измерения внутри.
   *  • customMode=false → ставка из computedRate (по дням, как было)
   *  • customMode=true  → оператор задаёт rate сам
   *      • customUnit='day'  → rate = ₽/сут, days = поле «срок, дней», sum = rate × days
   *      • customUnit='week' → rate = ₽/нед, поле «срок» означает НЕДЕЛИ;
   *                            days_for_API = N×7, sum = rate × N
   * Просрочка для week-режима считается через dailyEquivalent =
   * round(rate / 7); см. dailyRate() в lib/rentalRate.
   */
  const [customMode, setCustomMode] = useState<boolean>(false);
  const [customUnit, setCustomUnit] = useState<"day" | "week">("day");
  const [customRate, setCustomRate] = useState<string>("");
  const rate = customMode
    ? Math.max(0, Number(customRate) || 0)
    : computedRate;

  /**
   * Сумма аренды.
   * Платная экипировка считается ЗА СУТКИ и плюсуется к стоимости каждых
   * суток: 500₽/сут + шлем 50₽/сут = 550₽/сут × N дней.
   * Поле `price` экипировки трактуется как стоимость в сутки (а не за весь
   * период) — так договорились с заказчиком, это типовая практика проката.
   */
  const equipmentSelected = useMemo(
    () => equipmentCatalog.filter((e) => equipmentIds.includes(e.id)),
    [equipmentCatalog, equipmentIds],
  );
  /** Доплата за экипировку за СУТКИ (один день). */
  const equipmentPerDay = equipmentSelected.reduce(
    (s, e) => s + (e.isFree ? 0 : e.price),
    0,
  );
  /** Доплата за экипировку за ВЕСЬ период аренды. */
  const equipmentExtra = equipmentPerDay * days;
  // v0.4.25: при недельном customMode sum = rate × weeks (rate в ₽/нед).
  // Экипировка остаётся посуточная и считается × days.
  const isWeeklyCustom = customMode && customUnit === "week";
  const weeks = isWeeklyCustom ? Math.max(1, Math.round(days / 7)) : 0;
  const sum = isWeeklyCustom
    ? rate * weeks + equipmentExtra
    : rate * days + equipmentExtra;
  const endPlanned = addDays(start, days);

  const blacklistedClient = !!client?.blacklisted;
  const canSave =
    clientId != null &&
    !blacklistedClient &&
    scooterName != null &&
    days > 0 &&
    paymentMethod != null;

  // Можно ли перейти с шага step на следующий (мобильный мастер).
  const canAdvanceStep = (s: number): boolean => {
    if (s === 1) return clientId != null && !blacklistedClient;
    if (s === 2) return scooterName != null;
    return true; // шаг 3 (срок/тариф) всегда валиден — есть значения по умолчанию
  };

  // Множество клиентов с открытой арендой (active/overdue/returning).
  // Им нельзя выдавать новую — пока не закрыли предыдущую.
  const busyClientIds = useMemo(() => {
    const set = new Set<number>();
    for (const r of rentals) {
      if (
        r.status === "active" ||
        r.status === "overdue" ||
        r.status === "returning"
      ) {
        set.add(r.clientId);
      }
    }
    return set;
  }, [rentals]);

  /**
   * Список клиентов в дропдауне.
   *  - Если поле пустое (или 1 символ) — показываем ВСЕХ доступных
   *    (не в ЧС, без открытой аренды). Скролл, лимит 100. Чтобы быстро
   *    выбрать повторного клиента не вспоминая имя.
   *  - Если есть текст — фильтруем по имени или телефону.
   */
  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const base = allClients
      .filter((c) => !c.blacklisted)
      .filter((c) => !busyClientIds.has(c.id));
    if (q.length < 2) {
      return [...base]
        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
        .slice(0, 100);
    }
    return base
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (qDigits.length > 0 &&
            c.phone.replace(/\D/g, "").includes(qDigits)),
      )
      .slice(0, 50);
  }, [clientQuery, allClients, busyClientIds]);

  /**
   * В аренду можно отдавать ТОЛЬКО скутеры со статусом 'rental_pool'
   * (выделенные владельцем в парк аренды).
   */
  const availableScooters = useMemo(
    () =>
      (apiScooters ?? [])
        .filter(
          (s) =>
            !blocked.has(s.name) &&
            s.baseStatus === "rental_pool" &&
            !s.archivedAt &&
            (scooterModelFilter === "" || s.model === scooterModelFilter),
        )
        .map((s) => ({ name: s.name, model: s.model })),
    [apiScooters, blocked, scooterModelFilter],
  );

  /** Список моделей с количеством свободных скутеров — для чипов фильтра. */
  const modelChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of apiScooters ?? []) {
      if (
        blocked.has(s.name) ||
        s.baseStatus !== "rental_pool" ||
        s.archivedAt
      )
        continue;
      counts.set(s.model, (counts.get(s.model) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }, [apiScooters, blocked]);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!canSave || !scooterName || saving) return;
    setSaving(true);

    // equipmentJson отправляем через rentalsStore в API (он прокинет в equipmentJson)
    const equipmentJson = equipmentSelected.map((e) => ({
      itemId: e.id,
      name: e.name,
      price: e.isFree ? 0 : e.price,
      free: e.isFree,
    }));
    const equipmentLegacyNames = equipmentSelected.map((e) => e.name);

    try {
      // ASYNC: ждём реальный ID из API. Stub-id (Date.now()) не подходит,
      // потому что родитель сразу открывает превью документа по ID,
      // а API не знает таких локальных ID — отдаст 404, превью повиснет.
      const created = await addRentalAsync({
        clientId: clientId!,
        scooterId: selectedScooter?.id,
        scooter: scooterName,
        model,
        start,
        startTime,
        endPlanned,
        status: "active",
        // v0.4.25: rateUnit='week' если оператор выбрал недельный
        // произвольный тариф. tariffPeriod ставим 'week' для совместимости.
        tariffPeriod: isWeeklyCustom ? "week" : period,
        rate,
        rateUnit: isWeeklyCustom ? "week" : "day",
        days,
        sum,
        deposit: depositMode === "sum" ? depositSum : 0,
        depositItem:
          depositMode === "item" ? depositItemText.trim() || null : null,
        equipment: equipmentLegacyNames,
        equipmentJson,
        paymentMethod: paymentMethod ?? "cash",
        note: note.trim() || undefined,
        contractUploaded: false,
        paymentConfirmed: null,
      } as Parameters<typeof addRental>[0]);
      onCreated?.(created);
      requestClose();
    } catch (e) {
      toast.error(
        "Не удалось создать аренду",
        (e as Error).message ?? "Попробуйте ещё раз",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overflow-x-hidden bg-ink/55 p-0 backdrop-blur-sm sm:p-6",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          // Мобайл: полноэкранно (min-h-100dvh, без скруглений). Десктоп: карточка 780.
          "min-h-[100dvh] w-full overflow-hidden bg-surface shadow-card-lg sm:min-h-0 sm:max-w-[780px] sm:rounded-2xl",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              Новая аренда
            </div>
            <div className="text-[11px] text-muted-2">
              заполните 4 блока — ставка и сумма рассчитываются автоматически
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Мобильный прогресс шагов мастера */}
        {isMobile && (
          <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
            {STEP_TITLES.map((t, i) => {
              const n = i + 1;
              const done = n < step;
              const cur = n === step;
              return (
                <div key={t} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-center">
                    <div
                      className={cn(
                        "h-1.5 flex-1 rounded-full",
                        done || cur ? "bg-blue-600" : "bg-surface-soft",
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      "truncate text-[10px] font-semibold",
                      cur ? "text-blue-600" : done ? "text-ink-2" : "text-muted-2",
                    )}
                  >
                    {n}. {t}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-5 py-4 sm:max-h-[calc(100vh-220px)]">
          {/* 1 Клиент */}
          <Section num={1} title="Клиент" mobile={isMobile} current={step}>
            {client ? (
              <ClientChip
                client={client}
                onRemove={() => {
                  setClientId(null);
                  setClientQuery("");
                }}
              />
            ) : isMobile ? (
              <MobileClientPicker
                query={clientQuery}
                onQuery={setClientQuery}
                clients={filteredClients}
                onPick={(id) => setClientId(id)}
                onNew={() => setNewClientOpen(true)}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
                    />
                    <input
                      type="text"
                      value={clientQuery}
                      onChange={(e) => {
                        setClientQuery(e.target.value);
                        setClientOpen(true);
                      }}
                      onFocus={() => setClientOpen(true)}
                      placeholder="Кликните для списка или начните печатать имя/телефон…"
                      className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-[13px] text-ink outline-none focus:border-blue-600"
                    />
                    {clientOpen && (
                      <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[320px] animate-toast-in overflow-y-auto rounded-[10px] border border-border bg-surface shadow-card-lg">
                        {filteredClients.length === 0 ? (
                          <div className="px-3 py-4 text-center text-[12px] text-muted">
                            не найдено — создайте нового
                          </div>
                        ) : (
                          <>
                          {clientQuery.trim().length < 2 && (
                            <div className="sticky top-0 border-b border-border bg-surface-soft px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
                              Свободные клиенты ({filteredClients.length})
                            </div>
                          )}
                          {filteredClients.map((c) => {
                            // v0.5.6: метка о непогашенном ущербе. Если у
                            // клиента висит долг по прошлым актам — красный
                            // бейдж, чтобы оператор подумал прежде чем
                            // выдавать ему новый скутер.
                            const debt = c.unpaidDamageDebt ?? 0;
                            const hasDebt = debt > 0;
                            return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setClientId(c.id);
                                setClientOpen(false);
                              }}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-blue-50"
                              title={
                                hasDebt
                                  ? `Висит долг по ущербу: ${debt.toLocaleString("ru-RU")} ₽`
                                  : undefined
                              }
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[10px] font-bold text-ink-2">
                                {initialsOf(c.name)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-semibold text-ink">
                                  {c.name}
                                </div>
                                <div className="text-[11px] text-muted-2 tabular-nums">
                                  {c.phone}
                                </div>
                              </div>
                              {hasDebt && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-soft px-2 py-0.5 text-[10px] font-bold text-red-ink tabular-nums">
                                  ⚠ долг {debt.toLocaleString("ru-RU")} ₽
                                </span>
                              )}
                              <span className="shrink-0 text-[11px] font-semibold text-muted-2">
                                {c.rating}
                              </span>
                            </button>
                            );
                          })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewClientOpen(true)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-ink px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-2"
                  >
                    <UserPlus size={14} /> Новый клиент
                  </button>
                </div>
                {clientQuery.trim().length < 2 && (
                  <div className="text-[11px] text-muted-2">
                    Введите минимум 2 символа для поиска. Клиенты в чёрном
                    списке не предлагаются.
                  </div>
                )}
              </div>
            )}
            {blacklistedClient && (
              <div className="mt-2 rounded-[10px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
                Клиент в чёрном списке — аренда запрещена
              </div>
            )}
          </Section>

          {/* 2 Скутер */}
          <Section num={2} title="Скутер" mobile={isMobile} current={step}>
            {scooterName ? (
              <button
                type="button"
                onClick={() => setScooterName(null)}
                className="flex w-full items-center justify-between rounded-[10px] bg-blue-50 px-3 py-2.5 text-left"
              >
                <div>
                  <div className="text-[13px] font-semibold text-ink">
                    {scooterName}
                  </div>
                  <div className="text-[11px] text-muted-2">
                    {MODEL_LABEL[model]} · тариф{" "}
                    {TARIFF_PERIOD_LABEL[ratePeriod]} · {rate} ₽/сут
                  </div>
                </div>
                <X size={14} className="text-muted-2" />
              </button>
            ) : isMobile ? (
              <MobileScooterPicker
                scooters={availableScooters}
                modelChips={modelChips}
                filter={scooterModelFilter}
                onFilter={setScooterModelFilter}
                onPick={(name) => setScooterName(name)}
              />
            ) : (
              <>
              {modelChips.length > 1 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setScooterModelFilter("")}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      scooterModelFilter === ""
                        ? "bg-ink text-white"
                        : "bg-surface-soft text-muted-2 hover:text-ink",
                    )}
                  >
                    Все ({modelChips.reduce((s, [, c]) => s + c, 0)})
                  </button>
                  {modelChips.map(([m, count]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setScooterModelFilter(m)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        scooterModelFilter === m
                          ? "bg-ink text-white"
                          : "bg-surface-soft text-muted-2 hover:text-ink",
                      )}
                    >
                      {MODEL_LABEL[m as ScooterModel] ?? m} ({count})
                    </button>
                  ))}
                </div>
              )}
              <div className="flex max-h-[160px] flex-wrap gap-1.5 overflow-y-auto rounded-[10px] border border-border p-2">
                {availableScooters.length === 0 ? (
                  <div className="w-full py-4 text-center text-[12px] text-muted">
                    нет свободных скутеров
                  </div>
                ) : (
                  availableScooters.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => setScooterName(s.name)}
                      className="rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-blue-50 hover:text-blue-700"
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
              </>
            )}
          </Section>

          {/* 3 Срок и тариф */}
          <Section num={3} title="Срок и тариф" mobile={isMobile} current={step}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="text-[12px] font-semibold text-ink">
                Дата выдачи
                <div className="mt-1">
                  <DatePicker
                    value={ruToIso(start)}
                    onChange={(iso) =>
                      setStart(iso ? isoToRu(iso) : todayRuDate())
                    }
                    clearable={false}
                  />
                </div>
              </label>
              <label className="text-[12px] font-semibold text-ink">
                Время
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
                <div className="mt-1 text-[10px] text-muted-2">
                  то же время = дедлайн возврата
                </div>
              </label>
              {/* v0.4.25: в week-режиме поле означает «Срок, недель»;
                  под капотом days = weeks × 7. */}
              <label className="text-[12px] font-semibold text-ink">
                {customMode && customUnit === "week" ? "Срок, недель" : "Срок, дней"}
                <input
                  type="number"
                  min={1}
                  max={customMode && customUnit === "week" ? 26 : 90}
                  value={
                    customMode && customUnit === "week"
                      ? Math.max(1, Math.round(days / 7))
                      : days
                  }
                  onChange={(e) => {
                    const raw = Number(e.target.value) || 1;
                    if (customMode && customUnit === "week") {
                      const weeks = Math.max(1, Math.min(26, raw));
                      setDays(weeks * 7);
                    } else {
                      setDays(Math.max(MIN_RENTAL_DAYS, raw));
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
                <div className="mt-1 text-[10px] text-muted-2">
                  {customMode && customUnit === "week"
                    ? `= ${days} дн (× 7)`
                    : `минимум ${MIN_RENTAL_DAYS} ${MIN_RENTAL_DAYS === 1 ? "сутки" : "суток"}`}
                </div>
              </label>
            </div>
            {/*
              Тарифы показываем только когда выбран конкретный скутер —
              ставки берутся из его модели (modelFromCatalog).
              До выбора показывать «эталонную сетку TARIFF» нет смысла:
              у каждой модели свои цены, общий прайс вводит в заблуждение.
            */}
            {selectedScooter && modelFromCatalog && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["day", "short", "week", "month"] as const).map((p) => {
                  const rateP =
                    p === "day"
                      ? modelFromCatalog.dayRate
                      : p === "short"
                        ? modelFromCatalog.shortRate
                        : p === "week"
                          ? modelFromCatalog.weekRate
                          : modelFromCatalog.monthRate;
                  return (
                    <div
                      key={p}
                      className={cn(
                        "rounded-[10px] px-3 py-2 text-[11px]",
                        !customMode && p === ratePeriod
                          ? "bg-blue-50 text-blue-700"
                          : "bg-surface-soft text-muted",
                      )}
                    >
                      <div className="font-semibold uppercase tracking-wider">
                        {TARIFF_PERIOD_LABEL[p]}
                      </div>
                      <div className="mt-0.5 tabular-nums">{rateP} ₽/сут</div>
                    </div>
                  );
                })}
              </div>
            )}
            {!selectedScooter && (
              <div className="mt-3 rounded-[10px] bg-surface-soft px-3 py-2 text-[12px] text-muted-2">
                Выберите скутер выше — тарифы подтянутся из его модели.
              </div>
            )}
            {/* v0.4.25: чекбокс «Произвольный тариф» (как было) +
                переключатель единицы измерения «₽/сут / ₽/нед» внутри.
                В режиме «нед» поле «Срок» означает НЕДЕЛИ. */}
            <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-border bg-surface-soft p-2">
              <label className="mt-1 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={customMode}
                  onChange={(e) => setCustomMode(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-blue-600"
                />
                <span className="text-[12px] font-semibold">
                  Произвольный тариф
                </span>
              </label>
              {customMode && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customRate}
                    onChange={(e) =>
                      setCustomRate(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="3000"
                    className="h-8 w-24 rounded-[8px] border border-border bg-surface px-2 text-[12px] tabular-nums text-ink outline-none focus:border-blue-600"
                  />
                  <div className="inline-flex rounded-[8px] bg-white p-0.5 ring-1 ring-border">
                    {(["day", "week"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setCustomUnit(u)}
                        className={cn(
                          "rounded-[6px] px-2 py-1 text-[11px] font-semibold transition-colors",
                          customUnit === u
                            ? "bg-blue-600 text-white"
                            : "text-muted hover:text-ink",
                        )}
                      >
                        {u === "day" ? "₽/сут" : "₽/нед"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
              <Calc
                label="Ставка"
                value={`${rate} ₽/${isWeeklyCustom ? "нед" : "сут"}`}
              />
              <Calc
                label="Возврат"
                value={`${endPlanned} ${startTime}`}
                hint={`+${days} дн от ${start} ${startTime}`}
              />
              <Calc
                label="Итог"
                value={`${sum.toLocaleString("ru-RU")} ₽`}
                hint={
                  isWeeklyCustom
                    ? equipmentPerDay > 0
                      ? `${rate}×${weeks} нед + ${equipmentPerDay}×${days}`
                      : `${rate} × ${weeks} нед`
                    : equipmentPerDay > 0
                      ? `(${rate}+${equipmentPerDay}) × ${days}`
                      : `${rate} × ${days}`
                }
                emphasize
              />
            </div>
            {equipmentPerDay > 0 && (
              <div className="mt-2 rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
                Платная экипировка добавляет{" "}
                <b>+{equipmentPerDay} ₽/сут</b> · {" "}
                <b>+{equipmentExtra.toLocaleString("ru-RU")} ₽</b> выручки
                за {days} {plural(days, ["день", "дня", "дней"])}
                {equipmentSelected.filter((e) => !e.isFree).length > 0 && (
                  <>
                    {" "}
                    (
                    {equipmentSelected
                      .filter((e) => !e.isFree)
                      .map((e) => `${e.name} +${e.price} ₽`)
                      .join(", ")}
                    )
                  </>
                )}
              </div>
            )}
          </Section>

          {/* 4 Экипировка + залог + оплата */}
          <Section num={4} title="Экипировка, залог и оплата" mobile={isMobile} current={step}>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Выданная экипировка {equipmentExtra > 0 && (
                  <span className="text-blue-700">+{equipmentExtra}₽</span>
                )}
              </div>
              {equipmentCatalog.length === 0 ? (
                <div className="text-[12px] text-muted">
                  Каталог пуст — добавьте позиции в «Гараж → Экипировка».
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {equipmentCatalog
                    .filter((e) => e.quickPick)
                    .map((e) => {
                      const on = equipmentIds.includes(e.id);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() =>
                            setEquipmentIds((prev) =>
                              on ? prev.filter((x) => x !== e.id) : [...prev, e.id],
                            )
                          }
                          title={e.isFree ? "бесплатно" : `+${e.price}₽`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                            on
                              ? "bg-blue-600 text-white"
                              : "bg-surface-soft text-muted hover:bg-border",
                          )}
                        >
                          {on && <Check size={11} />} {e.name}
                          {!e.isFree && (
                            <span className="opacity-70">+{e.price}₽</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="mt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Залог
              </div>
              <div className="mb-2 inline-flex rounded-full bg-surface-soft p-0.5">
                <button
                  type="button"
                  onClick={() => setDepositMode("sum")}
                  className={cn(
                    "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                    depositMode === "sum"
                      ? "bg-ink text-white"
                      : "text-muted hover:text-ink",
                  )}
                >
                  Сумма
                </button>
                <button
                  type="button"
                  onClick={() => setDepositMode("item")}
                  className={cn(
                    "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                    depositMode === "item"
                      ? "bg-ink text-white"
                      : "text-muted hover:text-ink",
                  )}
                >
                  Предмет
                </button>
              </div>
              {depositMode === "sum" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={depositSum}
                    onChange={(e) =>
                      setDepositSum(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="h-9 w-40 rounded-[10px] border border-border bg-surface px-3 text-[13px] outline-none focus:border-blue-600"
                  />
                  <span className="text-[12px] text-muted-2">₽</span>
                  <button
                    type="button"
                    onClick={() => setDepositSum(2000)}
                    className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-3 py-1 text-[11px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
                  >
                    2000₽
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={depositItemText}
                  onChange={(e) => setDepositItemText(e.target.value)}
                  maxLength={200}
                  placeholder="Например: паспорт, iPhone, ключи от квартиры"
                  className="h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] outline-none focus:border-blue-600"
                />
              )}
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Способ оплаты
                {paymentMethod === null && (
                  <span className="rounded-full bg-orange-soft px-1.5 py-0.5 text-[9px] font-bold normal-case text-orange-ink">
                    выберите
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {(["cash", "transfer"] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={cn(
                      "flex-1 rounded-[10px] px-3 py-2 text-[12px] font-semibold transition-colors",
                      paymentMethod === m
                        ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600"
                        : paymentMethod === null
                          ? "bg-orange-soft/40 text-ink ring-1 ring-inset ring-orange-ink/30 hover:bg-orange-soft/60"
                          : "bg-surface-soft text-muted hover:bg-border",
                    )}
                  >
                    {m === "cash" ? "Наличные" : "Безнал"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[12px] font-semibold text-ink">
                Заметка (необязательно)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Например: планирует продление на второй срок"
                  rows={2}
                  className="mt-1 w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:border-blue-600"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-[10px] bg-surface-soft px-3 py-2 text-[12px]">
              <span className="text-muted">
                Залог {depositMode === "item" ? "(предмет)" : "(возвращается без ущерба)"}
              </span>
              <span className="font-bold tabular-nums text-ink">
                {depositMode === "sum"
                  ? `${depositSum.toLocaleString("ru-RU")} ₽`
                  : depositItemText.trim() || "—"}
              </span>
            </div>

            {/* Сводка заказа на мобиле — обзор перед созданием. */}
            {isMobile && (
              <OrderSummary
                clientName={client?.name ?? "—"}
                scooterName={scooterName}
                model={MODEL_LABEL[model]}
                period={`${start} ${startTime} → ${endPlanned} ${startTime}`}
                days={days}
                rate={rate}
                rateUnit={isWeeklyCustom ? "нед" : "сут"}
                deposit={
                  depositMode === "sum"
                    ? `${depositSum.toLocaleString("ru-RU")} ₽`
                    : depositItemText.trim() || "предмет не указан"
                }
                payment={
                  paymentMethod === "cash"
                    ? "Наличные"
                    : paymentMethod === "transfer"
                      ? "Безнал"
                      : "—"
                }
                total={sum}
              />
            )}
          </Section>
        </div>

        {isMobile ? (
          /* Мобильный футер мастера: Назад · Далее (последний шаг — Создать). */
          <div className="flex items-center gap-2 border-t border-border bg-surface px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => (step === 1 ? requestClose() : setStep((s) => s - 1))}
              className="flex min-h-[48px] items-center justify-center gap-1 rounded-xl border border-border px-4 text-[14px] font-semibold text-muted active:bg-surface-soft"
            >
              <ChevronLeft size={18} />
              {step === 1 ? "Отмена" : "Назад"}
            </button>
            {step < 4 ? (
              <button
                type="button"
                disabled={!canAdvanceStep(step)}
                onClick={() => canAdvanceStep(step) && setStep((s) => s + 1)}
                className={cn(
                  "flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px] font-bold transition-colors",
                  canAdvanceStep(step)
                    ? "bg-blue-600 text-white active:bg-blue-700"
                    : "cursor-not-allowed bg-surface-soft text-muted-2",
                )}
              >
                Далее <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                disabled={!canSave || saving}
                onClick={handleSave}
                className={cn(
                  "flex min-h-[48px] flex-1 items-center justify-center rounded-xl text-[14px] font-bold transition-colors",
                  canSave && !saving
                    ? "bg-blue-600 text-white active:bg-blue-700"
                    : "cursor-not-allowed bg-surface-soft text-muted-2",
                )}
              >
                Создать и выдать
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-soft px-5 py-3">
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-2">
              После создания нужно подтвердить выдачу (договор, аренда, залог).
            </span>
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-full border border-border bg-surface px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-border"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={handleSave}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
                  canSave
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-surface-soft text-muted-2",
                )}
              >
                Создать и выдать
              </button>
            </div>
          </div>
        )}
      </div>

      {newClientOpen && (
        <AddClientModal
          onClose={() => setNewClientOpen(false)}
          onCreated={(c) => {
            setClientId(c.id);
            setClientQuery("");
            setNewClientOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Section({
  num,
  title,
  children,
  mobile,
  current,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
  // На мобиле (mobile=true) показываем только секцию активного шага current.
  mobile?: boolean;
  current?: number;
}) {
  if (mobile && current != null && current !== num) return null;
  return (
    <section className="mb-5 last:mb-0">
      {/* На мобиле номер-шага дублируется в прогресс-баре сверху — здесь скрываем. */}
      <header className={cn("mb-2 flex items-center gap-2", mobile && "hidden")}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
          {num}
        </span>
        <h3 className="font-display text-[16px] font-extrabold text-ink">
          {title}
        </h3>
      </header>
      <div>{children}</div>
    </section>
  );
}

function ClientChip({
  client: c,
  onRemove,
}: {
  client: Client;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-blue-50 px-3 py-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[12px] font-bold text-ink">
        {initialsOf(c.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">
          {c.name}
          {c.blacklisted && (
            <span className="ml-2 text-[10px] font-bold text-red-ink">ЧС</span>
          )}
        </div>
        <div className="text-[11px] text-muted-2 tabular-nums">{c.phone}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-border"
        title="Сменить"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function Calc({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] px-3 py-2",
        emphasize ? "bg-blue-50 text-blue-700" : "bg-surface-soft text-ink",
      )}
    >
      <div className="text-[11px] text-muted-2">{label}</div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          emphasize ? "text-[16px]" : "text-[13px]",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-2">{hint}</div>}
    </div>
  );
}

// ===== Мобильные шаги мастера (нативные UI, не показываются на десктопе) =====

function MobileClientPicker({
  query,
  onQuery,
  clients,
  onPick,
  onNew,
}: {
  query: string;
  onQuery: (v: string) => void;
  clients: Client[];
  onPick: (id: number) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Имя или телефон…"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-[15px] text-ink outline-none focus:border-blue-600"
        />
      </div>
      <button
        type="button"
        onClick={onNew}
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-ink text-[14px] font-bold text-white active:bg-ink-2"
      >
        <UserPlus size={16} /> Новый клиент
      </button>
      <div className="flex flex-col gap-1.5">
        {clients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-6 text-center text-[13px] text-muted">
            Не найдено — создайте нового
          </div>
        ) : (
          clients.map((c) => {
            const debt = c.unpaidDamageDebt ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c.id)}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left active:bg-surface-soft"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[12px] font-bold text-ink-2">
                  {initialsOf(c.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-ink">{c.name}</div>
                  <div className="text-[12px] text-muted-2 tabular-nums">{c.phone}</div>
                </div>
                {debt > 0 && (
                  <span className="shrink-0 rounded-full bg-red-soft px-2 py-0.5 text-[10px] font-bold text-red-ink tabular-nums">
                    долг {debt.toLocaleString("ru-RU")} ₽
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function MobileScooterPicker({
  scooters,
  modelChips,
  filter,
  onFilter,
  onPick,
}: {
  scooters: { name: string; model: ScooterModel }[];
  modelChips: [string, number][];
  filter: string;
  onFilter: (m: string) => void;
  onPick: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {modelChips.length > 1 && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          <button
            type="button"
            onClick={() => onFilter("")}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold",
              filter === "" ? "bg-ink text-white" : "bg-surface-soft text-muted",
            )}
          >
            Все ({modelChips.reduce((s, [, c]) => s + c, 0)})
          </button>
          {modelChips.map(([m, count]) => (
            <button
              key={m}
              type="button"
              onClick={() => onFilter(m)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold",
                filter === m ? "bg-ink text-white" : "bg-surface-soft text-muted",
              )}
            >
              {MODEL_LABEL[m as ScooterModel] ?? m} ({count})
            </button>
          ))}
        </div>
      )}
      {scooters.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-6 text-center text-[13px] text-muted">
          Нет свободных скутеров
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {scooters.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => onPick(s.name)}
              className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-3 text-left active:bg-blue-50"
            >
              <span className="text-[15px] font-bold text-ink">{s.name}</span>
              <span className="text-[12px] text-muted-2">{MODEL_LABEL[s.model]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderSummary({
  clientName,
  scooterName,
  model,
  period,
  days,
  rate,
  rateUnit,
  deposit,
  payment,
  total,
}: {
  clientName: string;
  scooterName: string | null;
  model: string;
  period: string;
  days: number;
  rate: number;
  rateUnit: string;
  deposit: string;
  payment: string;
  total: number;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-blue-700">
        Сводка заказа
      </div>
      <dl className="space-y-1.5 text-[13px]">
        <SummaryRow label="Клиент" value={clientName} />
        <SummaryRow
          label="Скутер"
          value={scooterName ? `${scooterName} · ${model}` : "—"}
        />
        <SummaryRow label="Срок" value={`${period} · ${days} дн`} />
        <SummaryRow label="Тариф" value={`${rate} ₽/${rateUnit}`} />
        <SummaryRow label="Залог" value={deposit} />
        <SummaryRow label="Оплата" value={payment} />
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-blue-200 pt-3">
        <span className="text-[13px] font-semibold text-ink">Итого</span>
        <span className="font-display text-[22px] font-extrabold tabular-nums text-blue-700">
          {total.toLocaleString("ru-RU")} ₽
        </span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-2">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
