import { useEffect, useMemo, useState } from "react";
import { Check, Search, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { initialsOf, type Client } from "@/lib/mock/clients";
import {
  DEPOSIT_AMOUNT,
  MIN_RENTAL_DAYS,
  MODEL_LABEL,
  periodForDays,
  TARIFF,
  TARIFF_PERIOD_LABEL,
  type PaymentMethod,
  type Rental,
  type ScooterModel,
} from "@/lib/mock/rentals";
import { addRental, useRentals } from "./rentalsStore";
import { useAllClients } from "@/pages/clients/clientStore";
import { AddClientModal } from "@/pages/clients/AddClientModal";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiEquipment } from "@/lib/api/equipment";

/** Сегодня в формате DD.MM.YYYY (локальное время). */
function todayRuDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
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
}: {
  onClose: () => void;
  onCreated?: (rental: Rental) => void;
}) {
  const rentals = useRentals();
  const allClients = useAllClients();
  const { data: apiScooters } = useApiScooters();
  const { data: modelsCatalog = [] } = useApiScooterModels();
  const { data: equipmentCatalog = [] } = useApiEquipment();
  const blocked = activeScooters(rentals);
  const [closing, setClosing] = useState(false);

  const [clientId, setClientId] = useState<number | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [scooterName, setScooterName] = useState<string | null>(null);
  const [start, setStart] = useState(() => todayRuDate());
  const [startTime, setStartTime] = useState(() => currentHHMM());
  const [days, setDays] = useState(14);
  /** Выбранные позиции экипировки — id из equipment_items каталога */
  const [equipmentIds, setEquipmentIds] = useState<number[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
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
  const period = periodForDays(days);
  const modelFromCatalog = useMemo(
    () =>
      selectedScooter?.modelId
        ? modelsCatalog.find((m) => m.id === selectedScooter.modelId) ?? null
        : null,
    [selectedScooter, modelsCatalog],
  );
  const rate = useMemo(() => {
    if (modelFromCatalog) {
      if (period === "short") return modelFromCatalog.shortRate;
      if (period === "week") return modelFromCatalog.weekRate;
      return modelFromCatalog.monthRate;
    }
    return TARIFF[model][period];
  }, [modelFromCatalog, period, model]);

  /** Сумма аренды — rate*days + платная экипировка */
  const equipmentSelected = useMemo(
    () => equipmentCatalog.filter((e) => equipmentIds.includes(e.id)),
    [equipmentCatalog, equipmentIds],
  );
  const equipmentExtra = equipmentSelected.reduce(
    (s, e) => s + (e.isFree ? 0 : e.price),
    0,
  );
  const sum = rate * days + equipmentExtra;
  const endPlanned = addDays(start, days);

  const blacklistedClient = !!client?.blacklisted;
  const canSave =
    clientId != null &&
    !blacklistedClient &&
    scooterName != null &&
    days > 0;

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const qDigits = q.replace(/\D/g, "");
    return allClients
      .filter((c) => !c.blacklisted)
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (qDigits.length > 0 &&
            c.phone.replace(/\D/g, "").includes(qDigits)),
      )
      .slice(0, 6);
  }, [clientQuery, allClients]);

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
            !s.archivedAt,
        )
        .map((s) => ({ name: s.name, model: s.model })),
    [apiScooters, blocked],
  );

  const handleSave = () => {
    if (!canSave || !scooterName) return;

    // equipmentJson отправляем через rentalsStore в API (он прокинет в equipmentJson)
    const equipmentJson = equipmentSelected.map((e) => ({
      itemId: e.id,
      name: e.name,
      price: e.isFree ? 0 : e.price,
      free: e.isFree,
    }));
    const equipmentLegacyNames = equipmentSelected.map((e) => e.name);

    const created = addRental({
      clientId: clientId!,
      scooterId: selectedScooter?.id,
      scooter: scooterName,
      model,
      start,
      startTime,
      endPlanned,
      status: "active",
      tariffPeriod: period,
      rate,
      days,
      sum,
      deposit: depositMode === "sum" ? depositSum : 0,
      depositItem: depositMode === "item" ? depositItemText.trim() || null : null,
      equipment: equipmentLegacyNames,
      equipmentJson,
      paymentMethod,
      note: note.trim() || undefined,
      contractUploaded: false,
      paymentConfirmed: null,
    } as Parameters<typeof addRental>[0]);
    onCreated?.(created);
    requestClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "w-full max-w-[780px] overflow-hidden rounded-2xl bg-surface shadow-card-lg",
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

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto px-5 py-4">
          {/* 1 Клиент */}
          <Section num={1} title="Клиент">
            {client ? (
              <ClientChip
                client={client}
                onRemove={() => {
                  setClientId(null);
                  setClientQuery("");
                }}
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
                      placeholder="Начните вводить имя или телефон (минимум 2 символа)…"
                      className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-[13px] text-ink outline-none focus:border-blue-600"
                    />
                    {clientOpen && clientQuery.trim().length >= 2 && (
                      <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[260px] animate-toast-in overflow-y-auto rounded-[10px] border border-border bg-surface shadow-card-lg">
                        {filteredClients.length === 0 ? (
                          <div className="px-3 py-4 text-center text-[12px] text-muted">
                            не найдено — создайте нового
                          </div>
                        ) : (
                          filteredClients.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setClientId(c.id);
                                setClientOpen(false);
                              }}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-blue-50"
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
                              <span className="shrink-0 text-[11px] font-semibold text-muted-2">
                                {c.rating}
                              </span>
                            </button>
                          ))
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
          <Section num={2} title="Скутер">
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
                    {TARIFF_PERIOD_LABEL[period]} · {rate} ₽/сут
                  </div>
                </div>
                <X size={14} className="text-muted-2" />
              </button>
            ) : (
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
            )}
          </Section>

          {/* 3 Срок и тариф */}
          <Section num={3} title="Срок и тариф">
            <div className="grid grid-cols-3 gap-3">
              <label className="text-[12px] font-semibold text-ink">
                Дата выдачи
                <input
                  type="text"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
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
              <label className="text-[12px] font-semibold text-ink">
                Срок, дней
                <input
                  type="number"
                  min={MIN_RENTAL_DAYS}
                  max={90}
                  value={days}
                  onChange={(e) =>
                    setDays(
                      Math.max(MIN_RENTAL_DAYS, Number(e.target.value) || MIN_RENTAL_DAYS),
                    )
                  }
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
                <div className="mt-1 text-[10px] text-muted-2">
                  минимум {MIN_RENTAL_DAYS} дня
                </div>
              </label>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["short", "week", "month"] as const).map((p) => (
                <div
                  key={p}
                  className={cn(
                    "rounded-[10px] px-3 py-2 text-[11px]",
                    p === period
                      ? "bg-blue-50 text-blue-700"
                      : "bg-surface-soft text-muted",
                  )}
                >
                  <div className="font-semibold uppercase tracking-wider">
                    {TARIFF_PERIOD_LABEL[p]}
                  </div>
                  <div className="mt-0.5 tabular-nums">
                    {TARIFF[model][p]} ₽/сут
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
              <Calc label="Ставка" value={`${rate} ₽/сут`} />
              <Calc
                label="Возврат"
                value={`${endPlanned} ${startTime}`}
                hint={`+${days} дн от ${start} ${startTime}`}
              />
              <Calc
                label="Итог"
                value={`${sum.toLocaleString("ru-RU")} ₽`}
                hint={`${rate} × ${days}`}
                emphasize
              />
            </div>
          </Section>

          {/* 4 Экипировка + залог + оплата */}
          <Section num={4} title="Экипировка, залог и оплата">
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
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Способ оплаты
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
                        : "bg-surface-soft text-muted hover:bg-border",
                    )}
                  >
                    {m === "cash" ? "Наличные" : "Перевод"}
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
                Залог (фиксированный, возвращается без ущерба)
              </span>
              <span className="font-bold tabular-nums text-ink">
                {DEPOSIT_AMOUNT.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </Section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-soft px-5 py-3">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-2">
            После создания потребуется загрузить скан договора и подтвердить
            оплату
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
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <header className="mb-2 flex items-center gap-2">
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
