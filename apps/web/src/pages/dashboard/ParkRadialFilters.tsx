import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import type { ScooterModel } from "@/lib/api/types";

/**
 * #дашборд: радиальные фильтры парка. Вместо россыпи чипов — две плашки
 * «Модель» и «Статус» слева у заголовка; при наведении варианты раскрываются
 * веером ВВЕРХ по дуге (равные углы, подписи снаружи). Модели — реальными
 * фото (avatarThumbKey), статусы — цветными кружками («не распр.» — «?»).
 * Мультивыбор: тап по варианту переключает его в наборе; «Все»/«всё» очищает.
 * Невидимая зона-мост (fan-box) даёт довести курсор до любого кружка.
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

const MODEL_FAN: { id: ScooterModel; label: string; tx: number; ty: number; side: Side }[] = [
  { id: "jog", label: "Jog", tx: -69, ty: -98, side: "u" },
  { id: "gear", label: "Gear", tx: 0, ty: -120, side: "u" },
  { id: "honda", label: "Honda", tx: 69, ty: -98, side: "u" },
  { id: "tank", label: "Tank", tx: 113, ty: -41, side: "r" },
];
// «Все» — слева внизу дуги (позиция 0).
const ALL_POS = { tx: -113, ty: -41, side: "l" as Side };

const STATUS_FAN: {
  id: ParkStatusId;
  label: string;
  color: string | null;
  mark?: string;
  tx: number;
  ty: number;
  side: Side;
}[] = [
  { id: "rented", label: "в аренде", color: "#378ADD", tx: -158, ty: -64, side: "l" },
  { id: "late_today", label: "опаздывает", color: "#E24B4A", tx: -132, ty: -107, side: "l" },
  { id: "overdue", label: "долг", color: "#A32D2D", tx: -95, ty: -141, side: "l" },
  { id: "returns_today", label: "возврат", color: "#185FA5", tx: -50, ty: -163, side: "u" },
  { id: "pool", label: "готов", color: "#1D9E75", tx: 0, ty: -170, side: "u" },
  { id: "ready", label: "не распр.", color: null, mark: "?", tx: 50, ty: -163, side: "u" },
  { id: "repair", label: "ремонт", color: "#EF9F27", tx: 95, ty: -141, side: "r" },
  { id: "for_sale", label: "продажа", color: "#7F77DD", tx: 132, ty: -107, side: "r" },
  { id: "disassembly", label: "разборка", color: "#2C2C2A", tx: 158, ty: -64, side: "r" },
  { id: "sold", label: "продан", color: "#B26A3D", tx: 169, ty: -15, side: "r" },
];
const STATUS_ALL_POS = { tx: -169, ty: -15, side: "l" as Side };

function labelStyle(side: Side): React.CSSProperties {
  if (side === "u")
    return { bottom: "calc(100% + 5px)", left: "50%", transform: "translateX(-50%)" };
  if (side === "l")
    return { right: "calc(100% + 7px)", top: "50%", transform: "translateY(-50%)" };
  return { left: "calc(100% + 7px)", top: "50%", transform: "translateY(-50%)" };
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
  const [open, setOpen] = useState<null | "model" | "status">(null);
  const { data: models = [] } = useApiScooterModels();

  // enum модели → URL фото (матчим scooter_models по имени; нет — иконка).
  const avatarFor = (id: ScooterModel): string | null => {
    const label = MODEL_LABEL[id] ?? id;
    const m = models.find(
      (x) => x.name.trim().toLowerCase() === label.toLowerCase(),
    );
    if (!m) return null;
    return fileUrl(m.avatarThumbKey ?? m.avatarKey, { variant: "thumb" });
  };

  const modelSummary =
    selectedModels.size === 0
      ? "Все"
      : selectedModels.size === 1
        ? MODEL_LABEL[[...selectedModels][0]!] ?? [...selectedModels][0]!
        : `${selectedModels.size} модели`;
  const statusSummary =
    selectedStatuses.size === 0
      ? "всё"
      : selectedStatuses.size === 1
        ? STATUS_FAN.find((s) => s.id === [...selectedStatuses][0])?.label ?? "—"
        : `${selectedStatuses.size} статуса`;

  return (
    <div className="flex items-center gap-2">
      {/* ── МОДЕЛЬ ── */}
      <div
        className="relative"
        onMouseEnter={() => setOpen("model")}
        onMouseLeave={() => setOpen(null)}
      >
        <Plaque label="Модель" value={modelSummary} active={open === "model"} />
        <Fan open={open === "model"}>
          <FanOpt
            pos={ALL_POS}
            delay={0}
            open={open === "model"}
            label={`Все · ${total}`}
            selected={selectedModels.size === 0}
            onClick={onClearModels}
          >
            <Avatar url={null} fallbackAll />
          </FanOpt>
          {MODEL_FAN.map((m, i) => (
            <FanOpt
              key={m.id}
              pos={m}
              delay={(i + 1) * 55}
              open={open === "model"}
              label={`${m.label}${modelCounts[m.id] ? ` · ${modelCounts[m.id]}` : ""}`}
              selected={selectedModels.has(m.id)}
              onClick={() => onToggleModel(m.id)}
            >
              <Avatar url={avatarFor(m.id)} />
            </FanOpt>
          ))}
        </Fan>
      </div>

      {/* ── СТАТУС ── */}
      <div
        className="relative"
        onMouseEnter={() => setOpen("status")}
        onMouseLeave={() => setOpen(null)}
      >
        <Plaque label="Статус" value={statusSummary} active={open === "status"} />
        <Fan open={open === "status"}>
          <FanOpt
            pos={STATUS_ALL_POS}
            delay={0}
            open={open === "status"}
            label={`всё · ${total}`}
            selected={selectedStatuses.size === 0}
            onClick={onClearStatuses}
          >
            <Dot color="hsl(var(--muted))" />
          </FanOpt>
          {STATUS_FAN.map((s, i) => (
            <FanOpt
              key={s.id}
              pos={s}
              delay={(i + 1) * 28}
              open={open === "status"}
              label={`${s.label}${statusCounts[s.id] ? ` · ${statusCounts[s.id]}` : ""}`}
              selected={selectedStatuses.has(s.id)}
              onClick={() => onToggleStatus(s.id)}
            >
              {s.mark ? <Dot mark={s.mark} /> : <Dot color={s.color!} />}
            </FanOpt>
          ))}
        </Fan>
      </div>
    </div>
  );
}

