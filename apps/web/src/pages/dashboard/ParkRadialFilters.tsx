import { useState } from "react";
import { Bike, ChevronDown, LayoutGrid, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import type { ScooterModel } from "@/lib/api/types";

/**
 * #дашборд: фильтр парка — кнопка «Фильтры» в шапке, по наведению выпадает
 * поповер в ДВЕ КОЛОНКИ: слева «Модель» (аватарки-кнопки, реальные фото),
 * справа «Статус» (список-чипсы с цветными точками). Мультивыбор (Set),
 * «Все»/«всё» очищает. Прозрачный мост (pt) не даёт поповеру схлопнуться,
 * пока ведёшь курсор. (Имя файла историческое — раньше был радиальный.)
 */
export type ParkStatusId =
  | "rented"
  | "late_today"
  | "overdue"
  | "returns_today"
  | "pool"
  | "ready"
  | "repair"
  | "for_sale"
  | "disassembly"
  | "sold";

const MODELS: { id: ScooterModel; label: string }[] = [
  { id: "jog", label: "Jog" },
  { id: "gear", label: "Gear" },
  { id: "honda", label: "Honda" },
  { id: "tank", label: "Tank" },
];

const STATUSES: { id: ParkStatusId; label: string; color: string }[] = [
  { id: "rented", label: "в аренде", color: "#378ADD" },
  { id: "late_today", label: "опаздывает", color: "#E24B4A" },
  { id: "overdue", label: "долг", color: "#A32D2D" },
  { id: "returns_today", label: "возврат сегодня", color: "#185FA5" },
  { id: "pool", label: "готов к аренде", color: "#1D9E75" },
  { id: "ready", label: "не распределён", color: "#B4B2A9" },
  { id: "repair", label: "ремонт", color: "#EF9F27" },
  { id: "for_sale", label: "продажа", color: "#7F77DD" },
  { id: "disassembly", label: "разборка", color: "#2C2C2A" },
  { id: "sold", label: "продан", color: "#B26A3D" },
];

export function ParkRadialFilters({
  total,
  modelCounts,
  statusCounts,
  selectedModels,
  selectedStatuses,
  onToggleModel,
  onClearModels,
  onToggleStatus,
  onClearStatuses,
}: {
  total: number;
  modelCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  selectedModels: Set<ScooterModel>;
  selectedStatuses: Set<ParkStatusId>;
  onToggleModel: (id: ScooterModel) => void;
  onClearModels: () => void;
  onToggleStatus: (id: ParkStatusId) => void;
  onClearStatuses: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: models = [] } = useApiScooterModels();

  const avatarFor = (id: ScooterModel): string | null => {
    const label = MODEL_LABEL[id] ?? id;
    const m = models.find(
      (x) => x.name.trim().toLowerCase() === label.toLowerCase(),
    );
    return m ? fileUrl(m.avatarThumbKey ?? m.avatarKey, { variant: "thumb" }) : null;
  };

  const active = selectedModels.size + selectedStatuses.size;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-2 rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold transition-colors",
          open || active > 0
            ? "border-blue-500 bg-blue-50 text-blue-700"
            : "border-border bg-surface text-ink-2 hover:bg-surface-soft",
        )}
      >
        <SlidersHorizontal size={16} />
        Фильтры
        {active > 0 && (
          <span className="rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white">
            {active}
          </span>
        )}
        <ChevronDown
          size={13}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        // прозрачный мост сверху (pt-2) — чтобы курсор доезжал до поповера
        <div className="absolute right-0 top-full z-50 pt-2">
          <div className="flex overflow-hidden rounded-xl border border-border bg-surface shadow-card-lg">
            {/* ── МОДЕЛЬ ── */}
            <div className="border-r border-border p-3.5">
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Модель
              </div>
              <div className="grid w-[200px] grid-cols-3 gap-x-2 gap-y-3">
                <ModelItem
                  label="Все"
                  count={total}
                  selected={selectedModels.size === 0}
                  onClick={onClearModels}
                >
                  <LayoutGrid size={19} className="text-muted-2" />
                </ModelItem>
                {MODELS.map((m) => (
                  <ModelItem
                    key={m.id}
                    label={m.label}
                    count={modelCounts[m.id] ?? 0}
                    selected={selectedModels.has(m.id)}
                    onClick={() => onToggleModel(m.id)}
                  >
                    {avatarFor(m.id) ? (
                      <img
                        src={avatarFor(m.id)!}
                        alt=""
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <Bike size={19} className="text-muted-2" />
                    )}
                  </ModelItem>
                ))}
              </div>
            </div>

            {/* ── СТАТУС ── */}
            <div className="p-3.5">
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
                Статус
              </div>
              <div className="flex w-[210px] flex-col gap-0.5">
                <StatusRow
                  label="всё"
                  count={total}
                  dot="hsl(var(--muted))"
                  selected={selectedStatuses.size === 0}
                  onClick={onClearStatuses}
                />
                {STATUSES.map((s) => (
                  <StatusRow
                    key={s.id}
                    label={s.label}
                    count={statusCounts[s.id] ?? 0}
                    dot={s.color}
                    selected={selectedStatuses.has(s.id)}
                    onClick={() => onToggleStatus(s.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelItem({
  label,
  count,
  selected,
  onClick,
  children,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5"
    >
      {/* relative-обёртка БЕЗ overflow — чтобы бейдж лёг ПОВЕРХ круга, а не
          обрезался ободком (overflow-hidden живёт только на самом круге). */}
      <span className="relative">
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-surface-soft ring-2 transition-all",
            selected ? "ring-blue-500" : "ring-border hover:ring-blue-300",
          )}
        >
          {children}
        </span>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
            {count}
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-[12px]",
          selected ? "font-bold text-blue-700" : "font-medium text-ink-2",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function StatusRow({
  label,
  count,
  dot,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  dot: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-[13px] transition-colors",
        selected
          ? "bg-blue-50 font-semibold text-blue-700"
          : "text-ink-2 hover:bg-surface-soft",
      )}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: dot }}
      />
      <span className="flex-1">{label}</span>
      {count > 0 && (
        <span className="text-[11px] font-medium text-muted-2">{count}</span>
      )}
    </button>
  );
}
