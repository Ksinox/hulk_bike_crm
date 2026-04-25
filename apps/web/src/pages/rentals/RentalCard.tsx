import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Gavel,
  PhoneOff,
  Plus,
  Repeat,
  ShieldAlert,
  Star,
  Wrench,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_AMOUNT,
  STATUS_LABEL,
  STATUS_TONE,
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { ratingTier } from "@/lib/mock/clients";
import { useClientUnreachable } from "@/pages/clients/clientStore";
import { useApiClients } from "@/lib/api/clients";
import {
  DocumentsTab,
  IncidentsTab,
  PaymentsTab,
  ReturnTab,
  TasksTab,
  TermsTab,
} from "./RentalCardTabs";
import { RentalActionDialog, type ActionKind } from "./RentalActionDialog";
import { ConfirmPaymentDialog } from "./ConfirmPaymentDialog";
import { ExtendRentalDialog } from "./ExtendRentalDialog";
import { RentalActionsMenu, type MenuAction } from "./RentalActionsMenu";
import {
  getRentalChainIds,
  useChainPayments,
  useRental,
  useRentals,
} from "./rentalsStore";
import { ClientQuickView } from "@/pages/clients/ClientQuickView";
import { RentalEditModal } from "./RentalEditModal";
import { Pencil, Trash2 } from "lucide-react";
import { useDeleteRental } from "@/lib/api/rentals";
import { useMe } from "@/lib/api/auth";
import { confirmDialog } from "@/lib/toast";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";

type TabId = "terms" | "payments" | "return" | "incidents" | "tasks" | "docs";

const TABS: { id: TabId; label: string }[] = [
  { id: "terms", label: "Условия" },
  { id: "payments", label: "Платежи" },
  { id: "return", label: "Возврат" },
  { id: "incidents", label: "Инциденты" },
  { id: "tasks", label: "Задачи" },
  { id: "docs", label: "Документы" },
];

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function daysBetween(a: Date, b: Date): number {
  // разница в календарных днях: нормализуем оба к началу дня
  const aD = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bD = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bD - aD) / 86400000);
}

/** Текущая дата/время — пересоздаётся при каждом рендере компонента */
function now(): Date {
  return new Date();
}

function statusActions(
  status: RentalStatus,
  opts: { hasDamage: boolean; isUnreachable: boolean },
): MenuAction[] {
  const extras: MenuAction[] = [
    {
      id: "set-damage",
      label: opts.hasDamage ? "Изменить ущерб" : "Зафиксировать ущерб",
      icon: Wrench,
      tone: "warn",
    },
    {
      id: opts.isUnreachable ? "unmark-unreachable" : "mark-unreachable",
      label: opts.isUnreachable
        ? "Снять «не выходит на связь»"
        : "Не выходит на связь",
      icon: PhoneOff,
      tone: opts.isUnreachable ? "ghost" : "warn",
    },
  ];
  const withExtras = (base: MenuAction[]): MenuAction[] => [...base, ...extras];

  switch (status) {
    case "new_request":
      return [
        { id: "schedule", label: "Назначить встречу", icon: Calendar, tone: "primary" },
        { id: "cancel", label: "Отменить", icon: XCircle, tone: "ghost" },
      ];
    case "meeting":
      return [
        { id: "activate", label: "Выдать скутер", icon: CheckCircle2, tone: "primary" },
        { id: "cancel", label: "Отменить", icon: XCircle, tone: "ghost" },
      ];
    case "active":
      return withExtras([
        { id: "extend", label: "Продлить", icon: Repeat, tone: "primary" },
        { id: "receive", label: "Принять возврат", icon: ArrowRight, tone: "ghost" },
        { id: "addPayment", label: "Принять платёж", icon: Plus, tone: "ghost" },
        { id: "incident", label: "Зафиксировать инцидент", icon: AlertTriangle, tone: "warn" },
      ]);
    case "overdue":
      return withExtras([
        { id: "receive", label: "Принять возврат", icon: ArrowRight, tone: "primary" },
        { id: "addPayment", label: "Принять платёж", icon: Plus, tone: "ghost" },
        { id: "incident", label: "Зафиксировать инцидент", icon: AlertTriangle, tone: "warn" },
        { id: "revert-overdue", label: "Снять просрочку", icon: XCircle, tone: "ghost" },
        { id: "police", label: "Подать в полицию", icon: ShieldAlert, tone: "danger" },
      ]);
    case "returning":
      return withExtras([
        { id: "complete", label: "Завершить без ущерба", icon: CheckCircle2, tone: "primary" },
        { id: "complete-damage", label: "Завершить с ущербом", icon: AlertTriangle, tone: "warn" },
      ]);
    case "completed":
      return [
        { id: "clone", label: "Создать аналогичную", icon: Repeat, tone: "primary" },
      ];
    case "completed_damage":
      return withExtras([
        { id: "record-damage", label: "Записать оплату ущерба", icon: CheckCircle2, tone: "primary" },
        { id: "claim", label: "Претензия", icon: AlertTriangle, tone: "warn" },
        { id: "lawyer", label: "Передать юристу", icon: Gavel, tone: "danger" },
      ]);
    case "police":
      return withExtras([
        { id: "lawyer", label: "Передать юристу", icon: Gavel, tone: "danger" },
      ]);
    default:
      return [];
  }
}