function Plaque({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
        active
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-border bg-surface text-ink-2 hover:bg-surface-soft",
      )}
    >
      {label}: <span className="text-blue-700">{value}</span>
      <ChevronDown
        size={13}
        className={cn("transition-transform", active && "rotate-180")}
      />
    </button>
  );
}

function Fan({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="absolute left-1/2 z-50 h-[230px] w-[400px] -translate-x-1/2"
      style={{ bottom: "calc(100% + 2px)", pointerEvents: open ? "auto" : "none" }}
    >
      {children}
    </div>
  );
}

function FanOpt({
  pos,
  delay,
  open,
  label,
  selected,
  onClick,
  children,
}: {
  pos: { tx: number; ty: number; side: Side };
  delay: number;
  open: boolean;
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-0 left-1/2 -ml-5 h-10 w-10"
      style={{
        transform: open
          ? `translate(${pos.tx}px, ${pos.ty}px) scale(1)`
          : "translate(0, 12px) scale(0.3)",
        opacity: open ? 1 : 0,
        transition:
          "transform 0.42s cubic-bezier(0.34,1.5,0.5,1), opacity 0.3s",
        transitionDelay: open ? `${delay}ms` : "0ms",
      }}
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-card transition-transform",
          selected
            ? "ring-2 ring-blue-500"
            : "ring-2 ring-border hover:ring-blue-300",
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          "absolute whitespace-nowrap text-[10.5px]",
          selected ? "font-bold text-blue-700" : "text-ink-2",
        )}
        style={labelStyle(pos.side)}
      >
        {label}
      </span>
    </button>
  );
}

function Avatar({ url, fallbackAll }: { url?: string | null; fallbackAll?: boolean }) {
  if (fallbackAll) {
    return (
      <span className="text-[15px] text-muted-2" aria-hidden>
        ▦
      </span>
    );
  }
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-9 w-9 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="text-[15px] text-muted-2" aria-hidden>
      🛵
    </span>
  );
}

function Dot({ color, mark }: { color?: string; mark?: string }) {
  if (mark)
    return (
      <span className="text-[14px] font-bold text-muted-2" aria-hidden>
        {mark}
      </span>
    );
  return (
    <span
      className="h-3.5 w-3.5 rounded-full"
      style={{ background: color }}
    />
  );
}
