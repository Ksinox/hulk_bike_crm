import { useState } from "react";
import { Archive, Bike, Package, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Topbar } from "@/pages/dashboard/Topbar";
import { Fleet } from "./Fleet";
import { ModelsCatalog } from "./ModelsCatalog";
import { EquipmentCatalog } from "./EquipmentCatalog";
import { ScooterArchive } from "./ScooterArchive";

type GarageTab = "scooters" | "models" | "equipment" | "archive";

const TABS: {
  id: GarageTab;
  label: string;
  icon: typeof Bike;
}[] = [
  { id: "scooters", label: "Скутеры", icon: Bike },
  { id: "models", label: "Модели", icon: Tag },
  { id: "equipment", label: "Экипировка", icon: Package },
  { id: "archive", label: "Архив", icon: Archive },
];

/**
 * «Гараж» — контейнер вкладок: Скутеры / Модели / Экипировка / Архив.
 * Общий Topbar вынесен сюда, дочерние компоненты его не рисуют.
 */
export function Garage() {
  const [tab, setTab] = useState<GarageTab>(() => {
    try {
      return (
        (localStorage.getItem("hulk.garageTab") as GarageTab | null) ??
        "scooters"
      );
    } catch {
      return "scooters";
    }
  });

  const changeTab = (t: GarageTab) => {
    setTab(t);
    try {
      localStorage.setItem("hulk.garageTab", t);
    } catch {
      /* noop */
    }
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <div className="flex items-center gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Скутеры
        </h1>
      </div>

      <div className="inline-flex gap-1 rounded-full bg-surface p-1 shadow-card-sm self-start">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => changeTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition-colors",
                tab === t.id
                  ? "bg-ink text-white"
                  : "text-muted hover:text-ink",
              )}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "scooters" && <Fleet embedded />}
      {tab === "models" && <ModelsCatalog />}
      {tab === "equipment" && <EquipmentCatalog />}
      {tab === "archive" && <ScooterArchive />}
    </main>
  );
}
