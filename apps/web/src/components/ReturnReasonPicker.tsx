import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_RETURN_REASONS,
  useReturnReasons,
  useSaveReturnReasons,
} from "@/lib/returnReasons";
import { confirmDialog, toast } from "@/lib/toast";

/**
 * Пункт 4 — обязательный выбор причины возврата при закрытии аренды.
 *
 * Чипы из растущего справочника + «Свой вариант…» (текст; галка «сохранить
 * в список» добавляет его для будущих закрытий — без подтверждения).
 * Удалить причину из списка — крестик на чипе, с подтверждением.
 * Выбранная причина уходит в аренду и в журнал.
 */
export function ReturnReasonPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string | null;
  onChange: (reason: string | null) => void;
  /** Плотный режим для мобильного мастера. */
  compact?: boolean;
}) {
  const { reasons } = useReturnReasons();
  const save = useSaveReturnReasons();
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [saveToList, setSaveToList] = useState(true);

  const applyCustom = () => {
    const text = customText.trim();
    if (!text) return;
    onChange(text);
    if (saveToList && !reasons.includes(text)) {
      save.mutate([...reasons, text]);
      toast.success("Причина сохранена", "Появится в списке при закрытии аренд.");
    }
    setCustomOpen(false);
  };

  const removeReason = async (r: string) => {
    const ok = await confirmDialog({
      title: "Удалить причину из списка?",
      message: `«${r}» больше не будет предлагаться при закрытии аренды.`,
      confirmText: "Удалить",
    });
    if (!ok) return;
    save.mutate(reasons.filter((x) => x !== r));
    if (value === r) onChange(null);
  };

  const customSelected = !!value && !reasons.includes(value);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5",
          compact ? "mb-1.5" : "mb-2",
        )}
      >
        <span
          className={cn(
            "font-bold uppercase tracking-wider text-muted-2",
            compact ? "text-[10.5px]" : "text-[11px]",
          )}
        >
          Причина возврата
        </span>
        <span className="rounded-full bg-red-soft px-1.5 py-px text-[9.5px] font-bold uppercase text-red-ink">
          обязательно
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {reasons.map((r) => {
          const active = value === r;
          const isCustomReason = !DEFAULT_RETURN_REASONS.includes(r);
          return (
            <span key={r} className="group/chip relative inline-flex">
              <button
                type="button"
                onClick={() => onChange(active ? null : r)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                  compact ? "h-9" : "h-10",
                  active
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-border bg-surface text-ink-2 hover:border-blue-300 hover:bg-blue-50/50",
                )}
              >
                {active && <Check size={13} />}
                {r}
              </button>
              {/* Удаление своей причины — с подтверждением. */}
              {isCustomReason && !active && (
                <button
                  type="button"
                  onClick={() => removeReason(r)}
                  title="Удалить из списка"
                  className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-soft text-red-ink shadow-sm group-hover/chip:flex"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          );
        })}

        {/* Свой вариант */}
        {customSelected ? (
          <button
            type="button"
            onClick={() => {
              setCustomText(value ?? "");
              setCustomOpen(true);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-blue-500 bg-blue-600 px-3 text-[12.5px] font-semibold text-white",
              compact ? "h-9" : "h-10",
            )}
          >
            <Check size={13} />
            {value}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-[12.5px] font-semibold text-muted transition-colors hover:border-blue-300 hover:text-blue-700",
              compact ? "h-9" : "h-10",
            )}
          >
            <Plus size={13} /> Свой вариант
          </button>
        )}
      </div>

      {customOpen && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-surface-soft p-2.5">
          <input
            autoFocus
            value={customText}
            onChange={(e) => setCustomText(e.target.value.slice(0, 120))}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            placeholder="Например: переехал в другой город"
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-blue-500"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={saveToList}
                onChange={(e) => setSaveToList(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              Сохранить в список
            </label>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!customText.trim()}
              className="h-9 rounded-lg bg-ink px-4 text-[12.5px] font-bold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
            >
              Выбрать
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
