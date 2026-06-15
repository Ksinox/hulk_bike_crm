import { AlertTriangle } from "lucide-react";
import { Card } from "./KpiCard";
import { ClientAvatar } from "./ReturnsList";
import { formatRub, type DebtorNoRentalItem } from "./useDashboardMetrics";
import { navigate } from "@/app/navigationStore";

/**
 * F4: «Висящие долги» — клиенты с незакрытым долгом (ущерб), у которых НЕТ
 * активной аренды. В просрочках их нет (нет активной аренды), а во вкладку
 * «Клиенты» оператор почти не ходит — такие должники теряются. Выводим их
 * отдельным блоком на дашборде; клик открывает карточку клиента, чтобы
 * можно было отработать долг.
 *
 * Пусто → не рендерим (не занимаем место на дашборде).
 */
export function DebtorsNoRentalCard({
  items = [],
  className,
}: {
  items?: DebtorNoRentalItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  const total = items.reduce((s, d) => s + d.amount, 0);
  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-soft text-orange-ink">
          <AlertTriangle size={15} />
        </span>
        <h3 className="m-0 text-base font-bold">Висящие долги</h3>
        <span className="rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-bold text-orange-ink">
          {items.length}
        </span>
        <span className="ml-auto truncate text-[12px] text-muted">
          без активной аренды · {formatRub(total)} ₽
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((d) => (
          <button
            key={d.clientId}
            type="button"
            onClick={() => navigate({ route: "clients", clientId: d.clientId })}
            title="Открыть карточку клиента"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-soft"
          >
            <ClientAvatar initials={initialsOf(d.clientName)} variant="red" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">
                {d.clientName}
              </div>
              <div className="text-[11px] text-muted">
                ущерб · скутер возвращён
              </div>
            </div>
            <div className="shrink-0 text-[14px] font-bold text-red-ink">
              {formatRub(d.amount)} ₽
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
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
