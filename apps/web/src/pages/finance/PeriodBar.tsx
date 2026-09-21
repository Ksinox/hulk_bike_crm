import { useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-picker";
import { Btn } from "./ui";

/**
 * Выбор периода в «Финансах».
 *
 * По умолчанию — расчётный период CRM (у заказчика с 15-го по 15-е), листается
 * стрелками. Но смотреть иногда нужно «за своё»: квартал, полгода, произвольные
 * даты. Поэтому рядом — быстрые варианты и свой диапазон.
 *
 * Стрелки и быстрые варианты стоят в одной строке с названием периода: выбрал
 * — и сразу видишь, что выбрал, не перемещая взгляд через весь экран.
 */

export type RangeMode = "period" | "quarter" | "half" | "year" | "custom";

export const QUICK: { id: RangeMode; label: string; hint: string }[] = [
  { id: "period", label: "Период", hint: "Расчётный период CRM" },
  { id: "quarter", label: "3 периода", hint: "Текущий и два предыдущих" },
  { id: "half", label: "Полгода", hint: "Шесть периодов подряд" },
  { id: "year", label: "Год", hint: "Двенадцать периодов" },
];

export function PeriodBar({
  label,
  sublabel,
  mode,
  back,
  custom,
  onBack,
  onForward,
  onMode,
  onCustom,
}: {
  label: string;
  sublabel: string;
  mode: RangeMode;
  back: number;
  custom: { from: string; to: string } | null;
  onBack: () => void;
  onForward: () => void;
  onMode: (m: RangeMode) => void;
  onCustom: (r: { from: string; to: string } | null) => void;
}) {
  const [pickOpen, setPickOpen] = useState(false);
  const arrows = mode === "period";

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-2 shadow-card-sm sm:p-2.5">
      <div className="flex items-center justify-between gap-2">
        {arrows ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-soft hover:text-ink"
            title="Предыдущий период"
          >
            <ChevronLeft size={20} />
          </button>
        ) : (
          <span className="h-11 w-11 shrink-0" />
        )}
        <div className="min-w-0 text-center">
          <div className="truncate font-display text-[17px] font-bold leading-tight text-ink sm:text-[19px]">
            {label}
          </div>
          <div className="truncate text-[11.5px] text-muted-2">{sublabel}</div>
        </div>
        {arrows ? (
          <button
            type="button"
            disabled={back === 0}
            onClick={onForward}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-soft hover:text-ink disabled:opacity-30"
            title="Следующий период"
          >
            <ChevronRight size={20} />
          </button>
        ) : (
          <span className="h-11 w-11 shrink-0" />
        )}
      </div>

      {/* Быстрые варианты и свой диапазон — тут же, под названием. */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.id}
            type="button"
            title={q.hint}
            onClick={() => {
              onCustom(null);
              onMode(q.id);
            }}
            className={cn(
              "inline-flex h-9 items-center rounded-xl px-3 text-[12.5px] font-semibold transition-colors",
              mode === q.id
                ? "bg-ink text-white"
                : "text-muted hover:bg-surface-soft hover:text-ink",
            )}
          >
            {q.label}
          </button>
        ))}
        {mode === "custom" && custom ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-9 items-center rounded-xl bg-ink px-3 text-[12.5px] font-semibold text-white">
              Свой диапазон
            </span>
            <Btn className="h-9 px-3" onClick={() => setPickOpen((v) => !v)}>
              <CalendarRange size={14} /> Изменить
            </Btn>
            <Btn
              className="h-9 px-2.5"
              title="Вернуться к расчётному периоду"
              onClick={() => {
                onCustom(null);
                onMode("period");
              }}
            >
              <X size={14} />
            </Btn>
          </span>
        ) : (
          <Btn className="h-9 px-3" onClick={() => setPickOpen((v) => !v)}>
            <CalendarRange size={14} /> Свой период
          </Btn>
        )}
      </div>

      {pickOpen && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border pt-2">
          <DateRangePicker
            from={custom?.from ?? null}
            to={custom?.to ?? null}
            onChange={(r) => {
              if (r?.from && r?.to) {
                onCustom({ from: r.from, to: r.to });
                onMode("custom");
                setPickOpen(false);
              }
            }}
            placeholder="Выберите даты"
          />
          <span className="text-[12px] text-muted">
            любые даты — хоть за неделю, хоть за два года
          </span>
        </div>
      )}
    </div>
  );
}
