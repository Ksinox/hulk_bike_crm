import { useMemo, useState } from "react";
import { Bike, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import { useApiRentals } from "@/lib/api/rentals";
import { useApiScooters, usePatchScooter } from "@/lib/api/scooters";
import type { ApiScooter, ScooterModel } from "@/lib/api/types";
import type { DashboardMetrics } from "./useDashboardMetrics";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { navigate } from "@/app/navigationStore";
import { ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import {
  ParkTileHoverCard,
  useTileHoverPreview,
} from "./ParkTileHoverCard";

/** Статус плитки — производный от baseStatus скутера + активной аренды. */
type TileStatus =
  | "rented"
  | "overdue" // просрочка по дате (вчера и раньше) ИЛИ долг по ущербу — красная
  | "late_today" // возврат сегодня, но время уже прошло — жёлтая (предупреждение). v0.2.99
  | "returning" // на возврате — физически у клиента или в процессе приёма
  | "ready" // не распределён (baseStatus=ready)
  | "pool" // в парке аренды, свободен к сдаче (baseStatus=rental_pool, без активной аренды)
  | "repair"
  | "for_sale"
  | "sold"
  | "disassembly";

type ModelFilter = "all" | ScooterModel;
type StatusFilter = "all" | TileStatus | "returns_today";

const MODEL_CHIPS: { id: ModelFilter; label: string }[] = [
  { id: "all", label: "Все модели" },
  { id: "jog", label: "Jog" },
  { id: "gear", label: "Gear" },
  { id: "honda", label: "Honda" },
  { id: "tank", label: "Tank" },
];

const STATUS_CHIPS: { id: StatusFilter; label: string; swatch: string }[] = [
  { id: "all", label: "всё", swatch: "hsl(var(--muted))" },
  { id: "rented", label: "активная аренда", swatch: "hsl(var(--blue))" },
  // Чип «опаздывает» — фоном синий (плитка остаётся синей), но
  // визуально swatch — красный, чтобы соответствовать пульсирующему
  // свечению на плитке.
  { id: "late_today", label: "опаздывает", swatch: "hsl(var(--red))" },
  { id: "overdue", label: "просрочка / ущерб", swatch: "hsl(var(--red))" },
  { id: "returns_today", label: "возврат сегодня", swatch: "hsl(var(--blue-600))" },
  { id: "pool", label: "готов к аренде", swatch: "hsl(var(--green))" },
  { id: "ready", label: "не распределён", swatch: "hsl(var(--border-strong))" },
  { id: "repair", label: "ремонт", swatch: "hsl(var(--orange))" },
  { id: "for_sale", label: "продажа", swatch: "hsl(var(--purple))" },
  { id: "disassembly", label: "разборка", swatch: "hsl(var(--ink))" },
  { id: "sold", label: "продан", swatch: "hsl(var(--border))" },
];

// Лейблы статусов — раньше использовались в title-tooltip плиток.
// После v0.3.2 нативный tooltip убран в пользу ParkTileHoverCard;
// оставляем константу для возможного использования в других местах
// (счётчики чипов, фильтры и т.п.).
const STATUS_LABEL: Record<TileStatus, string> = {
  rented: "активная аренда",
  overdue: "просрочен",
  late_today: "опаздывает (возврат сегодня, время прошло)",
  returning: "на возврате",
  ready: "не распределён",
  pool: "готов к аренде",
  repair: "в ремонте",
  for_sale: "на продаже",
  sold: "продан",
  disassembly: "в разборке",
};

export function ParkPanel({
  className,
  metrics,
  onOpenRental,
}: {
  className?: string;
  metrics: DashboardMetrics;
  /**
   * Если задан — клик по плитке с активной/просроченной/late_today
   * арендой откроет drawer вместо перехода на страницу аренд. Дашборд
   * передаёт эту функцию из своего DrawerContext (v0.3.1).
   */
  onOpenRental?: (rentalId: number) => void;
}) {
  const scootersQ = useApiScooters();
  const rentalsQ = useApiRentals();
  const patchScooter = usePatchScooter();
  const [model, setModel] = useState<ModelFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [cols, setCols] = useState(12);
  /** Открыта форма «Оформить аренду», с преднабранным скутером */
  const [newRentalFor, setNewRentalFor] = useState<string | null>(null);
  /** Открыт диалог «Распределить скутер» (поменять статус у 'ready') */
  const [reassignFor, setReassignFor] = useState<ApiScooter | null>(null);
  /** Hover-preview на плитках — лёгкое окошко с фото и инфо. */
  const hover = useTileHoverPreview();

  const tiles = useMemo(() => {
    const scooters = scootersQ.data ?? [];
    const rentals = rentalsQ.data ?? [];

    // Скутер «занят» (числится в аренде на дашборде) пока существует
    // открытая аренда — active / overdue / returning. Возврат тоже
    // «занятость», потому что физически скутер ещё не принят и решение
    // по нему не вынесено (ущерб? состояние? залог?). До закрытия аренды
    // он не свободен.
    const activeByScooter = new Map<
      number,
      "active" | "overdue" | "returning"
    >();
    rentals.forEach((r) => {
      if (r.scooterId == null) return;
      if (r.status === "active") activeByScooter.set(r.scooterId, "active");
      if (r.status === "overdue") activeByScooter.set(r.scooterId, "overdue");
      if (r.status === "returning")
        activeByScooter.set(r.scooterId, "returning");
    });

    const activeRentalByScooter = new Map<number, number>();
    rentals.forEach((r) => {
      if (r.scooterId == null) return;
      if (
        r.status === "active" ||
        r.status === "overdue" ||
        r.status === "returning"
      )
        activeRentalByScooter.set(r.scooterId, r.id);
    });

    // v0.2.96: проверяем флаги ПО scooterId напрямую — не через Map
    // <scooter, rentalId>, который теряет ситуации с >1 активной записью
    // на одном скутере (легаси-данные после миграций swap/extend).
    const overdueScooters = metrics.overdueScooterIds;
    const damageScooters = metrics.damageDebtScooterIds;
    const returnsTodayScooters = metrics.returnsTodayScooterIds;
    const lateTodayScooters = metrics.pastDueTodayScooterIds;

    return scooters.map((s) => {
      const isOverdue = overdueScooters.has(s.id);
      const hasDamage = damageScooters.has(s.id);
      const isReturnToday = returnsTodayScooters.has(s.id);
      const isLateToday = lateTodayScooters.has(s.id);
      // v0.2.97: вместо одного rentalId из «прошлой» Map<scooter,rental>
      // выбираем тот, ИЗ-ЗА которого плитка подсвечена. Иначе кликом
      // оператор попадал не туда (на скутере мог быть «дубль» активных
      // аренд из легаси-данных, см. duplicateActiveByScooter).
      const rentalId =
        metrics.overdueRentalByScooter.get(s.id) ??
        metrics.damageDebtRentalByScooter.get(s.id) ??
        metrics.returnsTodayRentalByScooter.get(s.id) ??
        metrics.anyActiveRentalByScooter.get(s.id) ??
        activeRentalByScooter.get(s.id) ??
        null;
      return {
        id: s.id,
        name: s.name,
        model: s.model,
        status: computeTileStatus(s, activeByScooter.get(s.id), {
          isOverdue,
          hasDamage,
          isLateToday,
        }),
        rentalId,
        isReturnToday,
      };
    });
  }, [
    scootersQ.data,
    rentalsQ.data,
    metrics.overdueScooterIds,
    metrics.damageDebtScooterIds,
    metrics.returnsTodayScooterIds,
    metrics.pastDueTodayScooterIds,
    metrics.overdueRentalByScooter,
    metrics.damageDebtRentalByScooter,
    metrics.returnsTodayRentalByScooter,
    metrics.anyActiveRentalByScooter,
  ]);

  const modelCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    tiles.forEach((t) => (acc[t.model] = (acc[t.model] ?? 0) + 1));
    return acc;
  }, [tiles]);

  const statusCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    tiles.forEach((t) => (acc[t.status] = (acc[t.status] ?? 0) + 1));
    // Дополнительный «виртуальный» счётчик: сегодня возвращают.
    // Он не входит в TileStatus, считается по флагу isReturnToday.
    acc["returns_today"] = tiles.filter((t) => t.isReturnToday).length;
    return acc;
  }, [tiles]);

  const total = tiles.length;
  const park = metrics.park;

  if (total === 0) {
    return (
      <Card className={className}>
        <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-soft text-muted-2">
            <Bike size={26} />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">Парк пока пустой</div>
            <div className="mt-1 text-[13px] text-muted">
              Добавьте первый скутер на странице «Скутеры»
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="m-0 text-[20px] font-bold tracking-[-0.01em]">
            Парк · {total} {plural(total, ["скутер", "скутера", "скутеров"])}
          </h2>
          <div className="flex gap-4 text-xs text-muted">
            <span>
              загружено <b className="text-ink font-bold">{metrics.loadPercent}%</b>
            </span>
            <span>
              свободно <b className="text-ink font-bold">{park.ready}</b>
            </span>
            {park.inRepair > 0 && (
              <span>
                в ремонте <b className="text-ink font-bold">{park.inRepair}</b>
              </span>
            )}
          </div>
        </div>
        <ChipRow>
          {MODEL_CHIPS.map((c) => (
            <Chip
              key={c.id}
              active={model === c.id}
              onClick={() => setModel(c.id)}
            >
              {c.label}{" "}
              <Count active={model === c.id}>
                {c.id === "all" ? total : modelCounts[c.id] ?? 0}
              </Count>
            </Chip>
          ))}
        </ChipRow>
      </div>

      <ChipRow className="mb-2.5">
        {STATUS_CHIPS.map((c) => (
          <Chip
            key={c.id}
            active={status === c.id}
            onClick={() => setStatus(c.id)}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: c.swatch }}
            />
            {c.label}{" "}
            <Count active={status === c.id}>
              {c.id === "all" ? total : statusCounts[c.id] ?? 0}
            </Count>
          </Chip>
        ))}
      </ChipRow>

      <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-surface-soft px-3 py-2 text-xs text-muted">
        <Minus size={14} className="text-muted" />
        <span>масштаб</span>
        <input
          type="range"
          min={6}
          max={18}
          step={1}
          value={cols}
          onChange={(e) => setCols(Number(e.target.value))}
          className="max-w-[200px] flex-1"
          style={{ accentColor: "hsl(var(--blue-600))" }}
        />
        <Plus size={14} className="text-muted" />
        <span className="min-w-[70px] text-right">{cols} в ряду</span>
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {tiles.map((s) => {
          const modelMatch = model === "all" || s.model === model;
          if (!modelMatch) return null;
          const statusMatch =
            status === "all"
              ? true
              : status === "returns_today"
                ? s.isReturnToday
                : s.status === status;
          const num = s.name.split("#")[1] ?? s.name;
          const handleClick = () => {
            // Клик в зависимости от статуса — разные операционные действия.
            // v0.3.1: late_today тоже открывает аренду (это активная аренда
            // с истекающим временем сегодня), раньше попадало в else
            // и открывало карточку скутера.
            if (
              s.status === "rented" ||
              s.status === "overdue" ||
              s.status === "late_today" ||
              s.status === "returning"
            ) {
              if (s.rentalId != null) {
                // Если есть drawer-обработчик — открываем правый sidebar
                // на дашборде. Иначе fallback на полную страницу аренд.
                if (onOpenRental) onOpenRental(s.rentalId);
                else navigate({ route: "rentals", rentalId: s.rentalId });
              }
              return;
            }
            if (s.status === "pool") {
              setNewRentalFor(s.name);
              return;
            }
            if (s.status === "ready") {
              const full = scootersQ.data?.find((x) => x.id === s.id);
              if (full) setReassignFor(full);
              return;
            }
            // repair / for_sale / sold / disassembly — открываем карточку
            navigate({ route: "fleet", scooterId: s.id });
          };
          // v0.3.2: нативный browser-tooltip отключён — он
          // перекрывал стилизованную hover-карточку. Все подсказки
          // рендерим через ParkTileHoverCard.
          return (
            <button
              type="button"
              key={s.id}
              onClick={handleClick}
              onMouseEnter={(e) => hover.onEnter(e, s.id)}
              onMouseLeave={hover.onLeave}
              className={cn(
                "group relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[10px] border border-transparent text-[11px] font-semibold transition-all hover:-translate-y-0.5 hover:z-10 hover:shadow-card",
                tileClass(s.status),
                !statusMatch && "opacity-20",
              )}
            >
              {/* v0.3.1: красное пульсирующее свечение снизу плитки
                  ПОЛУДУГОЙ. Достигается radial-gradient'ом эллипсом «снизу»:
                  ядро у нижнего края, прозрачно к 70% высоты. Плитка остаётся
                  синей — это активная аренда, не просрочка. Свечение мягко
                  пульсирует через animate-pulse. */}
              {s.status === "late_today" && (
                <span
                  className="pointer-events-none absolute inset-0 rounded-[10px] animate-pulse"
                  style={{
                    background:
                      "radial-gradient(ellipse 75% 55% at 50% 100%, rgba(239,68,68,0.85) 0%, rgba(239,68,68,0.35) 45%, transparent 75%)",
                  }}
                  aria-hidden
                />
              )}
              <span className="relative z-[1]">{num}</span>
              {/* Мигающий индикатор «возврат сегодня» — маленький кружок
                  в правом верхнем углу. На красных/синих плитках работает
                  с белой обводкой для контраста. */}
              {s.isReturnToday && (
                <span
                  className="pointer-events-none absolute right-1 top-1 z-[2] h-2 w-2 rounded-full bg-yellow-300 ring-2 ring-white/90 animate-pulse"
                  aria-label="возврат сегодня"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Hover-preview плитки парка. Появляется через 350ms наведения,
          исчезает на mouseleave. Не блокирует клик — он по-прежнему
          ходит на плитку. v0.3.1, idea 1. */}
      {hover.state && (
        <ParkTileHoverCard
          scooterId={hover.state.scooterId}
          anchor={hover.state.anchor}
          onClose={hover.close}
        />
      )}

      {newRentalFor && (
        <NewRentalModal
          preselectedScooterName={newRentalFor}
          onClose={() => setNewRentalFor(null)}
          onCreated={(r) => {
            setNewRentalFor(null);
            navigate({ route: "rentals", rentalId: r.id });
          }}
        />
      )}

      {reassignFor && (
        <ReassignDialog
          scooter={reassignFor}
          onClose={() => setReassignFor(null)}
          onPick={async (next) => {
            try {
              await patchScooter.mutateAsync({
                id: reassignFor.id,
                patch: { baseStatus: next },
              });
              setReassignFor(null);
            } catch (e) {
              if (e instanceof ApiError && e.status === 409) {
                toast.error(
                  "Нельзя менять статус",
                  "У скутера активная аренда. Сначала завершите её.",
                );
              } else {
                toast.error("Не удалось сохранить статус");
              }
            }
          }}
        />
      )}
    </Card>
  );
}

function hintFor(s: TileStatus): string {
  switch (s) {
    case "rented":
    case "overdue":
    case "returning":
      return "открыть карточку аренды";
    case "pool":
      return "оформить аренду";
    case "ready":
      return "распределить скутер";
    default:
      return "открыть карточку скутера";
  }
}

/**
 * Диалог «распределить» скутер из статуса «Не распределён» — задать ему
 * следующий baseStatus. Простая альтернатива полному пикеру статусов.
 */
function ReassignDialog({
  scooter,
  onClose,
  onPick,
}: {
  scooter: ApiScooter;
  onClose: () => void;
  onPick: (next: ApiScooter["baseStatus"]) => void | Promise<void>;
}) {
  const options: {
    id: ApiScooter["baseStatus"];
    label: string;
    hint: string;
  }[] = [
    { id: "rental_pool", label: "В парк аренды", hint: "Готов к сдаче в аренду" },
    { id: "repair", label: "На ремонт", hint: "Обслуживание, ремонт" },
    { id: "for_sale", label: "На продажу", hint: "Выставить к продаже" },
    { id: "disassembly", label: "В разборку", hint: "На запчасти" },
  ];
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
    >
      <div
        className="mt-24 w-full max-w-[420px] overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border bg-surface-soft px-5 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Распределить скутер
          </div>
          <div className="text-[15px] font-bold text-ink">{scooter.name}</div>
        </div>
        <div className="flex flex-col gap-1 px-3 py-3">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o.id)}
              className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-surface-soft"
            >
              <div className="flex-1">
                <div className="text-[13px] font-bold text-ink">{o.label}</div>
                <div className="text-[11px] text-muted">{o.hint}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end border-t border-border bg-surface-soft px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-surface px-4 py-2 text-[13px] font-semibold hover:bg-border"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function computeTileStatus(
  s: ApiScooter,
  activeKind: "active" | "overdue" | "returning" | undefined,
  flags: {
    isOverdue: boolean;
    hasDamage: boolean;
    isLateToday: boolean;
  } = {
    isOverdue: false,
    hasDamage: false,
    isLateToday: false,
  },
): TileStatus {
  if (s.baseStatus === "sold") return "sold";
  if (s.baseStatus === "disassembly") return "disassembly";
  if (s.baseStatus === "for_sale" || s.baseStatus === "buyout")
    return "for_sale";
  if (s.baseStatus === "repair") return "repair";
  // Красная плитка — реальная просрочка по дате (вчера и раньше) ИЛИ
  // открытый долг по ущербу.
  if (activeKind === "overdue" || flags.isOverdue || flags.hasDamage)
    return "overdue";
  // v0.2.99: жёлтая плитка — возврат запланирован сегодня, но время
  // уже прошло. Бизнес-правило: формальная просрочка только со
  // следующего дня; этот промежуток — предупреждение.
  if (flags.isLateToday) return "late_today";
  if (activeKind === "returning") return "returning";
  if (activeKind === "active") return "rented";
  // Теперь различаем «не распределён» и «парк аренды свободен»
  if (s.baseStatus === "rental_pool") return "pool";
  return "ready";
}

function tileClass(s: TileStatus): string {
  switch (s) {
    case "rented":
      return "bg-blue text-white";
    case "overdue":
      return "bg-red text-white";
    case "late_today":
      // v0.3.00: плитка остаётся синей (это всё ещё активная аренда),
      // но получает красное пульсирующее свечение ВНУТРЬ — оператор
      // сразу видит «время прошло, но это не просрочка». Свечение
      // рисуется отдельным абсолютно позиционированным слоем (см. JSX
      // в render — overlay rounded-[10px] с inset-shadow + animate-pulse).
      return "bg-blue text-white";
    case "returning":
      return "bg-purple text-white";
    case "pool":
      return "bg-green text-white";
    case "ready":
      return "bg-surface-soft text-muted-2 border-border";
    case "repair":
      return "bg-orange text-white";
    case "for_sale":
      return "bg-purple text-white";
    case "disassembly":
      return "bg-ink text-white";
    case "sold":
      return "bg-border text-muted";
  }
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function ChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>{children}</div>
  );
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-border bg-surface-soft text-muted hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700",
      )}
    >
      {children}
    </button>
  );
}

export function Count({
  active,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "font-medium",
        active ? "text-white/70" : "text-muted-2",
      )}
    >
      {children}
    </span>
  );
}

// suppress unused warnings — STATUS_LABEL и hintFor оставлены для
// возможного будущего использования (см. v0.3.2 чистка title-tooltip)
void STATUS_LABEL;
void hintFor;
