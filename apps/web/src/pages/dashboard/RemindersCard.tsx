import { AlarmClock, Phone, ChevronRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "@/app/navigationStore";
import { useReminders, type Reminder } from "@/lib/api/reminders";

/**
 * Напоминания на дашборде (заказчик, 01.09).
 *
 * «Нужна напоминалка: позвонить клиенту за день до платежа по выкупу, и
 * про выплату инвесторам тоже». Ценность именно в слове ЗАРАНЕЕ — поэтому
 * блок живёт на дашборде, а не в разделе выкупа: там его увидит только
 * тот, кто и так туда зашёл.
 *
 * Порядок строк — по срочности: сначала уже просроченное, потом сегодня,
 * потом завтра. Телефон вынесен отдельной кнопкой: типовое действие по
 * напоминанию — позвонить, а не «открыть карточку и поискать номер».
 */

const TONE: Record<Reminder["urgency"], { dot: string; chip: string; label: string }> = {
  overdue: {
    dot: "bg-red",
    chip: "bg-red-soft text-red-ink",
    label: "просрочено",
  },
  today: {
    dot: "bg-orange",
    chip: "bg-orange-soft text-orange-ink",
    label: "сегодня",
  },
  soon: {
    dot: "bg-blue",
    chip: "bg-purple-soft text-purple-ink",
    label: "завтра",
  },
};

const fmt = (n: number) => n.toLocaleString("ru-RU");

export function RemindersCard({ className }: { className?: string }) {
  const { data, isLoading } = useReminders();
  const items = data?.items ?? [];

  // Пока нечего напоминать — не занимаем экран целой карточкой.
  if (isLoading || items.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-card",
          className,
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted-2">
          {isLoading ? <AlarmClock size={14} /> : <CheckCircle2 size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-ink">Напоминания</div>
          <div className="text-[11px] text-muted">
            {isLoading
              ? "Смотрим график платежей…"
              : "Всё чисто: ни платежей на завтра, ни выплат"}
          </div>
        </div>
      </div>
    );
  }

  const go = (r: Reminder) => {
    if (!r.link) return;
    if (r.link.section === "rassrochki") {
      navigate({ route: "rassrochki", buyoutDealId: r.link.entityId });
    } else {
      navigate({ route: "partners" });
    }
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-surface shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-soft text-orange-ink">
          <AlarmClock size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-ink">Напоминания</div>
          <div className="text-[11px] text-muted">
            {data!.counts.overdue > 0
              ? `${data!.counts.overdue} просрочено · надо звонить сегодня`
              : "платежи и выплаты на ближайшие сутки"}
          </div>
        </div>
        {data!.summary.buyoutAmount > 0 && (
          <span className="shrink-0 font-display text-[15px] font-extrabold tabular-nums text-ink">
            {fmt(data!.summary.buyoutAmount)} ₽
          </span>
        )}
      </div>

      <div className="flex flex-col">
        {items.slice(0, 6).map((r) => {
          const tone = TONE[r.urgency];
          return (
            <div
              key={r.id}
              className="flex items-center gap-2.5 border-b border-border/50 px-4 py-2.5 last:border-b-0 hover:bg-surface-soft/50"
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} />
              <button
                type="button"
                onClick={() => go(r)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-bold text-ink">
                    {r.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      tone.chip,
                    )}
                  >
                    {tone.label}
                  </span>
                </div>
                <div className="truncate text-[11.5px] text-muted">{r.subtitle}</div>
              </button>
              {r.amount != null && (
                <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink-2">
                  {fmt(r.amount)} ₽
                </span>
              )}
              {r.phone && (
                // Тот же зелёный «телефон-пилюля», что в «Долгах к сбору»
                // прямо под этим блоком — иначе два соседних списка выглядят
                // как из разных программ.
                <a
                  href={`tel:${r.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  title={`Позвонить ${r.phone}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-green-soft px-2.5 py-1.5 font-mono text-[12.5px] font-bold text-ink transition-colors hover:bg-green-soft/70"
                >
                  <Phone size={13} className="text-green-ink" />
                  <span className="hidden xl:inline">{r.phone}</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => go(r)}
                className="shrink-0 text-muted-2 hover:text-ink"
                aria-label="Открыть"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {items.length > 6 && (
        <div className="border-t border-border/60 px-4 py-2 text-[11.5px] text-muted">
          и ещё {items.length - 6} — весь список в разделе «Выкуп»
        </div>
      )}
    </div>
  );
}
