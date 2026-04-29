import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Bike,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Gauge,
  History,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_AMOUNT,
  MODEL_LABEL,
  PAYMENT_LABEL,
  TARIFF_PERIOD_LABEL,
  type Rental,
} from "@/lib/mock/rentals";
import {
  addRentalIncident,
  getRentalChainIds,
  markPaymentPaid,
  toggleTask,
  useArchivedRentals,
  useInspection,
  useRentalIncidents,
  useRentalPayments,
  useRentals,
  useRentalTasks,
} from "./rentalsStore";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { navigate } from "@/app/navigationStore";
import { toast } from "@/lib/toast";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { useDamageReports } from "@/lib/api/damage-reports";

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "0";
  return n.toLocaleString("ru-RU");
}

/* =================== Условия =================== */

/** SVG-иконка мото-шлема (в lucide нет подходящей — используем собственную) */
function HelmetIcon({
  size = 14,
  className,
}: {
  size?: number | string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 15a9 9 0 0 1 18 0v1H3v-1z" />
      <path d="M3 16h18" />
      <path d="M3 18h18" />
      <path d="M15 10h4" />
    </svg>
  );
}

/** детерминированный фейковый пробег по номеру скутера (до появления флот-модуля) */
function mockMileage(scooter: string): number {
  const m = scooter.match(/#(\d+)/);
  const n = m ? +m[1] : 1;
  // ~2,000 … 18,500 км — выглядит реалистично для демо
  return 2000 + ((n * 727) % 165) * 100;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function TermsTab({
  rental,
  onClientClick,
  onSwapScooter,
}: {
  rental: Rental;
  onClientClick?: () => void;
  /** Открыть диалог замены скутера. Если undefined — кнопка не показана. */
  onSwapScooter?: () => void;
}) {
  const { data: apiClients } = useApiClients();
  const client = apiClients?.find((c) => c.id === rental.clientId);
  const time = rental.startTime ?? "12:00";
  const location = "Склад \"Северный\"";
  const mileage = mockMileage(rental.scooter);

  // Корневая (первая) аренда цепочки — её start показываем как «дату
  // выдачи». Текущая (последняя в цепочке) аренда даёт endPlanned. Так
  // график показывает реальный период проката, а не отрезок одного
  // продления.
  const activeRentals = useRentals();
  const archivedRentals = useArchivedRentals();
  const allRentals = useMemo(
    () => [...activeRentals, ...archivedRentals],
    [activeRentals, archivedRentals],
  );
  const chainIds = useMemo(
    () => getRentalChainIds(rental.id, allRentals),
    [rental.id, allRentals],
  );
  const chainRentals = useMemo(
    () => allRentals.filter((r) => chainIds.includes(r.id)),
    [allRentals, chainIds],
  );
  const rootRental =
    chainRentals.find((r) => r.id === chainIds[0]) ?? rental;
  const isExtended = chainRentals.length > 1;
  const totalDays = isExtended
    ? chainRentals.reduce((s, r) => s + (r.days || 0), 0)
    : rental.days;

  // История скутеров в цепочке. Возвращает массив ВСЕХ уникальных скутеров
  // в порядке появления в цепочке (включая текущий) — для рендера в виде
  // «X → Y → Z(текущий)» с tooltip на каждом (причина замены).
  //
  //   reason для X = note той связки, которая пришла на смену (т.е. где
  //   scooterId впервые отличается от X). У note формат:
  //     "замена скутера: <reason>"  (если пользователь указал)
  //     "замена скутера #NNNN"      (фоллбек)
  const scooterChain = useMemo(() => {
    const ordered = chainIds
      .map((id) => chainRentals.find((r) => r.id === id))
      .filter((r): r is Rental => !!r);
    type Item = {
      scooterId: number;
      scooter: string;
      /** id связки, в которой скутер был активен (последняя такая). */
      lastRentalId: number;
      /** id связки, ставшей причиной отказа от этого скутера. */
      replacedByRentalId: number | null;
      /** Очищенная причина замены (без префикса). */
      reason: string | null;
      isCurrent: boolean;
    };
    const items: Item[] = [];
    let prev: Rental | null = null;
    for (const r of ordered) {
      if (r.scooterId == null) continue;
      if (prev && prev.scooterId === r.scooterId) {
        // Это просто продление (тот же скутер) — обновляем lastRentalId
        // у текущего items[items.length-1].
        const last = items[items.length - 1];
        if (last) last.lastRentalId = r.id;
      } else {
        // Новый скутер в цепочке — это либо самый первый, либо замена.
        // Если это замена (prev != null && отличается scooterId) —
        // у предыдущего пункта истории мы записываем replacedByRentalId
        // и парсим reason из note текущей связки.
        if (prev && items.length > 0) {
          const last = items[items.length - 1];
          last.replacedByRentalId = r.id;
          last.reason = parseSwapReason(r.note ?? null);
        }
        items.push({
          scooterId: r.scooterId,
          scooter: r.scooter,
          lastRentalId: r.id,
          replacedByRentalId: null,
          reason: null,
          isCurrent: false,
        });
      }
      prev = r;
    }
    if (items.length > 0) {
      items[items.length - 1]!.isCurrent = true;
    }
    return items;
  }, [chainIds, chainRentals]);

  // Только «прошлые» (не текущий) — для блока «Ранее в этой аренде».
  const scooterHistory = useMemo(
    () => scooterChain.filter((x) => !x.isCurrent),
    [scooterChain],
  );

  // Признак «текущий скутер — замена» (предыдущая связка в цепочке имела
  // другой скутер). Проверяем по parentRentalId, чтобы текст «Скутер
  // заменён» появился именно на child-связке после swap.
  const isReplacement = useMemo(() => {
    if (rental.parentRentalId == null) return false;
    const parent = allRentals.find((r) => r.id === rental.parentRentalId);
    if (!parent || parent.scooterId == null) return false;
    return parent.scooterId !== rental.scooterId;
  }, [rental.parentRentalId, rental.scooterId, allRentals]);

  return (
    <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
      {/* ============ ЛЕВАЯ КОЛОНКА: СКУТЕР + УСЛОВИЯ ============ */}
      <div className="flex flex-col gap-2">
      <div
        className="group rounded-[14px] border border-border p-4 text-left transition-colors hover:bg-surface-soft/60"
      >
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => {
              if (rental.scooterId == null) {
                toast.warn(
                  "Скутер не привязан",
                  "Откройте «Изменить аренду» — там можно настроить параметры аренды.",
                );
                return;
              }
              navigate({
                route: "fleet",
                scooterId: rental.scooterId,
                from: { route: "rentals", rentalId: rental.id },
              });
            }}
            title={
              rental.scooterId != null
                ? "Открыть карточку скутера"
                : "Скутер ещё не назначен"
            }
            className="shrink-0"
          >
            <ScooterThumb rental={rental} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (rental.scooterId == null) return;
                  navigate({
                    route: "fleet",
                    scooterId: rental.scooterId,
                    from: { route: "rentals", rentalId: rental.id },
                  });
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                    Скутер
                  </div>
                  {isReplacement && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                      <ArrowLeftRight size={9} /> Замена
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-2">Model &amp; ID</div>
                <div className="mt-0.5 font-display text-[18px] font-extrabold leading-tight text-ink">
                  {rental.scooter} · {MODEL_LABEL[rental.model]}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {onSwapScooter && rental.scooterId != null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSwapScooter();
                    }}
                    title="Заменить скутер на другой"
                    className="inline-flex items-center gap-1 rounded-[8px] border border-blue-500 bg-white px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                  >
                    <ArrowLeftRight size={11} /> Заменить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (rental.scooterId == null) return;
                    navigate({
                      route: "fleet",
                      scooterId: rental.scooterId,
                      from: { route: "rentals", rentalId: rental.id },
                    });
                  }}
                  title="Открыть карточку скутера"
                  className="rounded-[6px] p-1 text-muted-2 hover:bg-surface-soft hover:text-ink"
                >
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-soft px-2.5 py-1 text-[11px] font-semibold text-ink-2">
              <Gauge size={12} className="text-muted-2" />
              Пробег: {fmt(mileage)} км
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
          <InfoCell
            icon={CreditCard}
            label="Тариф"
            value={`от ${TARIFF_PERIOD_LABEL[rental.tariffPeriod].replace(/^от\s+/i, "")} · ${fmt(rental.rate)} ₽/сут`}
          />
          <InfoCell
            icon={CreditCard}
            label="Оплата"
            value={PAYMENT_LABEL[rental.paymentMethod]}
          />
          <InfoCell
            icon={ShieldCheck}
            label="Залог"
            value={`${fmt(rental.deposit || DEPOSIT_AMOUNT)} ₽`}
            hint={
              rental.depositReturned === true
                ? "возвращён клиенту"
                : rental.depositReturned === false
                  ? "удержан"
                  : "на балансе компании"
            }
          />
          <InfoCell
            icon={HelmetIcon}
            label="Экипировка"
            value={
              rental.equipment.length === 0
                ? "не выдавалась"
                : rental.equipment
                    .map(
                      (e) => e.charAt(0).toUpperCase() + e.slice(1),
                    )
                    .join(", ")
            }
          />
        </div>
      </div>

      {/* История скутеров: предыдущие в этой аренде. Каждый скутер —
          мини-аватарка с моделью; стрелка между ними показывает порядок
          замен; на hover виден reason (что случилось со скутером). */}
      {scooterHistory.length > 0 && (
        <div className="rounded-[12px] border border-dashed border-border bg-surface-soft/40 px-3 py-2">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
            <History size={11} /> Ранее в этой аренде
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scooterChain.map((s, i) => (
              <div key={`${s.scooterId}-${i}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      route: "fleet",
                      scooterId: s.scooterId,
                      from: { route: "rentals", rentalId: rental.id },
                    })
                  }
                  title={
                    s.isCurrent
                      ? `${s.scooter} — текущий. Клик → карточка скутера.`
                      : `${s.scooter}${s.reason ? `\nЗамена: ${s.reason}` : "\nПричина замены не указана"}\nКлик → карточка скутера.`
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-[10px] border bg-white px-2 py-1 text-[12px] transition-colors",
                    s.isCurrent
                      ? "border-blue-500 ring-1 ring-blue-200"
                      : "border-border hover:border-blue-400 hover:bg-blue-50",
                  )}
                >
                  <SwapHistoryAvatar scooterId={s.scooterId} />
                  <div className="flex flex-col items-start">
                    <span className="font-semibold leading-tight text-ink">
                      {s.scooter}
                    </span>
                    {s.isCurrent ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                        текущий
                      </span>
                    ) : s.reason ? (
                      <span className="max-w-[180px] truncate text-[10px] text-muted-2">
                        {s.reason}
                      </span>
                    ) : (
                      <span className="text-[10px] italic text-muted-2/70">
                        причина не указана
                      </span>
                    )}
                  </div>
                </button>
                {i < scooterChain.length - 1 && (
                  <ArrowRight size={14} className="shrink-0 text-muted-2" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* ============ ПРАВАЯ КОЛОНКА: ГРАФИК АРЕНДЫ ============ */}
      <div className="flex flex-col gap-3 rounded-[14px] border border-border p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          График аренды
        </div>

        <div className="relative pl-6">
          <span className="absolute left-[6px] top-2 bottom-2 w-px bg-border" />
          {/* Выдача — дата ПЕРВОЙ выдачи (root цепочки), а не текущего
              отрезка продления. Если аренда продлевалась — это самое
              раннее число, когда клиент впервые получил скутер. */}
          <div className="relative">
            <span className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full bg-blue-600 ring-4 ring-blue-600/15" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Выдача
            </div>
            <div className="mt-0.5 font-display text-[15px] font-extrabold tabular-nums text-ink">
              {rootRental.start} · {rootRental.startTime ?? "12:00"}
            </div>
            <div className="text-[12px] text-muted">{location}</div>
            {isExtended && (
              <div className="text-[10px] text-muted-2">
                первая выдача в серии из {chainRentals.length} аренд
              </div>
            )}
          </div>
          {/* Возврат план — endPlanned ТЕКУЩЕЙ (последней в цепочке)
              аренды. Если есть продления — это «до какого числа сейчас
              продлено». */}
          <div className="relative mt-4">
            <span
              className={cn(
                "absolute -left-[22px] top-1.5 h-3 w-3 rounded-full ring-4",
                rental.status === "overdue"
                  ? "bg-red-ink ring-red-ink/15"
                  : "bg-muted-2 ring-muted-2/15",
              )}
            />
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
              Возврат (план)
            </div>
            <div className="mt-0.5 font-display text-[15px] font-extrabold tabular-nums text-ink">
              {rental.endPlanned} · {time}
            </div>
            <div className="text-[12px] text-muted">{location}</div>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-[12px]">
          <span className="text-muted-2">
            {isExtended ? "Всего по сделке" : "Срок этой аренды"}
          </span>
          <span className="font-display text-[15px] font-extrabold tabular-nums text-blue-600">
            {totalDays} {daysWord(totalDays)}
          </span>
        </div>
        {isExtended && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-2">Текущий период (продление)</span>
            <span className="font-semibold tabular-nums text-ink-2">
              {rental.days} {daysWord(rental.days)}
            </span>
          </div>
        )}

        {client && (
          <div className="flex items-center gap-3 rounded-[12px] bg-surface-soft px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
              {initials(client.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">
                {client.name}
              </div>
              <div className="truncate text-[11px] tabular-nums text-muted-2">
                {client.phone}
              </div>
            </div>
            <button
              type="button"
              onClick={onClientClick}
              title="Быстрый просмотр клиента"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-2 hover:bg-blue-50 hover:text-blue-600"
            >
              <ExternalLink size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div className="mt-1 flex items-start gap-2">
        <Icon size={14} className="mt-[3px] shrink-0 text-muted-2" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">{value}</div>
          {hint && (
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-2">
              {hint}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function daysWord(n: number): string {
  return pluralRu(n, ["день", "дня", "дней"]);
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n);
  const n10 = a % 10;
  const n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

/* =================== Платежи =================== */

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  rent: "Аренда",
  deposit: "Залог",
  fine: "Штраф",
  damage: "Ущерб",
  refund: "Возврат залога",
};

const PAYMENT_TYPE_TONE: Record<string, string> = {
  rent: "bg-blue-50 text-blue-700",
  deposit: "bg-surface-soft text-ink",
  fine: "bg-orange-soft text-orange-ink",
  damage: "bg-red-soft text-red-ink",
  refund: "bg-green-soft text-green-ink",
};

export function PaymentsTab({
  rental,
  onAddPayment,
}: {
  rental: Rental;
  onAddPayment?: () => void;
}) {
  const payments = useRentalPayments(rental.id);
  const paid = payments.filter((p) => p.paid).reduce((s, p) => s + (p.type === "refund" ? -p.amount : p.amount), 0);
  const unpaid = payments.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  // свежие сверху — сортируем по id убывания (id у нас растёт со временем)
  const sortedPayments = useMemo(
    () => [...payments].sort((a, b) => b.id - a.id),
    [payments],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniStat label="Получено" value={`${fmt(paid)} ₽`} tone="green" />
          <MiniStat
            label="Ожидается"
            value={`${fmt(unpaid)} ₽`}
            tone={unpaid > 0 ? "red" : "neutral"}
          />
          <MiniStat
            label="Баланс"
            value={`${fmt(paid - unpaid)} ₽`}
            tone={paid - unpaid >= 0 ? "green" : "red"}
          />
        </div>
        {onAddPayment && (
          <button
            type="button"
            onClick={onAddPayment}
            className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-600"
          >
            <Plus size={13} /> Принять платёж
          </button>
        )}
      </div>

      {payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-border bg-surface-soft py-8 text-center">
          <div className="text-[13px] font-semibold text-ink">
            По аренде ещё не было платежей
          </div>
          <div className="max-w-[360px] text-[11px] text-muted-2">
            Платёж создастся автоматически когда вы <b>подтвердите оплату</b>{" "}
            в шапке аренды, либо можно <b>добавить вручную</b> кнопкой выше.
          </div>
          {onAddPayment && (
            <button
              type="button"
              onClick={onAddPayment}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-[12px] font-bold text-white hover:bg-blue-600"
            >
              <Plus size={12} /> Добавить платёж
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-soft text-left text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              <tr>
                <th className="px-3 py-2">Дата</th>
                <th className="px-3 py-2">Тип</th>
                <th className="px-3 py-2 text-right">Сумма</th>
                <th className="px-3 py-2">Способ</th>
                <th className="px-3 py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {sortedPayments.map((p) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="px-3 py-2 tabular-nums text-muted">{p.date}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        PAYMENT_TYPE_TONE[p.type],
                      )}
                    >
                      {PAYMENT_TYPE_LABEL[p.type]}
                    </span>
                    {p.note && (
                      <div className="mt-0.5 text-[11px] text-muted-2">
                        {p.note}
                      </div>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right font-semibold tabular-nums",
                      p.type === "refund" ? "text-green-ink" : "text-ink",
                    )}
                  >
                    {p.type === "refund" ? "−" : ""}
                    {fmt(p.amount)} ₽
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {PAYMENT_LABEL[p.method]}
                  </td>
                  <td className="px-3 py-2">
                    {p.paid ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-ink">
                        <CheckCircle2 size={12} /> оплачено
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => markPaymentPaid(p.id, true)}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                      >
                        <Check size={11} /> Зафиксировать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] text-muted-2">
        Приоритет списания: штрафы → ущерб → неустойка → аренда → выкуп
      </div>
    </div>
  );
}

/* =================== Возврат =================== */

export function ReturnTab({ rental }: { rental: Rental }) {
  const inspection = useInspection(rental.id);
  const isActive = rental.status === "active" || rental.status === "overdue";
  const isReturning = rental.status === "returning";
  const done =
    rental.status === "completed" || rental.status === "completed_damage";

  if (isActive) {
    return (
      <div className="flex flex-col gap-3">
        <Section title="Осмотр при выдаче">
          <div className="rounded-[14px] border border-border px-3 py-3 text-[12px] text-muted">
            <Row label="Видео состояния" value="—" hint="ожидается привязка к облаку" />
            <Row label="Фото документов" value="в Telegram-канале" />
            <Row label="Выдано" value={rental.start} />
          </div>
        </Section>
        <Empty
          text="Возврат ещё не начат"
          hint="Нажмите «Завершить аренду» в шапке карточки"
        />
      </div>
    );
  }

  if (isReturning) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-[14px] bg-orange-soft/70 p-3 text-[13px] text-orange-ink">
          <Clock size={14} />
          <div className="min-w-0 flex-1">
            <b>Идёт возврат.</b> Проверьте состояние, экипировку, перепробег.
          </div>
        </div>
        <ChecklistPreview />
      </div>
    );
  }

  if (done && inspection) {
    return (
      <div className="flex flex-col gap-3">
        <Section title="Возврат">
          <div className="rounded-[14px] border border-border p-3 text-[12px] text-ink-2">
            <Row label="Фактическая дата" value={inspection.dateActual} />
            <Row
              label="Состояние"
              value={inspection.conditionOk ? "ОК" : "есть повреждения"}
            />
            <Row
              label="Экипировка"
              value={inspection.equipmentOk ? "в порядке" : "неполная"}
            />
            <Row
              label="Залог"
              value={inspection.depositReturned ? "возвращён" : "удержан"}
            />
            {inspection.damageNotes && (
              <Row label="Заметки" value={inspection.damageNotes} />
            )}
          </div>
        </Section>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <Section title="Возврат">
          <div className="rounded-[14px] border border-border p-3 text-[12px] text-ink-2">
            <Row
              label="Фактическая дата"
              value={rental.endActual ?? rental.endPlanned}
            />
            <Row
              label="Состояние"
              value={rental.status === "completed" ? "ОК" : "есть повреждения"}
            />
            <Row
              label="Залог"
              value={rental.depositReturned ? "возвращён" : "удержан"}
            />
          </div>
        </Section>
      </div>
    );
  }

  return <Empty text="Возврат неприменим к этому статусу" />;
}

function ChecklistPreview() {
  const items = [
    "Сравнить внешнее состояние с видео при выдаче",
    "Завести двигатель, проверить звук",
    "Проверить пробег / остаток до замены масла",
    "Проверить экипировку (соответствие выданной)",
    "Зафиксировать возврат залога или удержание",
  ];
  return (
    <div className="rounded-[14px] border border-border p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
        Чек-лист возврата
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it}
            className="flex items-start gap-2 text-[12px] text-ink-2"
          >
            <Check size={14} className="mt-0.5 shrink-0 text-muted-2" />
            {it}
          </li>
        ))}
      </ul>
      <div className="mt-3 text-[11px] text-muted-2">
        Закройте сделку кнопкой «Завершить аренду» в шапке — там в одном
        окне отметите чек-лист и галкой «есть ущерб», если что-то нашли.
      </div>
    </div>
  );
}

/* =================== Инциденты =================== */

export function IncidentsTab({ rental }: { rental: Rental }) {
  const incidents = useRentalIncidents(rental.id);
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          {incidents.length > 0 ? `${incidents.length} записей` : "нет инцидентов"}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={12} /> Создать инцидент
        </button>
      </div>
      {incidents.length === 0 ? (
        <Empty text="По этой аренде инцидентов нет" />
      ) : (
        <>
          {incidents.map((inc) => (
            <IncidentRow key={inc.id} inc={inc} />
          ))}
        </>
      )}
      {addOpen && (
        <InlineIncidentForm
          rentalId={rental.id}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

function IncidentRow({
  inc,
}: {
  inc: ReturnType<typeof useRentalIncidents>[number];
}) {
  const left = inc.damage - inc.paid;
  return (
    <div className="rounded-[14px] border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-ink" />
            <span className="text-[13px] font-semibold text-ink">
              {inc.type}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                left > 0
                  ? "bg-red-soft text-red-ink"
                  : "bg-green-soft text-green-ink",
              )}
            >
              {left > 0 ? "не погашен" : "закрыт"}
            </span>
          </div>
          {inc.note && (
            <div className="mt-1 text-[12px] text-muted">{inc.note}</div>
          )}
        </div>
        <div className="shrink-0 text-right text-[11px] text-muted-2">
          {inc.date}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
        <Metric label="Ущерб" value={`${fmt(inc.damage)} ₽`} />
        <Metric label="Оплачено" value={`${fmt(inc.paid)} ₽`} tone="green" />
        <Metric
          label="Остаток"
          value={`${fmt(left)} ₽`}
          tone={left > 0 ? "red" : "gray"}
        />
      </div>
    </div>
  );
}

function InlineIncidentForm({
  rentalId,
  onClose,
}: {
  rentalId: number;
  onClose: () => void;
}) {
  const [type, setType] = useState("ДТП");
  const [amount, setAmount] = useState("3000");
  const [note, setNote] = useState("");

  return (
    <div className="rounded-[14px] border border-blue-600/30 bg-blue-50/40 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
        Новый инцидент
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-ink">
          Тип
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-1 h-8 w-full rounded-[8px] border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-blue-600"
          >
            <option>ДТП</option>
            <option>Повреждение скутера</option>
            <option>Эвакуация на штрафстоянку</option>
            <option>Кража / пропажа</option>
            <option>Жалоба</option>
            <option>Другое</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-ink">
          Ущерб, ₽
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 h-8 w-full rounded-[8px] border border-border bg-surface px-2 text-[12px] text-ink outline-none focus:border-blue-600"
          />
        </label>
      </div>
      <label className="mt-2 block text-[11px] font-semibold text-ink">
        Описание
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Кратко опишите что произошло"
          className="mt-1 w-full resize-y rounded-[8px] border border-border bg-surface px-2 py-1.5 text-[12px] text-ink outline-none focus:border-blue-600"
        />
      </label>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold text-muted hover:bg-border"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={() => {
            const d = new Date();
            const todayStr = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
            addRentalIncident(rentalId, {
              type,
              date: todayStr,
              damage: Number(amount) || 0,
              note,
            });
            onClose();
          }}
          className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          Создать
        </button>
      </div>
    </div>
  );
}

/* =================== Задачи =================== */

/** Определение просрочки задачи — сравнение со «сегодня» */
function isTaskOverdue(due: string, done: boolean): boolean {
  if (done) return false;
  const m = due.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return false;
  const due0 = new Date(+m[3], +m[2] - 1, +m[1], 23, 59);
  return due0.getTime() < Date.now();
}

export function TasksTab({ rental }: { rental: Rental }) {
  const tasks = useRentalTasks(rental.id);
  if (tasks.length === 0) {
    return <Empty text="К аренде не привязано задач" hint="Задачи создаются автоматически для просрочек и возвратов" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((t) => {
        const overdue = isTaskOverdue(t.due, t.done);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggleTask(t.id)}
            className={cn(
              "flex items-start gap-3 rounded-[12px] border p-3 text-left transition-colors",
              t.done
                ? "border-border opacity-60"
                : overdue
                  ? "border-red-soft bg-red-soft/20 hover:bg-red-soft/40"
                  : "border-border hover:bg-surface-soft",
            )}
          >
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
                t.done
                  ? "border-green-ink bg-green-ink text-white"
                  : "border-border-strong",
              )}
            >
              {t.done && <Check size={12} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[13px] font-semibold text-ink",
                    t.done && "line-through",
                  )}
                >
                  {t.title}
                </span>
                {overdue && (
                  <span className="rounded-full bg-red-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-ink">
                    просрочена
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-2">
                <span className="inline-flex items-center gap-1">
                  <Calendar size={11} /> {t.due}
                </span>
                <span>·</span>
                <span>назначена: администратор</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* =================== Документы =================== */

type DocType = "contract_full" | "act_return";

const DOC_META: Record<
  DocType,
  { title: string; subtitle: string; icon: typeof FileSignature; badge: string }
> = {
  contract_full: {
    title: "Договор проката + Акт приёма-передачи",
    subtitle:
      "Один файл, две страницы. Договор + акт выдачи скутера — печатается одной кнопкой.",
    icon: FileSignature,
    badge: "Основной",
  },
  act_return: {
    title: "Акт возврата",
    subtitle:
      "Подписывается при возврате скутера. Фиксирует пробег, состояние, ущерб.",
    icon: FileText,
    badge: "При возврате",
  },
};

export function DocumentsTab({ rental }: { rental: Rental }) {
  // Прейскурант теперь живёт в глобальном разделе «Документы» в боковом
  // сайдбаре (он же общий справочник, не привязан к конкретной аренде).
  // Здесь оставляем только документы для печати по этой аренде.
  return <PrintDocumentsView rental={rental} />;
}

function PrintDocumentsView({ rental }: { rental: Rental }) {
  const API_BASE =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  const [preview, setPreview] = useState<DocType | null>(null);

  const previewUrl = (type: DocType) =>
    `${API_BASE}/api/rentals/${rental.id}/document/${type}?format=html`;
  const downloadUrl = (type: DocType) =>
    `${API_BASE}/api/rentals/${rental.id}/document/${type}?format=docx`;

  const openPreview = (type: DocType) => {
    setPreview(type);
  };

  const downloadWord = async (type: DocType) => {
    try {
      toast.info("Генерируем Word…", "Займёт секунду");
      const res = await fetch(downloadUrl(type), { credentials: "include" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${DOC_META[type].title} ${String(rental.id).padStart(4, "0")}.doc`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(
        "Word-файл скачан",
        "Можно открыть в Word и подкорректировать.",
      );
    } catch (e) {
      toast.error(
        "Не удалось сформировать документ",
        (e as Error).message ?? "",
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] text-blue-900">
        Поля документа подставляются автоматически из карточки клиента и
        скутера. <b>Предпросмотр</b> открывается прямо здесь — сверху кнопки
        «Печать» и «Скачать Word». PDF получается из диалога печати
        («Сохранить как PDF»).
      </div>

      <div className="grid items-stretch gap-2 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(DOC_META) as DocType[]).map((t) => {
          const meta = DOC_META[t];
          const Icon = meta.icon;
          return (
            <div
              key={t}
              className="flex h-full flex-col gap-3 rounded-[14px] border border-border bg-surface p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700">
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[13px] font-semibold leading-tight text-ink">
                      {meta.title}
                    </div>
                    <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                      {meta.badge}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 text-[11px] leading-snug text-muted-2">
                {meta.subtitle}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => openPreview(t)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-ink py-1.5 text-[12px] font-bold text-white hover:bg-blue-600"
                >
                  <FileText size={12} /> Открыть документ
                </button>
                <button
                  type="button"
                  onClick={() => downloadWord(t)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-surface-soft py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Download size={12} /> Скачать Word
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <DamageReportCard rental={rental} />

      <div className="text-[11px] text-muted-2">
        Подписанные и отсканированные документы можно прикрепить к аренде
        через «Документы» (скоро появится кнопка загрузки).
      </div>

      {preview && (
        <DocumentPreviewModal
          title={DOC_META[preview].title}
          htmlUrl={previewUrl(preview)}
          docxUrl={downloadUrl(preview)}
          docxFilename={`${DOC_META[preview].title} ${String(rental.id).padStart(4, "0")}.doc`}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/** Карточка «Акт о повреждениях» — показывает кнопки если по аренде есть акты. */
function DamageReportCard({ rental }: { rental: Rental }) {
  const reports = useDamageReports(rental.id).data ?? [];
  const [previewId, setPreviewId] = useState<number | null>(null);
  const API_BASE =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

  if (reports.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-border bg-surface-soft/40 p-3 text-[12px] text-muted-2">
        <b>Акт о повреждениях</b> — будет доступен здесь после фиксации ущерба
        по аренде. Зафиксировать ущерб можно через меню «Действия → Зафиксировать
        ущерб».
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-border bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle size={14} className="text-amber-600" />
        <div className="text-[13px] font-semibold text-ink">
          Акты о повреждениях ({reports.length})
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {reports.map((r) => {
          const downloadUrl = `${API_BASE}/api/damage-reports/${r.id}/document?format=docx`;
          return (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface-soft px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink">
                  Акт #{r.id} от{" "}
                  {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                </div>
                <div className="text-[11px] text-muted-2">
                  Сумма {r.total.toLocaleString("ru-RU")} ₽ · долг{" "}
                  <span className={r.debt > 0 ? "text-red-600" : "text-green-600"}>
                    {r.debt.toLocaleString("ru-RU")} ₽
                  </span>{" "}
                  · {r.items.length} поз.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewId(r.id)}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-ink px-3 py-1 text-[12px] font-bold text-white hover:bg-blue-600"
              >
                <FileText size={12} /> Открыть
              </button>
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-1.5 rounded-[8px] bg-white px-3 py-1 text-[12px] font-semibold text-ink-2 hover:bg-blue-50 hover:text-blue-700"
              >
                <Download size={12} /> Word
              </a>
            </div>
          );
        })}
      </div>
      {previewId != null && (
        <DocumentPreviewModal
          title={`Акт о повреждениях #${previewId}`}
          htmlUrl={`${API_BASE}/api/damage-reports/${previewId}/document?format=html`}
          docxUrl={`${API_BASE}/api/damage-reports/${previewId}/document?format=docx`}
          docxFilename={`Акт о повреждениях ${String(previewId).padStart(4, "0")}.doc`}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}

/* =================== Helpers =================== */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0">
      <span className="text-muted-2">{label}</span>
      <span className="text-right font-semibold text-ink">
        {value}
        {hint && <span className="ml-1 text-[11px] text-muted-2">({hint})</span>}
      </span>
    </div>
  );
}

function Empty({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-border text-center">
      <FileText size={18} className="text-muted-2" />
      <div className="text-[13px] font-semibold text-ink-2">{text}</div>
      {hint && <div className="max-w-[320px] text-[11px] text-muted">{hint}</div>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "red" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] px-3 py-2",
        tone === "green"
          ? "bg-green-soft/60"
          : tone === "red"
            ? "bg-red-soft/60"
            : "bg-surface-soft",
      )}
    >
      <div className="text-[11px] text-muted-2">{label}</div>
      <div className="font-display text-[16px] font-extrabold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "gray";
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-2">{label}</div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          tone === "green"
            ? "text-green-ink"
            : tone === "red"
              ? "text-red-ink"
              : tone === "gray"
                ? "text-muted-2"
                : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ignore unused deps marker */
void useMemo;
void Plus;
void X;

/**
 * Парсит note замены скутера. Возвращает причину или null.
 * Формат note задаётся в API (rentals.ts swap-scooter):
 *   "замена скутера: <reason>" или "замена скутера #NNNN".
 */
function parseSwapReason(note: string | null): string | null {
  if (!note) return null;
  const m = /^замена скутера:\s*(.+)$/i.exec(note.trim());
  return m ? m[1]!.trim() : null;
}

/**
 * Маленькая круглая аватарка скутера для блока «Ранее в этой аренде».
 * Использует ту же модель и тот же fileUrl что и большой ScooterThumb.
 */
function SwapHistoryAvatar({ scooterId }: { scooterId: number }) {
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const sc = scooters.find((s) => s.id === scooterId);
  if (!sc) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-muted-2">
        <Bike size={12} />
      </div>
    );
  }
  const model = sc.modelId
    ? models.find((m) => m.id === sc.modelId)
    : models.find((m) =>
        m.name.toLowerCase().includes(sc.model.toLowerCase()),
      );
  const avatarSrc = fileUrl(model?.avatarKey);
  if (avatarSrc) {
    return (
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-surface-soft">
        <img
          src={avatarSrc}
          alt={model?.name ?? sc.name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-white">
      <Bike size={12} strokeWidth={1.5} />
    </div>
  );
}

/**
 * Превью скутера в блоке «СКУТЕР» на вкладке «Условия».
 * Если у модели есть аватарка — показываем её. Иначе — иконку Bike.
 */
function ScooterThumb({ rental }: { rental: Rental }) {
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const sc = rental.scooterId != null
    ? scooters.find((s) => s.id === rental.scooterId)
    : null;
  const model = sc?.modelId != null
    ? models.find((m) => m.id === sc.modelId)
    : models.find((m) => m.name.toLowerCase().includes(rental.model));
  const avatarSrc = fileUrl(model?.avatarKey);

  if (avatarSrc) {
    return (
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-surface-soft">
        <img
          src={avatarSrc}
          alt={model?.name ?? ""}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-ink text-white">
      <Bike size={34} strokeWidth={1.5} />
    </div>
  );
}

/* =================== История аренды =================== */

/**
 * Показывает всю цепочку этой аренды: исходную + все продления
 * (parentRentalId → child). Для каждой записи — даты, тариф, сумма,
 * экипировка. Текущая аренда подсвечена.
 *
 * Полезно операторам которые продлевали аренду несколько раз и хотят
 * увидеть всю историю клиента в одном месте.
 */
export function HistoryTab({
  rental,
  chainRentals,
}: {
  rental: Rental;
  chainRentals: Rental[];
}) {
  // Сортируем по дате выдачи (старые сверху → новые снизу)
  const ordered = useMemo(
    () =>
      [...chainRentals].sort((a, b) =>
        a.start.split(".").reverse().join("").localeCompare(
          b.start.split(".").reverse().join(""),
        ),
      ),
    [chainRentals],
  );

  if (ordered.length === 0) {
    return (
      <div className="rounded-2xl bg-surface p-6 text-center text-[13px] text-muted shadow-card-sm">
        <History size={24} className="mx-auto mb-2 text-muted-2" />
        Нет данных по истории.
      </div>
    );
  }

  if (ordered.length === 1) {
    return (
      <div className="rounded-2xl bg-surface p-6 text-center text-[13px] text-muted shadow-card-sm">
        <History size={24} className="mx-auto mb-2 text-muted-2" />
        Это первичная аренда. Продлений ещё не было — здесь появится
        список, как только клиент решит продлить.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12px] text-muted-2 px-1">
        Цепочка из {ordered.length}{" "}
        {pluralRu(ordered.length, ["аренды", "аренд", "аренд"])} — суммарно{" "}
        <b className="text-ink">
          {ordered.reduce((s, r) => s + (r.days ?? 0), 0)}{" "}
          {pluralRu(
            ordered.reduce((s, r) => s + (r.days ?? 0), 0),
            ["день", "дня", "дней"],
          )}
        </b>
        ,{" "}
        <b className="text-ink">
          {ordered
            .reduce((s, r) => s + (r.sum ?? 0), 0)
            .toLocaleString("ru-RU")}{" "}
          ₽
        </b>{" "}
        за всё время
      </div>

      {ordered.map((r, idx) => {
        const isCurrent = r.id === rental.id;
        const isFirst = idx === 0;
        const isSwap =
          !isFirst && /замена скутера/i.test(r.note ?? "");
        const equipmentList =
          (r.equipment?.length ?? 0) > 0 ? r.equipment.join(", ") : null;
        return (
          <div
            key={r.id}
            className={cn(
              "rounded-2xl bg-surface p-4 shadow-card-sm",
              isCurrent && "ring-2 ring-blue-600/50",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 text-[12px] font-bold">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-ink">
                    Аренда #{String(r.id).padStart(4, "0")}
                  </span>
                  {isFirst && (
                    <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                      первичная
                    </span>
                  )}
                  {!isFirst && !isSwap && (
                    <span className="rounded-full bg-purple-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-ink">
                      продление
                    </span>
                  )}
                  {isSwap && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      замена
                    </span>
                  )}
                  {isCurrent && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      сейчас открыта
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                  <Calendar size={11} />
                  {r.start} <ArrowRight size={10} /> {r.endPlanned}
                  <span className="text-muted-2">·</span>
                  <span className="font-semibold text-ink">
                    {r.days} {pluralRu(r.days, ["день", "дня", "дней"])}
                  </span>
                  <span className="text-muted-2">·</span>
                  <span>
                    {r.rate} ₽/сут × {r.days} ={" "}
                    <b className="text-ink">
                      {(r.sum ?? 0).toLocaleString("ru-RU")} ₽
                    </b>
                  </span>
                </div>
                {equipmentList && (
                  <div className="mt-1 text-[11px] text-muted">
                    Экипировка: {equipmentList}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
