import { useState } from "react";
import { ChevronDown, ChevronRight, Phone, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import { ClientAvatar } from "./ReturnsList";
import {
  formatRub,
  type DebtorNoRentalItem,
  type OverdueItem,
} from "./useDashboardMetrics";
import { navigate } from "@/app/navigationStore";

/**
 * «Долги к сбору» — единый блок «кому звонить за деньгами» на дашборде
 * (заказчик: просрочка + висящие долги — главное на экране, поднять НАД парком).
 * Объединяет просроченные платежи (есть аренда) и висящие долги по ущербу
 * (нет активной аренды), сортирует по срочности, показывает общую сумму к
 * взысканию и звонок прямо в строке. Клик по строке → выбор куда открыть
 * (аренда / карточка клиента / вкладка «Должники») — вкладка должников пока
 * в работе, поэтому даём выбор, а не жёсткий переход.
 */
type DebtRow = {
  key: string;
  kind: "overdue" | "hanging";
  clientId: number;
  clientName: string;
  clientPhone: string;
  amount: number;
  rentalId?: number;
  scooterName?: string;
  daysOverdue?: number;
};

export function DebtsToCollect({
  overdue = [],
  debtors = [],
  onOpenRental,
  onOpenClient,
  className,
}: {
  overdue?: OverdueItem[];
  debtors?: DebtorNoRentalItem[];
  onOpenRental?: (rentalId: number) => void;
  onOpenClient?: (clientId: number) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuKey, setMenuKey] = useState<string | null>(null);

  const rows: DebtRow[] = [
    ...overdue.map((o) => ({
      key: `o${o.rentalId}`,
      kind: "overdue" as const,
      clientId: o.clientId,
      clientName: o.clientName,
      clientPhone: o.clientPhone,
      amount: o.debt,
      rentalId: o.rentalId,
      scooterName: o.scooterName,
      daysOverdue: o.daysOverdue,
    })),
    ...debtors.map((d) => ({
      key: `h${d.clientId}`,
      kind: "hanging" as const,
      clientId: d.clientId,
      clientName: d.clientName,
      clientPhone: d.clientPhone,
      amount: d.amount,
    })),
  ];
  // Сортировка по срочности: сперва просрочка (по числу дней ↓, затем сумма ↓),
  // потом висящие долги по сумме ↓.
  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "overdue" ? -1 : 1;
    if (a.kind === "overdue")
      return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0) || b.amount - a.amount;
    return b.amount - a.amount;
  });

  const total = rows.reduce((s, r) => s + r.amount, 0);

  // Пусто — тонкая зелёная полоса (как у OverdueTable), не занимаем место.
  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-card",
          className,
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-soft text-green-ink">
          <Wallet size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-ink">Долги к сбору</div>
          <div className="text-[11px] text-muted">
            Все долги закрыты — собирать нечего
          </div>
        </div>
      </div>
    );
  }

  const visible = expanded ? rows : rows.slice(0, 5);

  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-soft text-red-ink">
          <Wallet size={16} />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 text-base font-bold leading-tight">Долги к сбору</h3>
          <div className="text-[11px] text-muted">
            {overdue.length > 0 && `просрочка ${overdue.length}`}
            {overdue.length > 0 && debtors.length > 0 && " · "}
            {debtors.length > 0 && `ущерб ${debtors.length}`}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
            к взысканию
          </div>
          <div className="font-display text-[20px] font-extrabold leading-tight text-red-ink tabular-nums">
            {formatRub(total)} ₽
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col gap-1.5",
          expanded && "max-h-[480px] overflow-y-auto pr-1",
        )}
      >
        {visible.map((r) => (
          <DebtRowView
            key={r.key}
            row={r}
            menuOpen={menuKey === r.key}
            onToggleMenu={() =>
              setMenuKey((k) => (k === r.key ? null : r.key))
            }
            onCloseMenu={() => setMenuKey(null)}
            onOpenRental={onOpenRental}
            onOpenClient={onOpenClient}
          />
        ))}
      </div>

      {rows.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-surface-soft px-3 py-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
        >
          {expanded ? "Свернуть" : `Все долги (${rows.length})`}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      )}
    </Card>
  );
}

function DebtRowView({
  row,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onOpenRental,
  onOpenClient,
}: {
  row: DebtRow;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpenRental?: (rentalId: number) => void;
  onOpenClient?: (clientId: number) => void;
}) {
  const isOverdue = row.kind === "overdue";
  const days = row.daysOverdue ?? 0;
  // Накал срочности — цвет левой полосы.
  const stripColor = isOverdue
    ? days >= 4
      ? "hsl(var(--red-ink))"
      : "hsl(var(--red))"
    : "hsl(var(--orange))";
  const phoneHref = phoneToTel(row.clientPhone);

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleMenu}
        title="Выбрать, куда открыть"
        className="flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-surface pr-2.5 transition-colors hover:bg-surface-soft"
      >
        <span
          className="w-1 shrink-0 self-stretch"
          style={{ background: stripColor }}
        />
        <div className="py-1.5 pl-1">
          <ClientAvatar initials={initialsOf(row.clientName)} variant="red" />
        </div>
        <div className="min-w-0 flex-1 py-1.5">
          <div className="truncate text-[13.5px] font-semibold text-ink">
            {row.clientName}
          </div>
          <div className="truncate text-[11.5px] text-muted-2">
            {isOverdue
              ? `${row.scooterName} · аренда ${pad(row.rentalId!)}`
              : "нет активной аренды"}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold",
            isOverdue
              ? "bg-red-soft text-red-ink"
              : "bg-orange-soft text-orange-ink",
          )}
        >
          {isOverdue ? `Просрочка · ${days} дн` : "Ущерб с прошлой"}
        </span>
        <span className="shrink-0 text-[14px] font-bold tabular-nums text-red-ink">
          {formatRub(row.amount)} ₽
        </span>
        <a
          href={phoneHref}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-green-soft px-2.5 py-1.5 font-mono text-[12.5px] font-bold text-ink transition-colors hover:bg-green-soft/70"
          title="Позвонить"
        >
          <Phone size={13} className="text-green-ink" />
          <span className="hidden xl:inline">{row.clientPhone || "—"}</span>
        </a>
        <ChevronRight size={16} className="shrink-0 text-muted-2" />
      </div>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              onCloseMenu();
            }}
          />
          <div className="absolute right-2 top-full z-50 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-card-lg">
            {row.rentalId != null && (
              <MenuItem
                label={`Открыть аренду ${pad(row.rentalId)}`}
                onClick={() => {
                  onCloseMenu();
                  onOpenRental?.(row.rentalId!);
                }}
              />
            )}
            <MenuItem
              label="Карточка клиента"
              onClick={() => {
                onCloseMenu();
                onOpenClient?.(row.clientId);
              }}
            />
            <MenuItem
              label="Вкладка «Должники»"
              onClick={() => {
                onCloseMenu();
                navigate({ route: "debtors" });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex w-full items-center px-3 py-2 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-surface-soft"
    >
      {label}
    </button>
  );
}

function pad(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

function phoneToTel(phone: string): string {
  const digits = (phone || "").replace(/[^\d+]/g, "");
  if (!digits) return "#";
  return `tel:${digits.startsWith("+") ? digits : `+${digits}`}`;
}

function initialsOf(name: string): string {
  return (
    (name || "")
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
