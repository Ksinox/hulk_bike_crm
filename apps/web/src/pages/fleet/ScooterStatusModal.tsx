import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePatchScooter } from "@/lib/api/scooters";
import type { ApiScooter, ScooterBaseStatus } from "@/lib/api/types";

const OPTIONS: { id: ScooterBaseStatus; label: string; hint: string }[] = [
  { id: "ready", label: "Не распределён", hint: "Свежий, ещё не решено что с ним" },
  { id: "rental_pool", label: "Парк аренды", hint: "Готов к сдаче в аренду" },
  { id: "repair", label: "Ремонт", hint: "Находится на обслуживании" },
  { id: "buyout", label: "Выкуп", hint: "В рассрочку у клиента" },
  { id: "for_sale", label: "На продаже", hint: "Выставлен к продаже" },
  { id: "sold", label: "Продан", hint: "Из оборота выбыл" },
  {
    id: "disassembly",
    label: "В разборке",
    hint: "Пошёл на запчасти, учитывается в парке",
  },
];

export function ScooterStatusModal({
  scooter,
  onClose,
}: {
  scooter: ApiScooter;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<ScooterBaseStatus>(scooter.baseStatus);
  const patch = usePatchScooter();

  const submit = async () => {
    if (selected === scooter.baseStatus) return onClose();
    await patch.mutateAsync({ id: scooter.id, patch: { baseStatus: selected } });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-[480px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Статус скутера
            </div>
            <div className="text-[15px] font-bold text-ink">{scooter.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-1 px-3 py-3">
          {OPTIONS.map((o) => {
            const active = o.id === selected;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelected(o.id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-blue-50 ring-1 ring-inset ring-blue-600/40"
                    : "hover:bg-surface-soft",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full",
                    active
                      ? "bg-blue-600 text-white"
                      : "border border-border",
                  )}
                >
                  {active && <Check size={12} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-[13px] font-bold",
                      active ? "text-blue-700" : "text-ink",
                    )}
                  >
                    {o.label}
                  </div>
                  <div className="text-[11px] text-muted">{o.hint}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold hover:bg-border"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={patch.isPending || selected === scooter.baseStatus}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
              patch.isPending || selected === scooter.baseStatus
                ? "cursor-not-allowed bg-surface text-muted-2"
                : "bg-ink text-white hover:bg-blue-600",
            )}
          >
            {patch.isPending && <Loader2 size={14} className="animate-spin" />}
            Сохранить статус
          </button>
        </div>
      </div>
    </div>
  );
}
