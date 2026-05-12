/**
 * DebtsList — содержимое side-drawer'а «История долгов». Краткий timeline
 * по составляющим долга: просрочка (дни + штраф), ущерб, ручные начисления,
 * прощения. Источник правды — DebtSummary с сервера, фолбэк на damage
 * reports / locals.
 */
import { AlertTriangle, ArrowRight, Wrench } from "lucide-react";
import { useRentalDebt, type DebtEntry } from "@/lib/api/debt";
import { useChainDamageReports } from "@/lib/api/damage-reports";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function DebtsList({
  rentalId,
  chainIds,
  onOpenDamage,
}: {
  rentalId: number;
  chainIds: number[];
  onOpenDamage?: (reportId: number) => void;
}) {
  const debtQ = useRentalDebt(rentalId);
  const damageReports = useChainDamageReports(chainIds);
  const data = debtQ.data;

  if (debtQ.isLoading) {
    return (
      <div className="p-5 text-[12px] text-muted">Загружаем данные долга…</div>
    );
  }

  if (!data) {
    return (
      <div className="p-5 text-[12px] text-muted">
        Данные долга недоступны.
      </div>
    );
  }

  const hasAnything =
    data.total > 0 ||
    data.events.length > 0 ||
    data.damageReports.length > 0 ||
    damageReports.data.length > 0;

  if (!hasAnything) {
    return (
      <div className="p-5">
        <div className="rounded-[12px] border border-border bg-surface-soft p-4 text-[12px] text-muted-2 text-center">
          <b className="text-ink">Долгов по аренде нет.</b>
          <div className="mt-1">
            Здесь появится таймлайн просрочки, ущерба и ручных начислений,
            когда они возникнут.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col gap-3">
      {/* Текущие остатки */}
      <div className="grid grid-cols-2 gap-2">
        <BalanceCell
          label="Просрочка"
          value={data.overdueBalance}
          subtitle={`${data.overdueDays} дн`}
          tone="red"
        />
        <BalanceCell
          label="Ущерб"
          value={data.damageBalance}
          subtitle={`${data.damageReports.length} акт${data.damageReports.length === 1 ? "" : "ов"}`}
          tone="red"
        />
        <BalanceCell
          label="Ручной долг"
          value={data.manualBalance}
          subtitle="прочие начисления"
          tone="orange"
        />
        <BalanceCell
          label="Итого"
          value={data.total}
          subtitle="сумма к погашению"
          tone={data.total > 0 ? "red" : "ink"}
        />
      </div>

      {/* Damage reports — клик ведёт на превью / оплату */}
      {damageReports.data.length > 0 && (
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2 mb-2">
            Акты о повреждениях
          </div>
          <div className="flex flex-col gap-2">
            {damageReports.data.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpenDamage?.(r.id)}
                className="rounded-[12px] border border-border p-3 flex items-center gap-3 hover:border-blue-100 hover:bg-blue-50/30 text-left transition-colors"
              >
                <div className="h-9 w-9 rounded-full flex items-center justify-center bg-red-soft text-red-ink shrink-0">
                  <Wrench size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-bold text-ink">
                    Акт #{r.id}
                  </div>
                  <div className="text-[11px] text-muted">
                    {new Date(r.createdAt).toLocaleDateString("ru-RU")} ·
                    зачтено из залога {fmt(r.depositCovered)} ₽
                    {r.paidSum > 0 && <> · оплачено {fmt(r.paidSum)} ₽</>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-display text-[15px] font-extrabold tabular-nums text-red-ink">
                    {fmt(r.debt)} ₽
                  </div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-red-ink/80">
                    остаток
                  </div>
                </div>
                <ArrowRight size={14} className="text-muted shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* События долга */}
      {data.events.length > 0 && (
        <section>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2 mb-2">
            Лента долга
          </div>
          <div className="flex flex-col gap-1.5">
            {data.events.map((ev) => (
              <DebtEventRow key={ev.id} ev={ev} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BalanceCell({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: number;
  subtitle: string;
  tone: "red" | "orange" | "ink";
}) {
  const bg =
    value > 0 && tone === "red"
      ? "bg-red-soft"
      : value > 0 && tone === "orange"
        ? "bg-orange-soft"
        : "bg-surface-soft";
  const text =
    value > 0 && tone === "red"
      ? "text-red-ink"
      : value > 0 && tone === "orange"
        ? "text-orange-ink"
        : "text-ink";
  return (
    <div className={`rounded-[10px] ${bg} px-3 py-2.5`}>
      <div className="text-[9.5px] uppercase tracking-wider font-bold text-muted-2">
        {label}
      </div>
      <div className={`mt-0.5 font-display text-[15px] font-extrabold tabular-nums leading-tight ${text}`}>
        {fmt(value)} ₽
      </div>
      <div className="mt-0.5 text-[10px] text-muted">{subtitle}</div>
    </div>
  );
}

function DebtEventRow({ ev }: { ev: DebtEntry }) {
  const isCharge = ev.kind === "manual_charge";
  const isForgive = ev.kind.includes("forgive");
  const isPayment = ev.kind.includes("payment");
  const sign = isCharge ? "+" : isForgive ? "−" : isPayment ? "−" : "";
  const color = isCharge
    ? "text-red-ink"
    : isForgive
      ? "text-orange-ink"
      : "text-green-ink";
  return (
    <div className="flex items-start gap-2 rounded-[10px] bg-surface-soft px-3 py-2">
      <AlertTriangle size={12} className="mt-0.5 text-muted-2 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-ink leading-tight">
          {labelForKind(ev.kind)}
        </div>
        <div className="text-[10.5px] text-muted-2 mt-0.5">
          {new Date(ev.createdAt).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {ev.createdByName && (
            <>
              <span className="opacity-40"> · </span>
              {ev.createdByName}
            </>
          )}
          {ev.comment && (
            <>
              <span className="opacity-40"> · </span>«{ev.comment}»
            </>
          )}
        </div>
      </div>
      <div className={`font-display text-[12.5px] font-extrabold tabular-nums shrink-0 ${color}`}>
        {sign}
        {fmt(ev.amount)} ₽
      </div>
    </div>
  );
}

function labelForKind(kind: string): string {
  switch (kind) {
    case "manual_charge":
      return "Ручное начисление";
    case "manual_forgive":
      return "Ручное списание";
    case "overdue_forgive":
      return "Просрочка прощена";
    case "overdue_payment":
      return "Оплата просрочки";
    case "overdue_days_forgive":
      return "Просрочка прощена (дни)";
    case "overdue_fine_forgive":
      return "Штраф списан";
    case "overdue_days_payment":
      return "Оплата просроченных дней";
    case "overdue_fine_payment":
      return "Оплата штрафа";
    default:
      return kind;
  }
}
