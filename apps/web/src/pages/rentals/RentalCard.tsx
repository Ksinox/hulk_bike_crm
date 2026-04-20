import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  Calendar,
  CheckCircle2,
  Gavel,
  Phone,
  Plus,
  Repeat,
  ShieldAlert,
  Star,
  Tag,
  User,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_AMOUNT,
  hoursOverdue,
  overdueReturnFine,
  STATUS_LABEL,
  STATUS_TONE,
  TARIFF_PERIOD_LABEL,
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { CLIENTS, ratingTier, SOURCE_LABEL } from "@/lib/mock/clients";
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
import { useRental, useRentalPayments } from "./rentalsStore";
import { ClientQuickView } from "@/pages/clients/ClientQuickView";

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
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Сейчас по демо-таймлайну — 13.10.2026 14:30 */
const TODAY = new Date(2026, 9, 13, 14, 30);

function statusActions(status: RentalStatus): MenuAction[] {
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
      return [
        { id: "extend", label: "Продлить", icon: Repeat, tone: "primary" },
        { id: "receive", label: "Принять возврат", icon: ArrowRight, tone: "ghost" },
        { id: "addPayment", label: "Принять платёж", icon: Plus, tone: "ghost" },
        { id: "incident", label: "Зафиксировать инцидент", icon: AlertTriangle, tone: "warn" },
      ];
    case "overdue":
      return [
        { id: "receive", label: "Принять возврат", icon: ArrowRight, tone: "primary" },
        { id: "addPayment", label: "Принять платёж", icon: Plus, tone: "ghost" },
        { id: "incident", label: "Зафиксировать инцидент", icon: AlertTriangle, tone: "warn" },
        { id: "revert-overdue", label: "Снять просрочку", icon: XCircle, tone: "ghost" },
        { id: "police", label: "Подать в полицию", icon: ShieldAlert, tone: "danger" },
      ];
    case "returning":
      return [
        { id: "complete", label: "Завершить без ущерба", icon: CheckCircle2, tone: "primary" },
        { id: "complete-damage", label: "Завершить с ущербом", icon: AlertTriangle, tone: "warn" },
      ];
    case "completed":
      return [
        { id: "clone", label: "Создать аналогичную", icon: Repeat, tone: "primary" },
      ];
    case "completed_damage":
      return [
        { id: "record-damage", label: "Записать оплату ущерба", icon: CheckCircle2, tone: "primary" },
        { id: "claim", label: "Претензия", icon: AlertTriangle, tone: "warn" },
        { id: "lawyer", label: "Передать юристу", icon: Gavel, tone: "danger" },
      ];
    case "police":
      return [
        { id: "lawyer", label: "Передать юристу", icon: Gavel, tone: "danger" },
      ];
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [confirmForNewId, setConfirmForNewId] = useState<number | null>(null);
  const [clientQuickView, setClientQuickView] = useState(false);
  const newRental = useRental(confirmForNewId);

  const client = useMemo(
    () => CLIENTS.find((c) => c.id === rental.clientId),
    [rental.clientId],
  );
  const payments = useRentalPayments(rental.id);
  const tier = client ? ratingTier(client.rating) : null;

  const startDate = parseDate(rental.start);
  const endDate = parseDate(rental.endPlanned);
  const daysLeft =
    startDate && endDate ? daysBetween(TODAY, endDate) : null;

  const tone = STATUS_TONE[rental.status];
  const actions = statusActions(rental.status);

  // Финансы
  const paidIn = payments
    .filter((p) => p.paid && p.type !== "refund")
    .reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  const expectedTotal = rental.sum + rental.deposit;

  const handleAction = (id: string) => {
    if (id === "extend" || id === "clone") return setExtendOpen(true);
    setAction(id as ActionKind);
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card-sm">
      {/* =========== HEADER =========== */}
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex flex-wrap items-center gap-x-1 font-display text-[22px] font-extrabold leading-tight text-ink">
              <button
                type="button"
                title="Карточка скутера (скоро)"
                className="inline-flex items-center gap-1.5 rounded px-0.5 decoration-2 underline-offset-4 hover:underline"
              >
                <Bike size={18} className="text-ink-2" />
                {rental.scooter}
              </button>
              <span className="text-muted-2">—</span>
              {client && (
                <button
                  type="button"
                  onClick={() => setClientQuickView(true)}
                  title="Быстрый просмотр клиента"
                  className="inline-flex items-center gap-1.5 rounded px-0.5 decoration-2 underline-offset-4 hover:underline"
                >
                  <User size={18} className="text-ink-2" />
                  {client.name}
                </button>
              )}
            </h2>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
                statusChipClass(tone),
              )}
            >
              {STATUS_LABEL[rental.status]}
            </span>
          </div>
        </div>

        {/* ACTIONS — одна primary + dropdown */}
        <RentalActionsMenu actions={actions} onAction={handleAction} />
      </header>

      {/* Инфо-строка */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        <span className="font-semibold text-ink-2">
          Аренда #{String(rental.id).padStart(4, "0")}
        </span>
        {rental.rate > 0 && (
          <>
            <Dot />
            <span className="inline-flex items-center gap-1 text-muted-2">
              <Tag size={12} className="text-blue-600" />
              {TARIFF_PERIOD_LABEL[rental.tariffPeriod]} ·{" "}
              <span className="font-semibold text-ink-2">
                {fmt(rental.rate)} ₽/сут
              </span>
            </span>
          </>
        )}
        {client && tier && (
          <>
            <Dot />
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
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
            <Dot />
            <span className="text-muted-2">{SOURCE_LABEL[client.source]}</span>
          </>
        )}
        {client && (
          <>
            <Dot />
            <a
              href={`tel:${client.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-1.5 text-[15px] font-bold tabular-nums text-ink hover:text-blue-600"
            >
              <Phone size={14} className="text-blue-600" />
              {client.phone}
            </a>
          </>
        )}
      </div>

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
        const hrs = hoursOverdue(rental, TODAY);
        const fine = overdueReturnFine(hrs, rental.rate);
        const days = Math.floor(hrs / 24);
        const remHrs = Math.floor(hrs - days * 24);
        const durText =
          days > 0
            ? `${days} дн ${remHrs} ч`
            : `${Math.floor(hrs)} ч ${Math.round((hrs - Math.floor(hrs)) * 60)} мин`;
        return (
          <div className="flex items-center gap-2 rounded-[12px] bg-red-soft/70 px-3 py-2 text-[12px] text-red-ink">
            <AlertTriangle size={14} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <b>Просрочка {durText}.</b> Штраф {fmt(fine)} ₽ (300 ₽/час по
              договору). Плановый возврат — {rental.endPlanned}{" "}
              {rental.startTime || "12:00"}.
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        {(() => {
          let value = `${rental.days} дн`;
          let hint = `${rental.start.slice(0, 5)} — ${rental.endPlanned.slice(0, 5)}`;
          let kpiTone: "neutral" | "green" | "red" | "gray" = "neutral";
          if (rental.status === "active" && daysLeft !== null) {
            if (daysLeft > 0) {
              value = `осталось ${daysLeft} дн`;
              kpiTone = daysLeft < 2 ? "red" : "neutral";
            } else if (daysLeft === 0) {
              value = `возврат сегодня`;
              kpiTone = "red";
            } else {
              value = `просрочка ${Math.abs(daysLeft)} дн`;
              kpiTone = "red";
            }
          } else if (rental.status === "overdue") {
            value = "просрочка";
            kpiTone = "red";
          }
          return (
            <KpiChip
              label="Период"
              value={value}
              hint={hint}
              tone={kpiTone}
            />
          );
        })()}
        <KpiChip
          label="К оплате"
          value={rental.sum > 0 ? `${fmt(expectedTotal)} ₽` : "—"}
          hint={`аренда ${fmt(rental.sum)} + залог ${fmt(rental.deposit || DEPOSIT_AMOUNT)}`}
        />
        <KpiChip
          label="Получено"
          value={`${fmt(paidIn)} ₽`}
          hint={paidIn >= expectedTotal ? "полностью" : `${Math.round((paidIn / Math.max(1, expectedTotal)) * 100)}%`}
          tone={paidIn >= expectedTotal ? "green" : "neutral"}
        />
        <KpiChip
          label="Остаток"
          value={pending > 0 ? `${fmt(pending)} ₽` : "0 ₽"}
          hint={pending > 0 ? "не оплачено" : "долгов нет"}
          tone={pending > 0 ? "red" : "gray"}
        />
        {rental.status === "overdue" && endDate ? (
          (() => {
            const hrs = hoursOverdue(rental, TODAY);
            const fine = overdueReturnFine(hrs, rental.rate);
            return (
              <KpiChip
                label="Штраф"
                value={`${fmt(fine)} ₽`}
                hint="300 ₽/час"
                tone="red"
              />
            );
          })()
        ) : (
          <KpiChip
            label="Ставка"
            value={rental.rate > 0 ? `${fmt(rental.rate)} ₽` : "—"}
            hint={TARIFF_PERIOD_LABEL[rental.tariffPeriod]}
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
        {tab === "terms" && <TermsTab rental={rental} />}
        {tab === "payments" && <PaymentsTab rental={rental} />}
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

function Dot() {
  return <span className="text-muted-2 opacity-60">·</span>;
}

function KpiChip({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "green" | "red" | "gray";
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] px-3 py-2",
        tone === "green"
          ? "bg-green-soft/60"
          : tone === "red"
            ? "bg-red-soft/60"
            : tone === "gray"
              ? "bg-surface-soft"
              : "bg-blue-50",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
        {label}
      </div>
      <div className="mt-0.5 font-display text-[16px] font-extrabold leading-none text-ink">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-2">{hint}</div>}
    </div>
  );
}

