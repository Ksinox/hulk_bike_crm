import { useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTouchTablet } from "@/lib/useIsMobile";

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
 *
 * Правки 7.0 (п.8б): на ПЛАНШЕТЕ своя клавиатура в 520px выглядела
 * телефонной и мелкой, а родная клавиатура iPad не открывалась. Там лист
 * становится окном с крупным полем ввода — открывается родная клавиатура
 * планшета. Окно стоит вверху экрана: клавиатура поднимается снизу и
 * закрыла бы его.
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
  // Решается один раз при открытии: поворот экрана тип устройства не меняет.
  const [native] = useState(isTouchTablet);

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

  if (native) {
    return (
      <div
        className="fixed inset-0 z-[150] flex flex-col items-center bg-ink/45 px-4 pt-[max(5vh,20px)] backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
        data-numpad="native"
      >
        <div
          className="flex w-full max-w-[560px] flex-col rounded-3xl bg-surface p-5 shadow-card-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center text-[15px] font-medium text-muted-2">
            {label}
            {sublabel ? <span className="text-muted"> · {sublabel}</span> : null}
          </div>
          <label
            className={cn(
              "mt-3 flex items-center rounded-2xl border-2 bg-surface-soft px-5 focus-within:bg-surface",
              over ? "border-red-400" : "border-transparent focus-within:border-blue-600",
            )}
          >
            <input
              // Фокус — в том же касании, что открыло окно: иначе iPad не
              // покажет клавиатуру. Не открылась — нажмите в поле.
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 9))}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") onCancel();
              }}
              placeholder="0"
              aria-label={label}
              className={cn(
                "h-20 min-w-0 flex-1 bg-transparent text-center text-[44px] font-semibold tabular-nums outline-none placeholder:text-muted-2/60",
                over ? "text-red-600" : "text-ink",
              )}
            />
            <span className="ml-2 text-[24px] font-semibold text-muted-2">{suffix}</span>
          </label>
          <div className="mt-2 min-h-[18px] text-center text-[13px]">
            {over ? (
              <span className="font-semibold text-red-600">
                Максимум {fmt(max!)} {suffix}
              </span>
            ) : draft.length > 3 ? (
              <span className="font-semibold tabular-nums text-ink-2">
                {fmt(num)} {suffix}
              </span>
            ) : hint ? (
              <span className="text-muted-2">{hint}</span>
            ) : null}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-14 flex-1 rounded-2xl bg-surface-soft text-[16px] font-semibold text-ink-2 transition-transform active:scale-[0.98]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={commit}
              className="h-14 flex-[1.4] rounded-2xl bg-blue-600 text-[16px] font-bold text-white transition-transform active:scale-[0.98]"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col justify-end bg-ink/45 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        // max-w: на планшете цифры не разъезжаются на всю ширину экрана
        className="mx-auto flex w-full max-w-[520px] flex-col rounded-t-3xl bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-card-lg animate-sheet-up"
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
