import { useState } from "react";
import {
  Archive,
  HandCoins,
  HelpCircle,
  Key,
  Package,
  ScrollText,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Topbar } from "@/pages/dashboard/Topbar";
import { Fleet } from "./Fleet";
import { ModelsCatalog } from "./ModelsCatalog";
import { EquipmentCatalog } from "./EquipmentCatalog";
import { ScooterArchive } from "./ScooterArchive";
import { ScooterJournal } from "./ScooterJournal";

/**
 * «Скутеры» — контейнер рабочих режимов (правки 2.0, п.10).
 *
 * Заказчик: подразделения должны быть изолированы. Вместо одной вкладки
 * «Скутеры» — выбор режима: с какой техникой мы сейчас работаем.
 *   • Аренда — техника арендного контура (в аренде, свободна, ремонт, ДТП);
 *   • Продажа — выставленная на витрину и проданная;
 *   • Выкуп — передана клиенту по договору выкупа (пока платит — наша);
 *   • Не распределены — заведена, но режим ещё не выбран.
 * Справа за разделителем — общие настройки: модели, экипировка, архив.
 */

export type FleetMode = "rental" | "sale" | "buyout" | "unassigned";
type GarageTab = FleetMode | "models" | "equipment" | "archive" | "journal";

const MODES: { id: FleetMode; label: string; icon: typeof Key }[] = [
  { id: "rental", label: "Аренда", icon: Key },
  { id: "sale", label: "Продажа", icon: Tag },
  { id: "buyout", label: "Выкуп", icon: HandCoins },
  { id: "unassigned", label: "Не распределены", icon: HelpCircle },
];

const SETTINGS: { id: GarageTab; label: string; icon: typeof Tag }[] = [
  { id: "models", label: "Модели", icon: Tag },
  { id: "equipment", label: "Экипировка", icon: Package },
  { id: "archive", label: "Архив", icon: Archive },
  // Правка 31.08: журнал техники — все действия со скутерами в одном окне.
  { id: "journal", label: "Журнал", icon: ScrollText },
];

export function Garage() {
  const [tab, setTab] = useState<GarageTab>(() => {
    try {
      const saved = localStorage.getItem("hulk.garageTab") as GarageTab | null;
      // Миграция со старого значения "scooters" на режим аренды.
      if (!saved || (saved as string) === "scooters") return "rental";
      return saved;
    } catch {
      return "rental";
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

  const isMode = (t: GarageTab): t is FleetMode =>
    t === "rental" || t === "sale" || t === "buyout" || t === "unassigned";

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <div className="flex items-center gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Скутеры
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Рабочие режимы: с какой техникой работаем */}
        <div className="inline-flex gap-1 rounded-full bg-surface p-1 shadow-card-sm">
          {MODES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => changeTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors",
                  tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Общие справочники — отделены от режимов */}
        <div className="inline-flex gap-1 rounded-full bg-surface/70 p-1">
          {SETTINGS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => changeTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                  tab === t.id
                    ? "bg-ink text-white"
                    : "text-muted-2 hover:text-ink",
                )}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {isMode(tab) && <Fleet embedded mode={tab} />}
      {tab === "models" && <ModelsCatalog />}
      {tab === "equipment" && <EquipmentCatalog />}
      {tab === "archive" && <ScooterArchive />}
      {tab === "journal" && <ScooterJournal />}
    </main>
  );
}
