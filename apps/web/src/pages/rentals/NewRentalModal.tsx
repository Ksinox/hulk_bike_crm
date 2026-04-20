import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLIENTS,
  initialsOf,
  type Client,
} from "@/lib/mock/clients";
import {
  DEPOSIT_AMOUNT,
  MODEL_LABEL,
  periodForDays,
  TARIFF,
  TARIFF_PERIOD_LABEL,
  type PaymentMethod,
  type Rental,
  type ScooterModel,
} from "@/lib/mock/rentals";
import { mockPark, type ScootStatus } from "@/lib/mock/dashboard";
import { addRental, useRentals } from "./rentalsStore";

const TODAY_STR = "13.10.2026";
const EQUIPMENT = ["шлем", "держатель", "замок"];

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
  const blocked = activeScooters(rentals);
  const [closing, setClosing] = useState(false);

  const [clientId, setClientId] = useState<number | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [scooterName, setScooterName] = useState<string | null>(null);
  const [start, setStart] = useState(TODAY_STR);
  const [days, setDays] = useState(14);
  const [equipment, setEquipment] = useState<string[]>(["шлем"]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [note, setNote] = useState("");

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
    () => (clientId != null ? CLIENTS.find((c) => c.id === clientId) : null),
    [clientId],
  );

  const model: ScooterModel = scooterName ? modelOfScooter(scooterName) : "jog";
  const period = periodForDays(days);
  const rate = TARIFF[model][period];
  const sum = rate * days;
  const endPlanned = addDays(start, days);

  const blacklistedClient = !!client?.blacklisted;
  const canSave =
    clientId != null &&
    !blacklistedClient &&
    scooterName != null &&
    days > 0;

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return CLIENTS.slice(0, 8);
    return CLIENTS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")),
    ).slice(0, 8);
  }, [clientQuery]);

  const availableScooters = useMemo(
    () =>
      mockPark.filter(
        (s) =>
          !blocked.has(s.name) &&
          s.status !== ("repair" as ScootStatus) &&
          s.status !== ("sold" as ScootStatus) &&
          s.status !== ("rassrochka" as ScootStatus),
      ),
    [blocked],
  );

  const handleSave = () => {
    if (!canSave || !scooterName) return;
    const created = addRental({
      clientId: clientId!,
      scooter: scooterName,
      model,
      start,
      endPlanned,
      status: "active",
      tariffPeriod: period,
      rate,
      days,
      sum,
      deposit: DEPOSIT_AMOUNT,
      equipment,
      paymentMethod,
      note: note.trim() || undefined,
    });
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
              <>
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
                  />
                  <input
                    type="text"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder="Имя или телефон…"
                    className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-[13px] text-ink outline-none focus:border-blue-600"
                  />
                </div>
                <div className="mt-2 flex flex-col gap-1 overflow-hidden rounded-[10px] border border-border">
                  {filteredClients.length === 0 ? (
                    <div className="px-3 py-4 text-center text-[12px] text-muted">
                      не найдено
                    </div>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setClientId(c.id)}
                        className="flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-blue-50"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[10px] font-bold text-ink-2">
                          {initialsOf(c.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-ink">
                            {c.name}
                            {c.blacklisted && (
                              <span className="ml-2 text-[10px] font-bold text-red-ink">
                                ЧС
                              </span>
                            )}
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
              </>
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
            <div className="grid grid-cols-2 gap-3">
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
                Срок, дней
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={days}
                  onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 0))}
                  className="mt-1 h-9 w-full rounded-[10px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-600"
                />
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
                value={endPlanned}
                hint={`+${days} дн от ${start}`}
              />
              <Calc
                label="Итог"
                value={`${sum.toLocaleString("ru-RU")} ₽`}
                hint={`${rate} × ${days}`}
                emphasize
              />
            </div>
          </Section>

          {/* 4 Экипировка и оплата */}
          <Section num={4} title="Экипировка и оплата">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Выданная экипировка
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENT.map((e) => {
                  const on = equipment.includes(e);
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() =>
                        setEquipment((prev) =>
                          on ? prev.filter((x) => x !== e) : [...prev, e],
                        )
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                        on
                          ? "bg-blue-600 text-white"
                          : "bg-surface-soft text-muted hover:bg-border",
                      )}
                    >
                      {on && <Check size={11} />} {e}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
                Способ оплаты
              </div>
              <div className="flex gap-2">
                {(["cash", "card", "transfer"] as PaymentMethod[]).map((m) => (
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
                    {m === "cash" ? "Наличные" : m === "card" ? "Карта" : "Перевод"}
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

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <span className="text-[11px] text-muted-2">
            При сохранении аренда сразу станет активной (требуется подписанный
            договор и получена оплата)
          </span>
          <div className="flex gap-2">
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
