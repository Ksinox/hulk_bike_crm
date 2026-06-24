import { useMemo, useState } from "react";
import { useReloadRestoredState } from "@/lib/usePersistedState";
import { ShoppingBag, Bike } from "lucide-react";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { fileUrl } from "@/lib/files";
import {
  oilFlag,
  SCOOTER_STATUS_LABEL,
  type ScooterDisplayStatus,
} from "@/lib/mock/fleet";
import { Droplet } from "lucide-react";
import { AddScooterModal } from "@/pages/fleet/AddScooterModal";
import { MobileScooterCard } from "../cards/MobileScooterCard";
import { useFleetScooters } from "@/pages/fleet/fleetStore";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { usePageFab } from "../fab";
import type { ApiScooter, ScooterModel } from "@/lib/api/types";
import { matchId, matchScooterName, normalizeQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import {
  MobileChips,
  MobileEmpty,
  MobileSearch,
  type ChipOption,
} from "../ui";

type Filter =
  | "all"
  | "rented"
  | "rental_pool"
  | "repair"
  | "dtp"
  | "disassembly"
  | "sale";

const MODEL_LABEL: Record<ScooterModel, string> = {
  jog: "Yamaha Jog",
  gear: "Honda Gear",
  honda: "Honda",
  tank: "Tank",
};

// Тон под канонический статус. Ярлык берём из SCOOTER_STATUS_LABEL (единый
// источник с десктопом — никаких выдуманных «В прокате»).
const STATUS_TONE: Record<ScooterDisplayStatus, string> = {
  rented: "bg-blue-50 text-blue-600",
  rental_pool: "bg-green-soft text-green-ink",
  ready: "bg-surface-soft text-muted",
  repair: "bg-orange-soft text-orange-ink",
  buyout: "bg-purple-soft text-purple-ink",
  for_sale: "bg-purple-soft text-purple-ink",
  sold: "bg-surface-soft text-muted-2",
  disassembly: "bg-red-soft text-red-ink",
  dtp: "bg-red text-white",
};

function statusMeta(s: ScooterDisplayStatus): { label: string; cls: string } {
  return { label: SCOOTER_STATUS_LABEL[s], cls: STATUS_TONE[s] };
}

function num(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

export function MobileScooters() {
  const { data: scooters = [] } = useApiScooters();
  const { data: models = [] } = useApiScooterModels();
  // Картинка модели для аватарки скутера: по modelId, иначе по совпадению
  // названия модели. thumb-вариант (лёгкий) для списка.
  const avatarFor = (s: ApiScooter): string | undefined => {
    const m = s.modelId
      ? models.find((x) => x.id === s.modelId)
      : models.find((x) => x.name.toLowerCase().includes(s.model.toLowerCase()));
    return fileUrl(m?.avatarKey, { variant: "thumb" }) ?? undefined;
  };
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useReloadRestoredState<number | null>(
    "mobile:scooters:openId",
    null,
  );
  const [newOpen, setNewOpen] = useState(false);
  // Прячем «+ Скутер» внутри карточки (drill-in) И пока открыта форма создания.
  usePageFab("Скутер", () => setNewOpen(true), openId != null || newOpen);
  // FleetScooter[] для полноэкранной карточки (та же, что на десктопе).
  const fleet = useFleetScooters();

  // Скутеры с активной арендой → derived-статус «В аренде» (как на десктопе:
  // baseStatus остаётся rental_pool, но показываем «rented»).
  const rentals = useRentals();
  const rentedSet = useMemo(() => {
    const set = new Set<number>();
    for (const r of rentals) {
      if (
        r.scooterId != null &&
        (r.status === "active" || r.status === "overdue" || r.status === "returning")
      ) {
        set.add(r.scooterId);
      }
    }
    return set;
  }, [rentals]);

  const displayStatus = (s: ApiScooter): ScooterDisplayStatus =>
    s.baseStatus === "rental_pool" && rentedSet.has(s.id) ? "rented" : s.baseStatus;

  const live = useMemo(
    () => scooters.filter((s) => !s.archivedAt && !s.deletedAt),
    [scooters],
  );

  const counts = useMemo(() => {
    const c = { rented: 0, rental_pool: 0, repair: 0, dtp: 0, disassembly: 0, sale: 0 };
    for (const s of live) {
      const st = displayStatus(s);
      if (st === "rented") c.rented++;
      else if (st === "rental_pool") c.rental_pool++;
      else if (st === "repair") c.repair++;
      else if (st === "dtp") c.dtp++;
      else if (st === "disassembly") c.disassembly++;
      else if (st === "for_sale" || st === "buyout") c.sale++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, rentedSet]);

  const filtered = useMemo(() => {
    const matchStatus = (s: ApiScooter): boolean => {
      if (filter === "all") return true;
      const st = displayStatus(s);
      if (filter === "sale") return st === "for_sale" || st === "buyout";
      return st === filter;
    };
    const matchSearch = (s: ApiScooter): boolean => {
      if (!search.trim()) return true;
      const q = normalizeQuery(search);
      return (
        matchScooterName(s.name, q) ||
        matchId(s.id, q) ||
        matchScooterName(s.vin ?? undefined, q)
      );
    };
    return live
      .filter((s) => matchStatus(s) && matchSearch(s))
      .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, filter, search, rentedSet]);

  const chips: ChipOption<Filter>[] = [
    { id: "all", label: "Все", count: live.length },
    { id: "rented", label: "В аренде", count: counts.rented },
    { id: "rental_pool", label: "Готов", count: counts.rental_pool },
    { id: "repair", label: "Ремонт", count: counts.repair },
    { id: "dtp", label: "ДТП", count: counts.dtp },
    { id: "disassembly", label: "Разборка", count: counts.disassembly },
    { id: "sale", label: "Продажа", count: counts.sale },
  ];

  const openScooter = live.find((s) => s.id === openId) ?? null;
  const openFleet = openId != null ? fleet.find((f) => f.id === openId) ?? null : null;

  return (
    // pb-20: чтобы FAB «+ Скутер» не перекрывал последнюю карточку.
    <div className="flex flex-col gap-3 pb-20">
      <MobileSearch value={search} onChange={setSearch} placeholder="Номер, имя, VIN…" />
      <MobileChips options={chips} value={filter} onChange={setFilter} />

      {filtered.length === 0 ? (
        <MobileEmpty
          icon={<ShoppingBag size={26} />}
          title="Скутеров нет"
          hint={search ? "Ничего не нашлось" : "В этом фильтре пусто"}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((s) => (
            <ScooterTile
              key={s.id}
              scooter={s}
              status={displayStatus(s)}
              avatar={avatarFor(s)}
              onClick={() => setOpenId(s.id)}
            />
          ))}
        </div>
      )}

      {/* Тап по скутеру → полноэкранная мобильная карточка (нативный экран). */}
      {openFleet && openScooter && (
        <ErrorBoundary key={openFleet.id}>
          <MobileScooterCard
            scooter={openFleet}
            status={displayStatus(openScooter)}
            onBack={() => setOpenId(null)}
          />
        </ErrorBoundary>
      )}

      {/* Добавление скутера — десктоп-модалка (полноэкранная на мобиле). */}
      {newOpen && <AddScooterModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function ScooterTile({
  scooter,
  status,
  avatar,
  onClick,
}: {
  scooter: ApiScooter;
  status: ScooterDisplayStatus;
  avatar?: string;
  onClick: () => void;
}) {
  const meta = statusMeta(status);
  const oilState =
    status === "rental_pool" || status === "rented" ? oilFlag(scooter) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-2xl bg-surface p-3 text-left shadow-card-sm active:scale-[0.99]"
    >
      <div className="flex items-center gap-2.5">
        {/* Аватарка скутера: картинка модели из каталога, иначе иконка. */}
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-soft">
          {avatar ? (
            <img src={avatar} alt={scooter.name} className="h-full w-full object-contain" />
          ) : (
            <Bike size={22} className="text-muted-2" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-bold text-ink">
            {scooter.name}
          </div>
          <div className="truncate text-[12px] text-muted">
            {MODEL_LABEL[scooter.model]}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>
            {meta.label}
          </span>
          {oilState && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                oilState === "overdue"
                  ? "bg-red-soft text-red-ink"
                  : "bg-orange-100 text-orange-700",
              )}
            >
              <Droplet size={9} /> масло
            </span>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-muted-2">{num(scooter.mileage)} км</span>
      </div>
    </button>
  );
}

