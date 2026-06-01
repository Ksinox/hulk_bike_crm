import { Scale, Flame } from "lucide-react";
import { useDebtorsToday } from "@/lib/api/debtors";
import { TYPE_LABEL, STAGE_LABEL } from "@/lib/debtors/types";
import type { TodayBundle } from "@/lib/debtors/types";
import { cn } from "@/lib/utils";
import { MobileEmpty } from "../ui";

function rub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

const PRIORITY_CLS: Record<string, string> = {
  hot: "bg-red-soft text-red-ink",
  warm: "bg-orange-soft text-orange-ink",
  cool: "bg-blue-50 text-blue-600",
};

type QueueRow = TodayBundle["queue"][number];

export function MobileDebtors() {
  const { data, isLoading } = useDebtorsToday();

  if (isLoading) {
    return <div className="py-10 text-center text-[13px] text-muted-2">Загрузка…</div>;
  }

  if (!data || data.totalActiveCount === 0) {
    return (
      <MobileEmpty
        icon={<Scale size={26} />}
        title="Должников нет"
        hint="Все долги под контролем — активных дел нет"
      />
    );
  }

  const rows: QueueRow[] = [
    ...(data.hottest ? [data.hottest] : []),
    ...data.queue,
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Сводка */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="text-[11px] font-medium text-muted">Активных дел</div>
          <div className="mt-1 font-display text-[26px] font-bold tabular-nums text-ink">
            {data.totalActiveCount}
          </div>
        </div>
        <div className="rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="text-[11px] font-medium text-muted">Сумма долга</div>
          <div className="mt-1 font-display text-[22px] font-bold tabular-nums text-red">
            {rub(data.totalActiveSum)} ₽
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1 pt-1">
        <Flame size={15} className="text-orange-ink" />
        <h3 className="text-[14px] font-bold text-ink">Очередь на сегодня</h3>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <DebtorRow key={row.debtor.id} row={row} hottest={i === 0 && !!data.hottest} />
        ))}
      </div>

      <p className="mt-1 text-center text-[12px] text-muted-2">
        Работа по делу (звонки, платежи, этапы) — на компьютере
      </p>
    </div>
  );
}

function DebtorRow({ row, hottest }: { row: QueueRow; hottest: boolean }) {
  const { debtor, action } = row;
  return (
    <div
      className={cn(
        "rounded-2xl bg-surface p-3 shadow-card-sm",
        hottest && "ring-2 ring-red/30",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="truncate text-[14px] font-bold text-ink">
          {debtor.clientName}
        </span>
        <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", PRIORITY_CLS[action.priority] ?? "bg-surface-soft text-muted")}>
          {action.priority === "hot" ? "Срочно" : action.priority === "warm" ? "Скоро" : "Спокойно"}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
        <span>{debtor.caseNumber}</span>
        <span>·</span>
        <span>{TYPE_LABEL[debtor.type]}</span>
        <span>·</span>
        <span>{STAGE_LABEL[debtor.stage]}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink">{action.text}</span>
        <span className="shrink-0 text-[14px] font-bold tabular-nums text-red">
          {rub(debtor.totalAmount)} ₽
        </span>
      </div>
    </div>
  );
}
