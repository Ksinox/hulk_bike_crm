/**
 * DebtsList — содержимое side-drawer'а «История долгов».
 *
 * v0.6.33: переписано под дизайн-референс
 * (design/claude-design/Hulk Bike CRM/rental-card.jsx, функция DebtsList).
 *
 * Каждая строка — карточка с круглой иконкой слева (alert/check/arrow),
 * описанием в центре (диапазон дат + N дней + примечание) и суммой со
 * статус-тегом справа. Три статуса:
 *   • open     — красный, иконка AlertTriangle, тег «Открыто»
 *   • forgiven — зелёный, иконка Check, тег «Прощено»
 *   • paid     — серый, иконка ArrowRight, тег «Закрыто»
 *
 * Маппинг данных из useRentalDebt + useChainDamageReports:
 *   1) Просрочка: до трёх строк (open / forgiven / paid), каждая с
 *      диапазоном [plannedEnd → today].
 *   2) Каждый damage report — отдельная строка (open / forgiven / paid).
 *   3) Каждое manual_charge event — строка (open / paid).
 */
import { AlertTriangle, ArrowRight, Check } from "lucide-react";
import { useApiRentals } from "@/lib/api/rentals";
import { useRentalDebt } from "@/lib/api/debt";
import { useChainDamageReports } from "@/lib/api/damage-reports";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

type DebtStatus = "open" | "forgiven" | "paid";

