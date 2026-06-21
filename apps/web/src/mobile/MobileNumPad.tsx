import { useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

/**
 * Нативный полноэкранный ввод числа для мобильных мастеров (ущерб / закрытие).
 *
 * Зачем: на телефоне править суммы/количество/зачёт залога в маленьком инпуте
 * неудобно — палец промахивается, клавиатура перекрывает поле. Здесь — крупные
 * цифры, тач-таргеты ≥56px, лист выезжает снизу (sheet-up). «Готово» отдаёт
 * число наружу (с клампом в [0; max]). Управляется родителем через open-стейт:
 * `{numpad && <MobileNumPad {...numpad} onCancel onConfirm />}`.
 */
export function MobileNumPad({
  label,
  sublabel,
  hint,
  initial,
  max,
  suffix = "₽",
  confirmLabel = "Готово",
  onCancel,
  onConfirm,
}: {
  label: string;
  sublabel?: string;
  hint?: string;
  initial: number;
  /** Верхняя граница (например доступный залог). Значение клампится на «Готово». */
  max?: number;
  suffix?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (n: number) => void;
}) {
  // Черновик как строка — свободно набираем/стираем. Пустая строка = 0.
  const [draft, setDraft] = useState<string>(
    initial && initial > 0 ? String(Math.round(initial)) : "",
  );
  const num = Number(draft || "0");
  const over = max != null && num > max;

  const press = (d: string) => {
    setDraft((cur) => {
      const next = (cur === "0" ? "" : cur) + d;
      if (next.replace(/\D/g, "").length > 9) return cur; // защита от абсурда
      return next;
    });
  };
  const back = () => setDraft((c) => c.slice(0, -1));
  const clear = () => setDraft("");

  const commit = () => {
    let n = Number(draft || "0");
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (max != null) n = Math.min(n, max);
    onConfirm(Math.round(n));
  };

  const digit = (k: string) => (
    <button
      key={k}
      type="button"
      onClick={() => press(k)}
      className="h-[58px] rounded-2xl bg-surface-soft text-[24px] font-semibold text-ink transition-transform active:scale-95 active:bg-blue-50"
    >
      {k}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col justify-end bg-ink/45 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="flex flex-col rounded-t-3xl bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-card-lg animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* грабер */}
        <div className="flex justify-center pb-1 pt-2.5">
          <div className="h-1.5 w-10 rounded-full bg-muted-2/40" />
        </div>

        {/* значение */}
        <div className="px-5 pb-3 pt-1 text-center">
          <div className="text-[13px] font-medium text-muted-2">
            {label}
            {sublabel ? (
              <span className="text-muted"> · {sublabel}</span>
            ) : null}
          </div>
          <div
            className={cn(
              "mt-1 text-[40px] font-semibold leading-tight tabular-nums",
              over ? "text-red-600" : "text-ink",
            )}
          >
            {fmt(num)}
            <span className="ml-1 text-[22px] text-muted-2">{suffix}</span>
          </div>
          {over ? (
            <div className="text-[12px] font-semibold text-red-600">
              Максимум {fmt(max!)} {suffix}
            </div>
          ) : hint ? (
            <div className="text-[12px] text-muted-2">{hint}</div>
          ) : null}
        </div>

        {/* клавиатура */}
        <div className="grid grid-cols-3 gap-2 px-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit)}
          <button
            type="button"
            onClick={clear}
            className="h-[58px] rounded-2xl bg-surface-soft text-[14px] font-semibold text-muted-2 transition-transform active:scale-95"
          >
            Очистить
          </button>
          {digit("0")}
          <button
            type="button"
            onClick={back}
            className="flex h-[58px] items-center justify-center rounded-2xl bg-surface-soft text-muted-2 transition-transform active:scale-95"
            aria-label="Стереть"
          >
            <Delete size={22} />
          </button>
        </div>

        {/* действия */}
        <div className="flex gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 flex-1 rounded-2xl bg-surface-soft text-[15px] font-semibold text-ink-2 transition-transform active:scale-[0.98]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={commit}
            className="h-12 flex-1 rounded-2xl bg-blue-600 text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