function statusChipClass(tone: string): string {
  return tone === "green"
    ? "bg-green-soft text-green-ink"
    : tone === "red"
      ? "bg-red-soft text-red-ink"
      : tone === "orange"
        ? "bg-orange-soft text-orange-ink"
        : tone === "blue"
          ? "bg-blue-50 text-blue-700"
          : tone === "purple"
            ? "bg-purple-soft text-purple-ink"
            : "bg-surface-soft text-muted";
}

export function RentalCard({ rental }: { rental: Rental }) {
  const [tab, setTab] = useState<TabId>("terms");
  const [action, setAction] = useState<ActionKind | null>(null);
  const [editRentalOpen, setEditRentalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [confirmForNewId, setConfirmForNewId] = useState<number | null>(null);
  const [clientQuickView, setClientQuickView] = useState(false);
  const newRental = useRental(confirmForNewId);
  const { data: me } = useMe();
  const deleteRental = useDeleteRental();

  const { data: apiClients } = useApiClients();
  const client = useMemo(
    () => apiClients?.find((c) => c.id === rental.clientId),
    [rental.clientId, apiClients],
  );
  const allRentals = useRentals();
  const chainIds = useMemo(
    () => getRentalChainIds(rental.id, allRentals),
    [rental.id, allRentals],
  );
  const chainPayments = useChainPayments(chainIds);
  const tier = client ? ratingTier(client.rating) : null;

  // Суммарные ожидаемые (аренда+залог) по всей цепочке продлений.
  // Залог один на серию — берём только один раз.
  const chainRentals = useMemo(
    () => allRentals.filter((r) => chainIds.includes(r.id)),
    [allRentals, chainIds],
  );
  const chainRentSum = chainRentals.reduce((s, r) => s + (r.sum || 0), 0);
  // Выручка по цепочке — только аренды без залога. Залог — возвратный,
  // он не наш доход (кроме случая, когда списан на покрытие ущерба —
  // тогда создаётся отдельный платёж типа 'damage').
  const chainExpected = chainRentSum;
  /** Сумма дней по всей цепочке продлений (текущая + родители + потомки) */
  const chainDaysTotal = chainRentals.reduce((s, r) => s + (r.days || 0), 0);
  const isExtended = chainRentals.length > 1;

  const startDate = parseDate(rental.start);
  const endDate = parseDate(rental.endPlanned);
  const daysLeft =
    startDate && endDate ? daysBetween(now(), endDate) : null;

  const tone = STATUS_TONE[rental.status];
  const isUnreachable = useClientUnreachable(rental.clientId);
  const hasDamage = (rental.damageAmount ?? 0) > 0;
  // К любому статусу добавляем «Изменить аренду» — доступно всем ролям, пишется в activity log
  const baseActions = statusActions(rental.status, { hasDamage, isUnreachable });
  // Удалять может только директор/создатель и только «безвредные» аренды.
  // Сервер всё равно проверит — UI просто не показывает кнопку, когда
  // удаление заведомо запрещено.
  const canDelete =
    (me?.role === "director" || me?.role === "creator") &&
    (!rental.scooter ||
      rental.status === "new_request" ||
      rental.status === "cancelled");
  const actions: MenuAction[] = [
    { id: "edit", label: "Изменить аренду", icon: Pencil, tone: "ghost" },
    ...baseActions,
    ...(canDelete
      ? [
          {
            id: "delete",
            label: "Удалить аренду",
            icon: Trash2,
            tone: "danger" as const,
          },
        ]
      : []),
  ];

  // Финансы — считаются по ВСЕЙ цепочке продлений.
  // В «Получено от клиента» (paidIn) НЕ включаем депозит — он возвратный
  // и не является заработком. Если депозит был списан в ущерб, отдельный
  // платёж типа 'damage' создаётся в модалке возврата — он сюда попадёт.
  const paidIn = chainPayments
    .filter((p) => p.paid && p.type !== "refund" && p.type !== "deposit")
    .reduce((s, p) => s + p.amount, 0);
  const pending = chainPayments
    .filter((p) => !p.paid && p.type !== "deposit")
    .reduce((s, p) => s + p.amount, 0);
  const expectedTotal = chainExpected;

  const handleAction = async (id: string) => {
    if (id === "extend" || id === "clone") return setExtendOpen(true);
    if (id === "edit") return setEditRentalOpen(true);
    if (id === "delete") {
      const ok = await confirmDialog({
        title: "Удалить аренду?",
        message: `Аренда #${String(rental.id).padStart(4, "0")} будет удалена без возможности восстановления. Связанные неоплаченные платежи и записи возврата тоже удалятся.`,
        confirmText: "Удалить",
        cancelText: "Отмена",
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteRental.mutateAsync(rental.id);
        toast.success("Аренда удалена", `#${String(rental.id).padStart(4, "0")}`);
      } catch (e) {
        if (e instanceof ApiError) {
          const body = e.body as { message?: string } | null;
          toast.error("Не удалось удалить", body?.message ?? "Попробуйте ещё раз");
        } else {
          toast.error("Не удалось удалить", (e as Error).message ?? "");
        }
      }
      return;
    }
    setAction(id as ActionKind);
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card-sm">
      {/* =========== HEADER =========== */}
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 font-display text-[22px] font-extrabold leading-tight text-ink">
          <span className="truncate">
            Аренда #{String(rental.id).padStart(4, "0")}
            {client && (
              <>
                {" — "}
                <button
                  type="button"
                  onClick={() => setClientQuickView(true)}
                  title="Быстрый просмотр клиента"
                  className="rounded decoration-2 underline-offset-4 hover:underline"
                >
                  {client.name}
                </button>
              </>
            )}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
              statusChipClass(tone),
            )}
          >
            {STATUS_LABEL[rental.status]}
          </span>
          {isUnreachable && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-soft px-2.5 py-1 text-[11px] font-bold text-orange-ink">
              <PhoneOff size={11} /> Не выходит на связь
            </span>
          )}
          {client && tier && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                tier.tone === "good"
                  ? "bg-green-soft text-green-ink"
                  : tier.tone === "bad"
                    ? "bg-red-soft text-red-ink"
                    : "bg-surface-soft text-ink",
              )}
              title={tier.label}
            >
              <Star size={11} /> {client.rating}
            </span>
          )}
        </h2>

        {/* ACTIONS — одна primary + dropdown */}
        <RentalActionsMenu actions={actions} onAction={handleAction} />
      </header>

      {/* =========== BANNERS =========== */}
      {rental.paymentConfirmed === null && (
        <div className="flex items-center gap-2 rounded-[12px] bg-blue-50 px-3 py-2 text-[12px] text-blue-700 ring-1 ring-inset ring-blue-600/20">
          <AlertTriangle size={14} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <b>Требуется:</b>{" "}
            {rental.contractUploaded
              ? "подтверждение оплаты"
              : "скан договора и подтверждение оплаты"}
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="shrink-0 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
          >
            Подтвердить
          </button>
        </div>
      )}
      {rental.status === "overdue" && endDate && (() => {
        const d = Math.max(1, daysLeft !== null ? Math.abs(daysLeft) : 1);
        const overdueDebt = d * (rental.rate + 250);
        return (
          <div className="flex items-center gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
            <AlertTriangle size={14} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <b>Просрочка {d} дн.</b> Долг {fmt(overdueDebt)} ₽
              (тариф {fmt(rental.rate)} ₽ + 250 ₽/день). Плановый возврат —{" "}
              {rental.endPlanned} {rental.startTime || "12:00"}.
            </div>
          </div>
        );
      })()}
      {rental.status === "police" && (
        <div className="flex items-center gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
          <ShieldAlert size={14} className="shrink-0" />
          <span>
            <b>Заявление в полицию подано.</b>{" "}
            {rental.note ?? "скутер не возвращён"}
          </span>
        </div>
      )}
      {rental.status === "completed_damage" && (
        <div className="flex items-center gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            <b>Завершена с ущербом.</b> Остаток не погашен —{" "}
            {fmt(pending)} ₽.
          </span>
        </div>
      )}
      {rental.status === "returning" && (
        <div className="flex items-center gap-2 rounded-[12px] bg-orange-soft/70 px-3 py-2 text-[12px] text-orange-ink">
          <Calendar size={14} className="shrink-0" />
          <span>
            <b>Идёт возврат.</b> Осмотреть скутер, сверить с видео при выдаче.
          </span>
        </div>
      )}

      {/* =========== KPI STRIP =========== */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-4",
          isExtended && !hasDamage && "lg:grid-cols-5",
          hasDamage && !isExtended && "lg:grid-cols-5",
          hasDamage && isExtended && "lg:grid-cols-6",
        )}
      >
        {(() => {
          let label = "Срок";
          let value = `${rental.days} дн`;
          const hint = `${rental.start.slice(0, 5)} — ${rental.endPlanned.slice(0, 5)}`;
          let accent: KpiAccent = "default";
          if (rental.status === "active" && daysLeft !== null) {
            if (daysLeft > 0) {
              value = `осталось ${daysLeft} дн`;
              accent = daysLeft <= 2 ? "red" : "default";
            } else if (daysLeft === 0) {
              value = `возврат сегодня`;
              accent = "red";
            } else {
              label = "Просрочен";
              value = `${Math.abs(daysLeft)} дн`;
              accent = "red";
            }
          } else if (rental.status === "overdue") {
            label = "Просрочен";
            value =
              daysLeft !== null && daysLeft < 0
                ? `${Math.abs(daysLeft)} дн`
                : "сегодня";
            accent = "red";
          }
          return (
            <KpiCard label={label} value={value} hint={hint} accent={accent} />
          );
        })()}
        <KpiCard
          label="Эта аренда"
          value={`${fmt(rental.sum)} ₽`}
          hint={`+ залог: ${fmt(rental.deposit || DEPOSIT_AMOUNT)} ₽`}
        />
        <KpiCard
          label="За всё время аренды"
          value={`${fmt(paidIn)} ₽`}
          accent={paidIn >= expectedTotal ? "blue" : "default"}
          hint={
            paidIn >= expectedTotal
              ? isExtended
                ? "оплачено с учётом продлений"
                : "полностью оплачено"
              : expectedTotal > 0
                ? `${Math.round((paidIn / Math.max(1, expectedTotal)) * 100)}% от ${fmt(expectedTotal)} ₽ по цепочке`
                : "платежей ещё не было"
          }
          badgeIcon={paidIn >= expectedTotal ? CheckCircle2 : undefined}
        />
        {(() => {
          // Долг:
          //  - при просрочке — (тариф + 250) × дней просрочки
          //  - иначе — сумма неоплаченных платежей
          let debt = pending;
          let debtHint = pending > 0 ? "не оплачено" : "нет долгов";
          if (rental.status === "overdue") {
            const d = Math.max(
              1,
              daysLeft !== null ? Math.abs(daysLeft) : 1,
            );
            debt = d * (rental.rate + 250);
            debtHint = `${d} дн × ${fmt(rental.rate + 250)} ₽`;
          }
          return (
            <KpiCard
              label="Долг"
              value={debt > 0 ? `${fmt(debt)} ₽` : "0 ₽"}
              hint={debtHint}
              accent={debt > 0 ? "red" : "muted"}
            />
          );
        })()}
        {isExtended && (
          <KpiCard
            label="Всего по сделке"
            value={`${fmt(chainDaysTotal)} дн`}
            hint={`${chainRentals.length} ${chainRentals.length === 1 ? "аренда" : chainRentals.length < 5 ? "аренды" : "аренд"} в серии`}
            accent="blue"
          />
        )}
        {hasDamage && (
          <KpiCard
            label="Сумма ущерба"
            value={`${fmt(rental.damageAmount!)} ₽`}
            hint="выставлено вручную"
            accent="red"
          />
        )}
      </div>

      {rental.note && (
        <div className="rounded-[10px] bg-surface-soft px-3 py-1.5 text-[12px] text-ink-2">
          <b>Заметка:</b> {rental.note}
        </div>
      )}

      {/* =========== TABS =========== */}
      <div className="mt-1 flex gap-1 border-b border-border overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px shrink-0 px-3 py-2 text-[13px] font-semibold transition-colors",
              tab === t.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "border-b-2 border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 pt-3">
        {tab === "terms" && (
          <TermsTab
            rental={rental}
            onClientClick={() => setClientQuickView(true)}
          />
        )}
        {tab === "payments" && (
          <PaymentsTab
            rental={rental}
            onAddPayment={() => setAction("addPayment")}
          />
        )}
        {tab === "return" && <ReturnTab rental={rental} />}
        {tab === "incidents" && <IncidentsTab rental={rental} />}
        {tab === "tasks" && <TasksTab rental={rental} />}
        {tab === "docs" && <DocumentsTab rental={rental} />}
      </div>

      {action && (
        <RentalActionDialog
          rental={rental}
          action={action}
          onClose={() => setAction(null)}
        />
      )}
      {editRentalOpen && (
        <RentalEditModal
          rental={rental}
          onClose={() => setEditRentalOpen(false)}
        />
      )}
      {confirmOpen && (
        <ConfirmPaymentDialog
          rental={rental}
          onClose={() => setConfirmOpen(false)}
        />
      )}
      {extendOpen && (
        <ExtendRentalDialog
          rental={rental}
          onClose={() => setExtendOpen(false)}
          onExtended={(r) => setConfirmForNewId(r.id)}
        />
      )}
      {confirmForNewId != null && newRental && (
        <ConfirmPaymentDialog
          rental={newRental}
          onClose={() => setConfirmForNewId(null)}
        />
      )}

      {clientQuickView && client && (
        <ClientQuickView
          clientId={client.id}
          onClose={() => setClientQuickView(false)}
          from={{ route: "rentals", rentalId: rental.id }}
        />
      )}
    </div>
  );
}

