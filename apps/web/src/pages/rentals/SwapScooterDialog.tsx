import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, Search, Wrench, X, ParkingSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useSwapScooter } from "@/lib/api/rentals";
import type { Rental } from "@/lib/mock/rentals";

type OldStatus = "rental_pool" | "repair";

/**
 * Замена скутера в аренде. v0.2.76 — переработан UX.
 *
 *  - Сверху выбор: куда деть старый скутер (готов к аренде / в ремонт).
 *  - В середине плитки доступных скутеров (как на дашборде), сгруппированы
 *    по моделям. Зелёные = свободные в парке.
 *  - Снизу опциональная причина и кнопка «Заменить».
 *
 * Создаётся новая связка (parentRentalId = id текущей) с новым скутером,
 * текущая связка закрывается, срок аренды (endPlannedAt) сохраняется.
 * После успеха родитель открывает превью акта приёма-передачи для новой связки.
 */
export function SwapScooterDialog({
  rental,
  onClose,
  onSwapped,
}: {
  rental: Rental;
  onClose: () => void;
  onSwapped: (newRentalId: number) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [oldStatus, setOldStatus] = useState<OldStatus>("repair");

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

  // Доступные скутеры — только из парка аренды, исключая текущий.
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
      });
  }, [scooters, models, search, rental.scooterId]);

  // Группируем по модели для красивых блоков плиток
  const byModel = useMemo(() => {
    const map = new Map<number | null, typeof available>();
    for (const s of available) {
      const key = s.modelId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    // sort scooters внутри модели по имени
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }
    // Сортируем модели — сначала с большим количеством, затем по имени
    return Array.from(map.entries())
      .map(([modelId, items]) => ({
        modelId,
        modelName:
          modelId == null
            ? "Без модели"
            : models.find((m) => m.id === modelId)?.name ?? "Модель неизвестна",
        items,
      }))
      .sort((a, b) => {
        if (b.items.length !== a.items.length)
          return b.items.length - a.items.length;
        return a.modelName.localeCompare(b.modelName, "ru");
      });
  }, [available, models]);

  const totalCount = available.length;

  const submit = async () => {
    if (!selectedId) {
      toast.error("Не выбран скутер", "Выберите плитку из парка аренды");
      return;
    }
    try {
      const created = await swap.mutateAsync({
        rentalId: rental.id,
        newScooterId: selectedId,
        oldScooterStatus: oldStatus,
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
        oldStatus === "repair"
          ? "Старый отправлен в ремонт. Печатайте акт."
          : "Старый возвращён в парк. Печатайте акт.",
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
          "flex w-full max-w-[820px] max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <ArrowLeftRight size={18} className="text-blue-600" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              Заменить скутер — аренда #
              {String(rental.id).padStart(4, "0")}
            </div>
            <div className="text-[12px] text-muted-2">
              текущий: {rental.scooter} → выберите новый из парка аренды
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

        {/* OLD SCOOTER STATUS CHOICE */}
        <div className="grid grid-cols-2 gap-2 border-b border-border bg-surface-soft/40 px-5 py-3">
          <div className="col-span-2 mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Куда деть текущий скутер ({rental.scooter})
          </div>
          <button
            type="button"
            onClick={() => setOldStatus("rental_pool")}
            className={cn(
              "flex items-start gap-2 rounded-[10px] border px-3 py-2 text-left transition-colors",
              oldStatus === "rental_pool"
                ? "border-green-500 bg-green-soft/60"
                : "border-border bg-white hover:border-green-300",
            )}
          >
            <ParkingSquare
              size={16}
              className={cn(
                "mt-0.5 shrink-0",
                oldStatus === "rental_pool" ? "text-green-700" : "text-muted-2",
              )}
            />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-ink">
                Готов к аренде
              </div>
              <div className="mt-0.5 text-[11px] text-muted-2">
                Скутер свободен — другой клиент может взять его сразу.
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setOldStatus("repair")}
            className={cn(
              "flex items-start gap-2 rounded-[10px] border px-3 py-2 text-left transition-colors",
              oldStatus === "repair"
                ? "border-orange-500 bg-orange-soft/60"
                : "border-border bg-white hover:border-orange-300",
            )}
          >
            <Wrench
              size={16}
              className={cn(
                "mt-0.5 shrink-0",
                oldStatus === "repair" ? "text-orange-700" : "text-muted-2",
              )}
            />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-ink">В ремонт</div>
              <div className="mt-0.5 text-[11px] text-muted-2">
                Скутер уходит из оборота — нужно починить перед сдачей.
              </div>
            </div>
          </button>
        </div>

        {/* SEARCH */}
        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Парк аренды · {totalCount} {pluralUnit(totalCount)}
            </div>
            <div className="relative flex-1 max-w-[280px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск..."
                className="h-8 w-full rounded-[8px] border border-border bg-surface pl-8 pr-3 text-[12px] outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {/* TILE GRID */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {totalCount === 0 ? (
            <div className="rounded-[10px] border border-dashed border-border p-8 text-center text-[12px] text-muted-2">
              Нет доступных скутеров в парке аренды
              {search ? " по этому запросу" : ""}.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {byModel.map((group) => (
                <div key={group.modelId ?? "none"}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <div className="text-[12px] font-bold text-ink">
                      {group.modelName}
                    </div>
                    <div className="text-[11px] text-muted-2">
                      {group.items.length} {pluralUnit(group.items.length)}
                    </div>
                  </div>
                  <div
                    className="grid gap-1.5"
                    style={{
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(54px, 1fr))",
                    }}
                  >
                    {group.items.map((s) => {
                      const isSel = selectedId === s.id;
                      const num = s.name.split("#")[1] ?? s.name;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelectedId(s.id)}
                          title={s.name}
                          className={cn(
                            "flex aspect-square cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 text-[12px] font-bold transition-all hover:-translate-y-0.5",
                            isSel
                              ? "border-blue-600 bg-blue-50 text-blue-700 shadow-card"
                              : "border-green-500/40 bg-green-soft/60 text-green-ink hover:border-green-500",
                          )}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* BOTTOM */}
        <div className="border-t border-border bg-surface-soft px-5 py-3">
          {selectedId ? (
            <div className="mb-2 rounded-[8px] bg-blue-50 px-3 py-2 text-[12px] text-blue-700">
              Выбран:{" "}
              <b>
                {scooters.find((x) => x.id === selectedId)?.name ?? "—"}
              </b>{" "}
              ·{" "}
              {models.find(
                (m) =>
                  m.id ===
                  scooters.find((x) => x.id === selectedId)?.modelId,
              )?.name ?? "модель"}
            </div>
          ) : (
            <div className="mb-2 text-[11px] text-muted-2">
              Кликните на плитку чтобы выбрать новый скутер.
            </div>
          )}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина замены (необязательно)"
            className="h-9 w-full rounded-[10px] border border-border bg-white px-3 text-[12px] outline-none focus:border-blue-600"
          />
          <div className="mt-1.5 text-[11px] text-muted-2">
            Срок аренды (плановый возврат) сохранится. После замены откроется
            превью акта приёма-передачи для нового скутера.
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-white px-4 py-2">
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

function pluralUnit(n: number): string {
  const a = Math.abs(n);
  const n10 = a % 10;
  const n100 = a % 100;
  if (n10 === 1 && n100 !== 11) return "скутер";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "скутера";
  return "скутеров";
}
