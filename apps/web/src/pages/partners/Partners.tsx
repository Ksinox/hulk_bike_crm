import { useState } from "react";
import { Bike, Handshake, Users } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { cn } from "@/lib/utils";
import { InvestorsTab } from "./InvestorsTab";
import { PartnerFleet } from "./PartnerFleet";
import { PartnerRentals } from "./PartnerRentals";

/**
 * Правки 2.0, п.5 и 9: «Партнёрка» — самостоятельное рабочее пространство
 * с тремя сущностями: инвесторы, электротранспорт, аренды этой техники.
 *
 * Наружу отсюда уходит только информация о должниках (просрочка или день
 * оплаты) — она попадает в общий дашборд с пометкой, что это электричка.
 * Аренды партнёрской техники во вкладке «Аренды» наших скутеров не
 * показываются.
 *
 * Партнёрка пока работает только с электротранспортом: свои электрички не
 * закупаются, поэтому блок совмещает партнёрку и будущий блок электричек.
 */

type Tab = "investors" | "fleet" | "rentals";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "investors", label: "Инвесторы", icon: Users },
  { id: "fleet", label: "Электротранспорт", icon: Handshake },
  { id: "rentals", label: "Аренды", icon: Bike },
];

export function Partners() {
  const [tab, setTab] = useState<Tab>("investors");

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Партнёрка
        </h1>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-[11.5px] font-bold text-violet-700">
          электротранспорт инвесторов
        </span>
      </header>

      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1 shadow-card-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
              tab === t.id
                ? "bg-ink text-white"
                : "text-muted hover:text-ink",
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "investors" && <InvestorsTab />}
      {tab === "fleet" && <PartnerFleet />}
      {tab === "rentals" && <PartnerRentals />}
    </main>
  );
}