type DebtRow = {
  key: string;
  status: DebtStatus;
  title: string;
  note: string;
  amount: number;
  onClick?: () => void;
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function parsePlannedEnd(s: string | null | undefined): Date | null {
  if (!s) return null;
  // Поддерживаем как dd.mm.yyyy, так и ISO.
  const dm = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dm) return new Date(+dm[3], +dm[2] - 1, +dm[1]);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pluralDays(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дн";
  return "дн";
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
  const { data: allRentals = [] } = useApiRentals();
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

  // Соберём строки.
  const rows: DebtRow[] = [];

  // Период просрочки: [plannedEnd → today], дни = overdueDays.
  const rental = allRentals.find((r) => r.id === rentalId) ?? null;
  const plannedEnd = parsePlannedEnd(rental?.endPlannedAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueRange = plannedEnd
    ? `${formatDate(plannedEnd)} → ${formatDate(today)}`
    : "Период просрочки";
  const overdueDays = data.overdueDays;

  if (data.overdueBalance > 0) {
    rows.push({
      key: "overdue-open",
      status: "open",
      title: `Просрочка · ${overdueRange}`,
      note: `${overdueDays} ${pluralDays(overdueDays)} · дни ${fmt(data.overdueDaysBalance)} ₽ + штраф ${fmt(data.overdueFineBalance)} ₽`,
      amount: data.overdueBalance,
    });
  }
  if (data.overdueForgiven > 0) {
    // Раскладку по дням/штрафу выведем из событий.
    const daysForgiven = data.events
      .filter(
        (e) =>
          e.kind === "overdue_days_forgive" ||
          e.kind === "overdue_forgive",
      )
      .reduce((s, e) => s + e.amount, 0);
    const fineForgiven = data.events
      .filter((e) => e.kind === "overdue_fine_forgive")
      .reduce((s, e) => s + e.amount, 0);
    const noteParts: string[] = [];
    if (daysForgiven > 0) noteParts.push(`дни ${fmt(daysForgiven)} ₽`);
    if (fineForgiven > 0) noteParts.push(`штраф ${fmt(fineForgiven)} ₽`);
    rows.push({
      key: "overdue-forgiven",
      status: "forgiven",
      title: `Прощено по просрочке · ${overdueRange}`,
      note: noteParts.join(" + ") || "списано оператором",
      amount: data.overdueForgiven,
    });
  }
  if (data.overduePaid > 0) {
    rows.push({
      key: "overdue-paid",
      status: "paid",
      title: `Просрочка оплачена · ${overdueRange}`,
      note: "погашено клиентом",
      amount: data.overduePaid,
    });
  }

  // Damage reports — каждый = строка.
  for (const r of damageReports.data) {
    const date = new Date(r.createdAt).toLocaleDateString("ru-RU");
    if (r.debt > 0) {
      rows.push({
        key: `damage-${r.id}-open`,
        status: "open",
        title: `Ущерб #${r.id} · ${date}`,
        note: `всего ${fmt(r.total)} ₽ · из залога ${fmt(r.depositCovered)} ₽${r.paidSum > 0 ? ` · оплачено ${fmt(r.paidSum)} ₽` : ""}`,
        amount: r.debt,
        onClick: onOpenDamage ? () => onOpenDamage(r.id) : undefined,
      });
    } else if (r.clientAgreement === "agreed" && r.paidSum < r.total - r.depositCovered) {
      // Прощено: согласовано клиентом, но не оплачено полностью и долг=0
      // — значит часть просто списана.
      rows.push({
        key: `damage-${r.id}-forgiven`,
        status: "forgiven",
        title: `Ущерб #${r.id} · ${date}`,
        note: `всего ${fmt(r.total)} ₽ · из залога ${fmt(r.depositCovered)} ₽${r.paidSum > 0 ? ` · оплачено ${fmt(r.paidSum)} ₽` : ""}`,
        amount: Math.max(0, r.total - r.depositCovered - r.paidSum),
        onClick: onOpenDamage ? () => onOpenDamage(r.id) : undefined,
      });
    } else {
      rows.push({
        key: `damage-${r.id}-paid`,
        status: "paid",
        title: `Ущерб #${r.id} · ${date}`,
        note: `всего ${fmt(r.total)} ₽ · из залога ${fmt(r.depositCovered)} ₽${r.paidSum > 0 ? ` · оплачено ${fmt(r.paidSum)} ₽` : ""}`,
        amount: r.total,
        onClick: onOpenDamage ? () => onOpenDamage(r.id) : undefined,
      });
    }
  }

  // Ручные начисления — каждое manual_charge = строка.
  // Парные manual_forgive просто отнимем из общего ручного долга для
  // определения статуса каждой строки нельзя (нет привязки), поэтому
  // показываем каждое manual_charge как отдельную запись со статусом
  // open пока есть manualBalance > 0, иначе paid.
  const manualCharges = data.events.filter((e) => e.kind === "manual_charge");
  const manualForgiveTotal = data.events
    .filter((e) => e.kind === "manual_forgive")
    .reduce((s, e) => s + e.amount, 0);
  let manualRemainingOpen = Math.max(0, data.manualBalance);
  let manualRemainingForgive = manualForgiveTotal;
  for (const ev of manualCharges) {
    const date = new Date(ev.createdAt).toLocaleDateString("ru-RU");
    let status: DebtStatus = "paid";
    let amount = ev.amount;
    if (manualRemainingOpen >= ev.amount) {
      status = "open";
      manualRemainingOpen -= ev.amount;
    } else if (manualRemainingForgive >= ev.amount) {
      status = "forgiven";
      manualRemainingForgive -= ev.amount;
    }
    rows.push({
      key: `manual-${ev.id}`,
      status,
      title: `Ручное начисление · ${date}`,
      note: ev.comment ? `«${ev.comment}»` : ev.createdByName ?? "оператор",
      amount,
    });
  }

  // Пересчёт по замене модели (swap_fee) — отдельные строки. Неоплаченный =
  // открытый долг, оплаченный = закрыт. Раньше swap_fee в этой ленте не было,
  // и долг по замене был «невидим» здесь (виден только в KPI «Долг»).
  for (const p of data.payments.filter((pp) => pp.type === "swap_fee")) {
    const date = new Date(p.createdAt).toLocaleDateString("ru-RU");
    rows.push({
      key: `swapfee-${p.id}`,
      status: p.paid ? "paid" : "open",
      title: `Пересчёт по замене модели · ${date}`,
      note: p.note || "разница ставок × остаток дней",
      amount: p.amount,
    });
  }

  if (rows.length === 0) {
    return (
      <div className="p-5">
        <div className="rounded-[12px] border border-border bg-surface-soft p-4 text-[12px] text-muted-2 text-center">
          <b className="text-ink">Долгов по аренде нет.</b>
          <div className="mt-1">
            Здесь появится список периодов просрочки, ущерба и ручных
            начислений, когда они возникнут.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col gap-2">
      {rows.map((row) => (
        <DebtRowCard key={row.key} row={row} />
      ))}
    </div>
  );
}

function DebtRowCard({ row }: { row: DebtRow }) {
  const palette = {
    open: {
      bg: "bg-red-soft",
      ink: "text-red-ink",
      tag: "Открыто",
      Icon: AlertTriangle,
    },
    forgiven: {
      bg: "bg-green-soft",
      ink: "text-green-ink",
      tag: "Прощено",
      Icon: Check,
    },
    paid: {
      bg: "bg-surface-soft",
      ink: "text-ink-2",
      tag: "Закрыто",
      Icon: ArrowRight,
    },
  }[row.status];

  const Content = (
    <div className="rounded-[12px] border border-border p-3 flex items-center gap-3">
      <div
        className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${palette.bg} ${palette.ink}`}
      >
        <palette.Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-bold text-ink leading-tight">
          {row.title}
        </div>
        {row.note && (
          <div className="text-[11px] text-muted mt-0.5 truncate">
            {row.note}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div
          className={`font-display text-[15px] font-extrabold tabular-nums ${palette.ink}`}
        >
          {fmt(row.amount)} ₽
        </div>
        <div
          className={`text-[10px] uppercase tracking-wider font-bold mt-0.5 ${palette.ink}`}
        >
          {palette.tag}
        </div>
      </div>
    </div>
  );

  if (row.onClick) {
    return (
      <button
        type="button"
        onClick={row.onClick}
        className="text-left hover:bg-surface-soft/40 rounded-[12px] transition-colors"
      >
        {Content}
      </button>
    );
  }
  return Content;
}
