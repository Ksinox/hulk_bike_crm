import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Gavel,
  Phone,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_AMOUNT,
  hoursOverdue,
  MODEL_LABEL,
  overdueReturnFine,
  PAYMENT_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TARIFF_PERIOD_LABEL,
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { CLIENTS } from "@/lib/mock/clients";
import { navigate } from "@/app/navigationStore";
import {
  IncidentsTab,
  PaymentsTab,
  ReturnTab,
  TasksTab,
  TermsTab,
} from "./RentalCardTabs";
import { RentalActionDialog, type ActionKind } from "./RentalActionDialog";
import { ConfirmPaymentDialog } from "./ConfirmPaymentDialog";

type TabId = "terms" | "payments" | "return" | "incidents" | "tasks";

const TABS: { id: TabId; label: string }[] = [
  { id: "terms", label: "Условия" },
  { id: "payments", label: "Платежи" },
  { id: "return", label: "Возврат" },
  { id: "incidents", label: "Инциденты" },
  { id: "tasks", label: "Задачи" },
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

function statusActions(status: RentalStatus): {
  id: string;
  label: string;
  icon: typeof CheckCircle2;
  tone: "primary" | "warn" | "danger" | "ghost";
}[] {
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
        { id: "receive", label: "Принять возврат", icon: ArrowRight, tone: "primary" },
        { id: "incident", label: "Зафиксировать инцидент", icon: AlertTriangle, tone: "warn" },
      ];
    case "overdue":
      return [
        { id: "receive", label: "Принять возврат", icon: ArrowRight, tone: "primary" },
        { id: "revert-overdue", label: "Снять просрочку", icon: XCircle, tone: "ghost" },
        { id: "police", label: "Подать в полицию", icon: ShieldAlert, tone: "danger" },
      ];
    case "returning":
      return [
        { id: "complete", label: "Завершить без ущерба", icon: CheckCircle2, tone: "primary" },
        { id: "complete-damage", label: "Завершить с ущербом", icon: AlertTriangle, tone: "warn" },
      ];
    case "completed_damage":
      return [
        { id: "record-damage", label: "Записать оплату ущерба", icon: CheckCircle2, tone: "primary" },
        { id: "claim", label: "Составить претензию", icon: AlertTriangle, tone: "warn" },
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

export function RentalCard({ rental }: { rental: Rental }) {
  const [tab, setTab] = useState<TabId>("terms");
  const [action, setAction] = useState<ActionKind | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const client = useMemo(
    () => CLIENTS.find((c) => c.id === rental.clientId),
    [rental.clientId],
  );

  const startDate = parseDate(rental.start);
  const endDate = parseDate(rental.endPlanned);
  const daysLeft =
    startDate && endDate
      ? daysBetween(TODAY, endDate)
      : null;
  const daysElapsed =
    startDate
      ? daysBetween(startDate, TODAY)
      : null;

  const tone = STATUS_TONE[rental.status];
  const actions = statusActions(rental.status);

  return (
    <div className="flex min-h-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card-sm">
      {/* Header */}
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
              АРЕНДА
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
                tone === "green" && "bg-green-soft text-green-ink",
                tone === "red" && "bg-red-soft text-red-ink",
                tone === "orange" && "bg-orange-soft text-orange-ink",
                tone === "blue" && "bg-blue-50 text-blue-700",
                tone === "purple" && "bg-purple-soft text-purple-ink",
                tone === "gray" && "bg-surface-soft text-muted",
              )}
            >
              {STATUS_LABEL[rental.status]}
            </span>
            <span className="text-[12px] font-semibold text-muted-2">
              Договор #{String(rental.id).padStart(4, "0")}
            </span>
          </div>

          <h2 className="mt-2 flex flex-wrap items-center gap-2 font-display text-[22px] font-extrabold leading-tight text-ink">
            <span>{rental.scooter}</span>
            <span className="text-muted-2">·</span>
            <button
              type="button"
              onClick={() =>
                navigate({ route: "clients", clientId: rental.clientId })
              }
              className="inline-flex items-center gap-1 text-blue-600 transition-colors hover:text-blue-700 hover:underline"
              title="Открыть карточку клиента"
            >
              <User size={16} />
              {client?.name ?? `Клиент #${rental.clientId}`}
            </button>
          </h2>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-2">
            <span className="font-semibold text-ink-2">
              {MODEL_LABEL[rental.model]}
            </span>
            {rental.rate > 0 && (
              <>
                <span>·</span>
                <span>
                  тариф {TARIFF_PERIOD_LABEL[rental.tariffPeriod]} ·{" "}
                  {fmt(rental.rate)} ₽/сут
                </span>
              </>
            )}
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} />
              {rental.start} — {rental.endPlanned}
            </span>
            {client && (
              <a
                href={`tel:${client.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1 font-semibold text-ink hover:text-blue-600"
              >
                <Phone size={12} className="text-blue-600" />
                {client.phone}
              </a>
            )}
            <span>·</span>
            <span>{PAYMENT_LABEL[rental.paymentMethod]}</span>
          </div>

          {rental.note && (
            <div className="mt-2 rounded-[10px] bg-surface-soft px-3 py-1.5 text-[12px] text-ink-2">
              <b>Заметка:</b> {rental.note}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAction(a.id as ActionKind)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  a.tone === "primary" &&
                    "bg-blue-600 text-white hover:bg-blue-700",
                  a.tone === "warn" &&
                    "bg-orange-soft text-orange-ink hover:bg-orange/20",
                  a.tone === "danger" &&
                    "bg-red-soft text-red-ink hover:bg-red/20",
                  a.tone === "ghost" &&
                    "bg-surface-soft text-muted hover:bg-border",
                )}
              >
                <Icon size={13} />
                {a.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Требуется договор и подтверждение оплаты */}
      {rental.paymentConfirmed === null && (
        <div className="flex items-center gap-2 rounded-[14px] bg-blue-50 p-3 text-[13px] text-blue-700 ring-1 ring-inset ring-blue-600/30">
          <AlertTriangle size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <b>Требуется подтверждение:</b>{" "}
            <span>
              {rental.contractUploaded
                ? "оплата не подтверждена"
                : "скан договора и оплата"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="shrink-0 rounded-full bg-blue-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-blue-700"
          >
            Подтвердить
          </button>
        </div>
      )}
      {rental.paymentConfirmed && (
        <div className="flex items-center gap-2 rounded-[14px] bg-green-soft/60 p-3 text-[12px] text-green-ink">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>
            Оплата подтверждена{" "}
            {rental.paymentConfirmed.at} ·{" "}
            {rental.paymentConfirmed.by === "admin"
              ? "Администратор"
              : "Директор"}{" "}
            {rental.paymentConfirmed.byName}
            {rental.contractUploaded ? " · договор загружен" : ""}
          </span>
        </div>
      )}

      {/* Banners — specific situations */}
      {rental.status === "overdue" && endDate && (() => {
        const hrs = hoursOverdue(rental, TODAY);
        const fine = overdueReturnFine(hrs, rental.rate);
        const days = Math.floor(hrs / 24);
        const remHrs = Math.floor(hrs - days * 24);
        const durText = days > 0 ? `${days} дн ${remHrs} ч` : `${Math.floor(hrs)} ч ${Math.round((hrs - Math.floor(hrs)) * 60)} мин`;
        return (
          <div className="flex items-center gap-2 rounded-[14px] bg-red-soft/70 p-3 text-[13px] text-red-ink">
            <AlertTriangle size={16} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <b>Просрочка возврата: {durText}.</b>
              <span className="ml-2 text-[12px]">
                плановый возврат — {rental.endPlanned}{" "}
                {rental.startTime || "12:00"} · штраф {fmt(fine)} ₽ (300 ₽/час
                по договору)
              </span>
            </div>
          </div>
        );
      })()}
      {rental.status === "police" && (
        <div className="flex items-center gap-2 rounded-[14px] bg-red-soft/70 p-3 text-[13px] text-red-ink">
          <ShieldAlert size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <b>Заявление в полицию подано.</b>
            <span className="ml-2 text-[12px]">
              {rental.note ?? "скутер не возвращён"}
            </span>
          </div>
        </div>
      )}
      {rental.status === "completed_damage" && (
        <div className="flex items-center gap-2 rounded-[14px] bg-red-soft/70 p-3 text-[13px] text-red-ink">
          <AlertTriangle size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <b>Завершена с ущербом.</b>
            <span className="ml-2 text-[12px]">
              ущерб не погашен — необходима претензия или передача юристу
            </span>
          </div>
        </div>
      )}
      {rental.status === "returning" && (
        <div className="flex items-center gap-2 rounded-[14px] bg-orange-soft/70 p-3 text-[13px] text-orange-ink">
          <Calendar size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <b>Возврат сегодня.</b>
            <span className="ml-2 text-[12px]">
              осмотреть скутер, сверить с видео при выдаче
            </span>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiBox
          label="Ставка"
          value={rental.rate > 0 ? `${fmt(rental.rate)} ₽` : "—"}
          hint="в сутки"
        />
        <KpiBox
          label="Срок"
          value={rental.days > 0 ? `${rental.days} дн` : "—"}
          hint={startDate ? `с ${rental.start}` : "не определён"}
        />
        <KpiBox
          label="Аренда"
          value={rental.sum > 0 ? `${fmt(rental.sum)} ₽` : "—"}
          hint={PAYMENT_LABEL[rental.paymentMethod]}
          tone="green"
        />
        <KpiBox
          label="Залог"
          value={`${fmt(rental.deposit || DEPOSIT_AMOUNT)} ₽`}
          hint={
            rental.depositReturned === true
              ? "возвращён"
              : rental.depositReturned === false
                ? "удержан"
                : "при возврате"
          }
          tone={rental.depositReturned === false ? "red" : "neutral"}
        />
        {rental.status === "overdue" && endDate ? (
          (() => {
            const hrs = hoursOverdue(rental, TODAY);
            const fine = overdueReturnFine(hrs, rental.rate);
            const d = Math.floor(hrs / 24);
            const h = Math.floor(hrs - d * 24);
            const label = d > 0 ? `${d} дн ${h} ч` : `${h} ч`;
            return (
              <KpiBox
                label="Просрочка"
                value={label}
                hint={`штраф ${fmt(fine)} ₽ (300 ₽/час)`}
                tone="red"
              />
            );
          })()
        ) : rental.status === "active" && daysLeft !== null ? (
          <KpiBox
            label={daysLeft >= 0 ? "Осталось" : "Просрочено"}
            value={`${Math.abs(daysLeft)} дн`}
            hint={daysLeft < 0 ? "возврат просрочен" : "до возврата"}
            tone={daysLeft < 2 ? "red" : "neutral"}
          />
        ) : (
          <KpiBox
            label="Прошло"
            value={daysElapsed !== null ? `${daysElapsed} дн` : "—"}
            hint="от даты выдачи"
            tone="neutral"
          />
        )}
      </div>

      {/* Tabs */}
      <div className="mt-1 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px px-3 py-2 text-[13px] font-semibold transition-colors",
              tab === t.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "border-b-2 border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 pt-4">
        {tab === "terms" && <TermsTab rental={rental} />}
        {tab === "payments" && <PaymentsTab rental={rental} />}
        {tab === "return" && <ReturnTab rental={rental} />}
        {tab === "incidents" && <IncidentsTab rental={rental} />}
        {tab === "tasks" && <TasksTab rental={rental} />}
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
    </div>
  );
}

function KpiBox({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "green" | "red";
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] px-3 py-2.5",
        tone === "green"
          ? "bg-green-soft/60"
          : tone === "red"
            ? "bg-red-soft/60"
            : "bg-surface-soft",
      )}
    >
      <div className="text-[11px] font-semibold text-muted-2">{label}</div>
      <div className="mt-0.5 font-display text-[20px] font-extrabold leading-none text-ink">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-2">{hint}</div>
    </div>
  );
}

