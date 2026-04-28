import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useSwapScooter } from "@/lib/api/rentals";
import type { Rental } from "@/lib/mock/rentals";

/**
 * Замена скутера в аренде. v0.2.75.
 *
 * Создаёт новую связку (parentRentalId = текущая) с другим скутером.
 * Текущая связка закрывается, старый скутер уходит в ремонт. После
 * успеха — родитель открывает превью акта приёма-передачи (act_transfer)
 * для новой связки, чтобы оператор сразу распечатал.
 */
export function SwapScooterDialog({
  rental,
  onClose,
  onSwapped,
}: {
  rental: Rental;
  onClose: () => void;
  /** Передаём id новой связки — родитель откроет превью акта. */
  onSwapped: (newRentalId: number) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  const swap = useSwapScooter();

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scooters
      .filter(
        (s) =>
          !s.archivedAt &&
          s.baseStatus === "rental_pool" &&
          s.id !== rental.scooterId,
      )
      .filter((s) => {
        if (!q) return true;
        const m = models.find((mo) => mo.id === s.modelId);
        const hay = `${s.name} ${m?.name ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [scooters, models, search, rental.scooterId]);

  const submit = async () => {
    if (!selectedId) {
      toast.error("Не выбран скутер", "Кликните на скутер из списка");
      return;
    }
    try {
      const created = await swap.mutateAsync({
        rentalId: rental.id,
        newScooterId: selectedId,
        reason: reason.trim() || undefined,
      });
      if (!created || typeof created.id !== "number") {
        toast.error(
          "Не удалось создать связку",
          "API вернул некорректный ответ",
        );
        return;
      }
      toast.success(
        "Скутер заменён",
        "Старый отправлен в ремонт. Печатайте акт приёма-передачи.",
      );
      const newId = created.id;
      requestClose();
      window.setTimeout(() => onSwapped(newId), 200);
    } catch (e) {
      toast.error("Не удалось заменить", (e as Error).message ?? "");
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[120] flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm",
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
      onClick={requestClose}
    >
      <div
        className={cn(
          "flex w-full max-w-[640px] max-h-[88vh] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <ArrowLeftRight size={18} className="text-blue-600" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              Заменить скутер — аренда #
              {String(rental.id).padStart(4, "0")}
            </div>
            <div className="text-[12px] text-muted-2">
              {rental.scooter} → выберите новый из парка аренды
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или модели..."
              className="h-9 w-full rounded-[10px] border border-border bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {available.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-border p-6 text-center text-[12px] text-muted-2">
              Нет доступных скутеров в парке аренды.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {available.map((s) => {
                const m = models.find((mo) => mo.id === s.modelId);
                const isSel = selectedId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-[10px] border px-3 py-2 text-left text-[13px]",
                      isSel
                        ? "border-blue-500 bg-blue-50"
                        : "border-border bg-white hover:border-blue-300",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink">{s.name}</div>
                      <div className="text-[11px] text-muted-2">
                        {m?.name ?? "модель не указана"}
                      </div>
                    </div>
                    {isSel && (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        Выбран
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-surface-soft px-5 py-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Причина замены (необязательно)
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="например: ремонт после повреждения"
            className="h-9 w-full rounded-[10px] border border-border bg-white px-3 text-[13px] outline-none focus:border-blue-600"
          />
          <div className="mt-2 text-[11px] text-muted-2">
            Старый скутер уйдёт в <b>ремонт</b>, срок аренды (плановый возврат)
            сохранится. После замены откроется превью акта приёма-передачи
            для нового скутера.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-[10px] bg-surface-soft px-4 py-2 text-[13px] font-semibold text-ink-2 hover:bg-surface"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!selectedId || swap.isPending}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-blue-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {swap.isPending && <Loader2 size={14} className="animate-spin" />}
            Заменить и распечатать акт
          </button>
        </div>
      </div>
    </div>
  );
}