type KpiAccent = "default" | "blue" | "red" | "muted";

function KpiCard({
  label,
  value,
  hint,
  hintIcon: HintIcon,
  badgeIcon: BadgeIcon,
  accent = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  hintIcon?: React.ComponentType<{ size?: number | string; className?: string }>;
  badgeIcon?: React.ComponentType<{ size?: number | string; className?: string }>;
  accent?: KpiAccent;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[14px] border px-4 py-3 shadow-card-sm",
        accent === "muted"
          ? "border-border bg-surface-soft/60"
          : accent === "red"
            ? "border-red-soft bg-surface shadow-[0_0_16px_-2px_hsl(var(--red-ink)/0.35),0_0_0_1px_hsl(var(--red-soft))]"
            : "border-border bg-surface",
      )}
    >
      {BadgeIcon && (
        <BadgeIcon
          size={18}
          className={cn(
            "absolute right-3 top-3 shrink-0",
            accent === "blue" ? "text-blue-600" : "text-muted-2",
          )}
        />
      )}
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-[20px] font-extrabold leading-tight tabular-nums",
          accent === "blue"
            ? "text-blue-600"
            : accent === "red"
              ? "text-red-ink"
              : accent === "muted"
                ? "text-muted"
                : "text-ink",
        )}
      >
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            "mt-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider",
            accent === "blue"
              ? "text-blue-600"
              : accent === "red"
                ? "text-red-ink"
                : "text-muted-2",
          )}
        >
          {HintIcon && <HintIcon size={12} className="shrink-0" />}
          {hint}
        </div>
      )}
    </div>
  );
}

