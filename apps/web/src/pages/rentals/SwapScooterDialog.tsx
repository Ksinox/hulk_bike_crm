import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApiRentals, useSwapScooter } from "@/lib/api/rentals";
import { MODEL_LABEL, type Rental } from "@/lib/mock/rentals";
import { SCOOTER_BASE_STATUS_OPTIONS } from "@/pages/fleet/scooterStatusOptions";
import type { ApiScooter, ScooterBaseStatus } from "@/lib/api/types";
import { ScooterPosterAvatar } from "./ScooterPosterAvatar";

type OldStatus = ScooterBaseStatus;

/**
 * Замена скутера в аренде. v0.2.79 — двухколоночный layout.
 *
 *  Сверху: «текущий скутер» — стрелка — «новый скутер» (плейсхолдер до
 *  выбора, потом — постер-аватарка с моделью и номером).
 *
 *  Снизу под левым: picker статуса для старого скутера (7 вариантов).
 *  Снизу под правым: парк свободных скутеров плитками (как на дашборде),
 *  сгруппированы по моделям. Клик подставляет скутер в правую карточку.
 *
 *  Причина замены — обязательное поле (заметка о том, что произошло).
 *  При успехе создаётся child-связка, открывается превью акта приёма-
 *  передачи (см. RentalCard).
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
  const [reasonError, setReasonError] = useState(false);

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
  const { data: allRentals = [] } = useApiRentals();
  const swap = useSwapScooter();

  // ID всех скутеров, которые сейчас фактически заняты — у них есть
  // открытая аренда (active/overdue/returning). У такого скутера
  // baseStatus может быть «rental_pool» (потому что мы не меняем
  // baseStatus при выдаче — занятость задаётся наличием rental). Без
  // этого фильтра picker замены показывал бы свободные ВПЕРЕМЕЖКУ с
  // занятыми, и оператор мог бы случайно выдать клиенту скутер,
  // которым уже пользуется другой.
  const busyScooterIds = useMemo(() => {
    const set = new Set<number>();
    allRentals.forEach((r) => {
      if (r.scooterId == null) return;
      if (
        r.status === "active" ||
        r.status === "overdue" ||
        r.status === "returning"
      ) {
        set.add(r.scooterId);
      }
    });
    return set;
  }, [allRentals]);

  // Текущий скутер из API (нужен ApiScooter для постер-аватарки).
  const currentScooter = useMemo(
    () =>
      rental.scooterId != null
        ? scooters.find((s) => s.id === rental.scooterId) ?? null
        : null,
    [scooters, rental.scooterId],
  );

  // Доступные скутеры — только из парка аренды, исключая текущий
  // И исключая фактически занятые (есть открытая аренда). См. busyScooterIds.
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scooters
      .filter(
        (s) =>
          !s.archivedAt &&
          s.baseStatus === "rental_pool" &&
          s.id !== rental.scooterId &&
          !busyScooterIds.has(s.id),
      )
      .filter((s) => {
        if (!q) return true;
        const linked = models.find((mo) => mo.id === s.modelId);
        const label = linked?.name ?? MODEL_LABEL[s.model] ?? "";
        const hay = `${s.name} ${label}`.toLowerCase();
        return hay.includes(q);
      });
  }, [scooters, models, search, rental.scooterId, busyScooterIds]);

  // Группировка по enum-полю s.model — оно заполнено всегда (в отличие
  // от опционального modelId). Для имени группы предпочитаем
  // справочник scooter_models если у всех скутеров группы одна FK.
  const byModel = useMemo(() => {
    const map = new Map<string, typeof available>();
    for (const s of available) {
      const arr = map.get(s.model) ?? [];
      arr.push(s);
      map.set(s.model, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }
    return Array.from(map.entries())
      .map(([modelEnum, items]) => {
        const firstModelId = items[0]?.modelId;
        const sameFk =
          firstModelId != null &&
          items.every((it) => it.modelId === firstModelId);
        const linked = sameFk
          ? models.find((m) => m.id === firstModelId)
          : null;
        const modelName =
          linked?.name ??
          MODEL_LABEL[modelEnum as keyof typeof MODEL_LABEL] ??
          modelEnum;
        return { modelEnum, modelName, items };
      })
      .sort((a, b) => {
        if (b.items.length !== a.items.length)
          return b.items.length - a.items.length;
        return a.modelName.localeCompare(b.modelName, "ru");
      });
  }, [available, models]);

  const totalCount = available.length;
  const newScooter = useMemo(
    () =>
      selectedId != null
        ? scooters.find((s) => s.id === selectedId) ?? null
        : null,
    [scooters, selectedId],
  );

  const submit = async () => {
    if (!selectedId) {
      toast.error("Не выбран скутер", "Кликните плитку из парка аренды");
      return;
    }
    if (!reason.trim()) {
      setReasonError(true);
      toast.error(
        "Нужна причина замены",
        "Опишите кратко: что случилось со скутером?",
      );
      return;
    }
    try {
      const updated = await swap.mutateAsync({
        rentalId: rental.id,
        newScooterId: selectedId,
        oldScooterStatus: oldStatus,
        reason: reason.trim(),
      });
      // Замена теперь in-place: API меняет scooterId в текущей аренде,
      // новой связки не создаётся. Возвращается обновлённый rental
      // с тем же id. Для совместимости с onSwapped (ожидает rentalId
      // для превью акта) передаём rental.id — превью покажет акт замены
      // именно для этой аренды.
      const statusLabel =
        SCOOTER_BASE_STATUS_OPTIONS.find((o) => o.value === oldStatus)?.label ??
        oldStatus;
      toast.success(
        "Скутер заменён",
        `Старый → «${statusLabel}». Печатайте акт приёма-передачи.`,
      );
      const previewId = updated?.id ?? rental.id;
      requestClose();
      window.setTimeout(() => onSwapped(previewId), 200);
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
    >
      <div
        className={cn(
          "flex w-full max-w-[1080px] max-h-[94vh] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg",
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center gap-3 border-b border-border bg-surface-soft px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink">
              Замена скутера — аренда #
              {String(rental.id).padStart(4, "0")}
            </div>
            <div className="text-[12px] text-muted-2">
              Подберите новый скутер из парка и обязательно укажите причину.
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

        {/* TOP: TWO POSTER CARDS WITH ARROW */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border bg-white px-6 py-5">
          {/* Current scooter */}
          <div className="flex items-center gap-4">
            <ScooterPosterAvatar scooter={currentScooter} size="md" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                Текущий
              </div>
              <div className="mt-0.5 font-display text-[18px] font-extrabold leading-tight text-ink">
                {rental.scooter}
              </div>
              <div className="text-[12px] text-muted-2">
                {(() => {
                  if (!currentScooter) return MODEL_LABEL[rental.model];
                  const linked = models.find(
                    (m) => m.id === currentScooter.modelId,
                  );
                  return (
                    linked?.name ?? MODEL_LABEL[currentScooter.model] ?? "—"
                  );
                })()}
              </div>
              {currentScooter?.mileage != null && (
                <div className="mt-1 text-[11px] text-muted-2">
                  Пробег: {currentScooter.mileage.toLocaleString("ru-RU")} км
                </div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <ArrowRight size={32} className="text-blue-600" />

          {/* New scooter (placeholder until selected) */}
          <div className="flex items-center gap-4">
            <ScooterPosterAvatar
              scooter={newScooter}
              size="md"
              highlighted={!!newScooter}
            />
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                Новый
              </div>
              {newScooter ? (
                <>
                  <div className="mt-0.5 font-display text-[18px] font-extrabold leading-tight text-blue-700">
                    {newScooter.name}
                  </div>
                  <div className="text-[12px] text-muted-2">
                    {(() => {
                      const linked = models.find(
                        (m) => m.id === newScooter.modelId,
                      );
                      return (
                        linked?.name ?? MODEL_LABEL[newScooter.model] ?? "—"
                      );
                    })()}
                  </div>
                  {newScooter.mileage != null && (
                    <div className="mt-1 text-[11px] text-muted-2">
                      Пробег: {newScooter.mileage.toLocaleString("ru-RU")} км
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-0.5 text-[14px] font-semibold text-muted-2">
                  Кликните плитку справа →
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM: TWO COLUMNS (status picker | park grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 overflow-hidden">
          {/* LEFT: status picker */}
          <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
            <div className="border-b border-border bg-surface-soft/50 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Куда деть текущий скутер ({rental.scooter})
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-1">
                {SCOOTER_BASE_STATUS_OPTIONS.map((o) => {
                  const active = o.value === oldStatus;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setOldStatus(o.value)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors",
                        active
                          ? "bg-blue-50 ring-1 ring-inset ring-blue-600/40"
                          : "hover:bg-surface-soft",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                          active
                            ? "bg-blue-600 text-white"
                            : "border border-border bg-white",
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
            </div>
          </div>

          {/* RIGHT: park grid */}
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-soft/50 px-5 py-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Парк аренды · {totalCount} {pluralUnit(totalCount)}
              </div>
              <div className="relative w-[200px]">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-2"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск..."
                  className="h-7 w-full rounded-[8px] border border-border bg-white pl-7 pr-2 text-[12px] outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {totalCount === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border p-8 text-center text-[12px] text-muted-2">
                  Нет доступных скутеров в парке аренды
                  {search ? " по этому запросу" : ""}.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {byModel.map((group) => (
                    <ParkGroup
                      key={group.modelEnum}
                      title={group.modelName}
                      items={group.items}
                      selectedId={selectedId}
                      onPick={setSelectedId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* REASON + ACTIONS */}
        <div className="border-t border-border bg-surface-soft px-5 py-3">
          <label className="block">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Причина замены <span className="text-red-600">*</span>
            </div>
            <input
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError && e.target.value.trim())
                  setReasonError(false);
              }}
              placeholder="например: сломалась амортизация, клиент пожаловался на тормоза"
              className={cn(
                "h-9 w-full rounded-[10px] border bg-white px-3 text-[12px] outline-none",
                reasonError
                  ? "border-red-500 focus:border-red-600"
                  : "border-border focus:border-blue-600",
              )}
            />
            <div className="mt-1 text-[11px] text-muted-2">
              Заметка останется в истории — при наведении на скутер в блоке
              «Ранее в этой аренде» она будет видна оператору.
            </div>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-white px-4 py-2">
          <div className="text-[11px] text-muted-2">
            Срок аренды (плановый возврат) сохраняется. После замены —
            превью акта приёма-передачи.
          </div>
          <div className="flex items-center gap-2">
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
    </div>
  );
}

function ParkGroup({
  title,
  items,
  selectedId,
  onPick,
}: {
  title: string;
  items: ApiScooter[];
  selectedId: number | null;
  onPick: (id: number) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <div className="text-[12px] font-bold text-ink">{title}</div>
        <div className="text-[11px] text-muted-2">
          {items.length} {pluralUnit(items.length)}
        </div>
      </div>
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
        }}
      >
        {items.map((s) => {
          const isSel = selectedId === s.id;
          const num = s.name.split("#")[1] ?? s.name;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
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
