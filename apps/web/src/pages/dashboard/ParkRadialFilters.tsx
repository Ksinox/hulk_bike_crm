import { useState } from "react";
import { Bike, LayoutGrid, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import type { ScooterModel } from "@/lib/api/types";

/**
 * #дашборд: единый фильтр парка «фильтр-ядро». В полоске «Парк» — один элемент
 * с иконкой фильтра; при наведении ОТ НЕГО разлетается полукруг ПОВЕРХ блоков
 * (абсолютный оверлей, z-50 — не растит layout): статусы по внешней дуге,
 * модели по внутренней (в пустоте середины). Модели — реальные фото
 * (avatarThumbKey, иконка-fallback), статусы — цветные кружки («не распр.» — «?»,
 * «продан» — отдельный цвет). Мультивыбор (Set), «Все»/«всё» очищает. Подписи
 * снаружи кружков, на большой белой подложке-полукруге.
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

type Side = "u" | "l" | "r";

// Внешняя дуга — статусы (R=190, дуга ~172°). id="all" = очистить.
const STATUS_RING: {
  id: ParkStatusId | "all";
  label: string;
  color: string | null;
  mark?: string;
  tx: number;
  ty: number;
  side: Side;
}[] = [
  { id: "all", label: "всё", color: "hsl(var(--muted))", tx: -190, ty: -13, side: "l" },
  { id: "rented", label: "в аренде", color: "#378ADD", tx: -177, ty: -69, side: "l" },
  { id: "late_today", label: "опаздывает", color: "#E24B4A", tx: -149, ty: -118, side: "l" },
  { id: "overdue", label: "долг", color: "#A32D2D", tx: -107, ty: -157, side: "l" },
  { id: "returns_today", label: "возврат", color: "#185FA5", tx: -57, ty: -181, side: "u" },
  { id: "pool", label: "готов", color: "#1D9E75", tx: 0, ty: -190, side: "u" },
  { id: "ready", label: "не распр.", color: null, mark: "?", tx: 57, ty: -181, side: "u" },
  { id: "repair", label: "ремонт", color: "#EF9F27", tx: 107, ty: -157, side: "r" },
  { id: "for_sale", label: "продажа", color: "#7F77DD", tx: 149, ty: -118, side: "r" },
  { id: "disassembly", label: "разборка", color: "#2C2C2A", tx: 177, ty: -69, side: "r" },
  { id: "sold", label: "продан", color: "#B26A3D", tx: 190, ty: -13, side: "r" },
];

// Внутренняя дуга — модели (R=98). id="all" = очистить.
const MODEL_RING: { id: ScooterModel | "all"; label: string; tx: number; ty: number }[] = [
  { id: "all", label: "Все", tx: -92, ty: -34 },
  { id: "jog", label: "Jog", tx: -56, ty: -80 },
  { id: "gear", label: "Gear", tx: 0, ty: -98 },
  { id: "honda", label: "Honda", tx: 56, ty: -80 },
  { id: "tank", label: "Tank", tx: 92, ty: -34 },
];

const PAD_RADIUS = 292;

function sideLabelStyle(side: Side): React.CSSProperties {
  if (side === "u")
    return { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" };
  if (side === "l")
    return { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" };
  return { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" };
}

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
  const countFor = (id: string) =>
    id === "all" ? total : statusCounts[id] ?? 0;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Фильтр-ядро в полоске «Парк» */}
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
        Фильтр
        {active > 0 && (
          <span className="rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white">
            {active}
          </span>
        )}
      </button>

      {/* Оверлей-полукруг: разлетается ОТ ядра ПОВЕРХ блоков (z-50). */}
      <div
        className="absolute left-1/2 z-50 -translate-x-1/2"
        style={{
          bottom: "calc(100% + 8px)",
          width: PAD_RADIUS * 2 + 20,
          height: PAD_RADIUS + 24,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* белая подложка-полукруг */}
        <div
          className="absolute bottom-0 left-1/2 border border-border bg-surface shadow-card-lg"
          style={{
            width: PAD_RADIUS * 2,
            height: PAD_RADIUS,
            marginLeft: -PAD_RADIUS,
            borderRadius: `${PAD_RADIUS}px ${PAD_RADIUS}px 0 0`,
            opacity: open ? 1 : 0,
            transform: open ? "scale(1)" : "scale(0.55)",
            transformOrigin: "bottom center",
            transition:
              "opacity 0.25s, transform 0.32s cubic-bezier(0.34,1.4,0.5,1)",
          }}
          aria-hidden
        />

        {/* Статусы — внешняя дуга */}
        {STATUS_RING.map((s, i) => {
          const selected =
            s.id === "all"
              ? selectedStatuses.size === 0
              : selectedStatuses.has(s.id);
          return (
            <Opt
              key={s.id}
              tx={s.tx}
              ty={s.ty}
              side={s.side}
              open={open}
              delay={i * 26}
              size={38}
              selected={selected}
              label={`${s.label}${countFor(s.id) ? ` · ${countFor(s.id)}` : ""}`}
              onClick={() =>
                s.id === "all" ? onClearStatuses() : onToggleStatus(s.id)
              }
            >
              {s.mark ? (
                <span className="text-[16px] font-bold text-muted-2">{s.mark}</span>
              ) : (
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ background: s.color! }}
                />
              )}
            </Opt>
          );
        })}

        {/* Модели — внутренняя дуга */}
        {MODEL_RING.map((m, i) => {
          const selected =
            m.id === "all"
              ? selectedModels.size === 0
              : selectedModels.has(m.id);
          const cnt = m.id === "all" ? total : modelCounts[m.id] ?? 0;
          return (
            <Opt
              key={m.id}
              tx={m.tx}
              ty={m.ty}
              side="u"
              open={open}
              delay={i * 26}
              size={44}
              selected={selected}
              label={`${m.label}${cnt ? ` · ${cnt}` : ""}`}
              onClick={() =>
                m.id === "all" ? onClearModels() : onToggleModel(m.id)
              }
            >
              {m.id === "all" ? (
                <LayoutGrid size={18} className="text-muted-2" />
              ) : avatarFor(m.id) ? (
                <img
                  src={avatarFor(m.id)!}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <Bike size={18} className="text-muted-2" />
              )}
            </Opt>
          );
        })}
      </div>
    </div>
  );
}

function Opt({
  tx,
  ty,
  side,
  open,
  delay,
  size,
  selected,
  label,
  onClick,
  children,
}: {
  tx: number;
  ty: number;
  side: Side;
  open: boolean;
  delay: number;
  size: number;
  selected: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-0 left-1/2"
      style={{
        width: size,
        height: size,
        marginLeft: -size / 2,
        transform: open
          ? `translate(${tx}px, ${ty}px) scale(1)`
          : "translate(0, 10px) scale(0.2)",
        opacity: open ? 1 : 0,
        transition:
          "transform 0.42s cubic-bezier(0.34,1.5,0.5,1), opacity 0.3s",
        transitionDelay: open ? `${delay}ms` : "0ms",
      }}
    >
      <span
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface shadow-card transition-transform hover:scale-110",
          selected ? "ring-2 ring-blue-500" : "ring-2 ring-border",
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          "absolute whitespace-nowrap text-[12px]",
          selected ? "font-bold text-blue-700" : "font-medium text-ink-2",
        )}
        style={sideLabelStyle(side)}
      >
        {label}
      </span>
    </button>
  );
}
