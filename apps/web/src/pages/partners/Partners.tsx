import { useMemo, useState } from "react";
import { Bike, Handshake, Users } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { cn } from "@/lib/utils";
import { useFleetScooters } from "@/pages/fleet/fleetStore";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { ScooterCard } from "@/pages/fleet/ScooterCard";
import type { ScooterDisplayStatus } from "@/lib/mock/fleet";
import { InvestorsTab } from "./InvestorsTab";
import { PartnerFleet } from "./PartnerFleet";
import { PartnerRentals } from "./PartnerRentals";

/**
 * Правки 2.0, п.5 и 9 + правки 27.08: «Партнёрка» — самостоятельное рабочее
 * пространство («отдельное государство»): аренды, электротранспорт и
 * инвесторы партнёрской техники. ВСЁ открывается внутри партнёрки — наружу
 * (в общие «Аренды»/«Скутеры») отсюда не выкидывает:
 *   • аренда → такой же боковой дровер с той же карточкой, что в «Арендах»;
 *   • техника → та же карточка скутера, но внутри партнёрки;
 *   • техника добавляется прямо здесь (кнопка как в «Скутерах»).
 *
 * Порядок вкладок (правка 27.08): «Аренды» — главная (здесь операции),
 * затем «Электротранспорт» (аналог «Скутеров»), «Инвесторы» — последняя.
 *
 * Наружу отсюда уходит только информация о должниках (просрочка или день
 * оплаты) — она попадает в общий дашборд с пометкой, что это электричка.
 */

type Tab = "rentals" | "fleet" | "investors";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "rentals", label: "Аренды", icon: Bike },
  { id: "fleet", label: "Электротранспорт", icon: Handshake },
  { id: "investors", label: "Инвесторы", icon: Users },
];

export function Partners() {
  const [tab, setTab] = useState<Tab>("rentals");
  /**
   * Открытая карточка техники — рендерится ВНУТРИ партнёрки на всю ширину
   * (та же ScooterCard, что в «Скутерах»), с возвратом назад в партнёрку.
   */
  const [openScooterId, setOpenScooterId] = useState<number | null>(null);

  const FLEET = useFleetScooters();
  const rentals = useRentals();

  /** Статус техники — та же логика, что в Fleet.tsx. */
  const openScooter = useMemo(() => {
    if (openScooterId == null) return null;
    const s = FLEET.find((x) => x.id === openScooterId);
    if (!s) return null;
    const hasRental = rentals.some(
      (r) =>
        r.scooter === s.name &&
        (r.status === "active" || r.status === "overdue" || r.status === "returning"),
    );
    const status: ScooterDisplayStatus =
      hasRental && s.baseStatus === "rental_pool" ? "rented" : s.baseStatus;
    return { scooter: s, status };
  }, [openScooterId, FLEET, rentals]);

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

      <div className="flex min-w-0 items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
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

          {tab === "rentals" && <PartnerRentals />}
          {tab === "fleet" && <PartnerFleet onOpenScooter={setOpenScooterId} />}
          {tab === "investors" && (
            <InvestorsTab onOpenScooter={setOpenScooterId} />
          )}
        </div>

        {/* Дровер карточки техники — как в «Скутерах» (правка 27.08):
            список сужается, карточка выезжает справа, всё внутри партнёрки. */}
        {openScooter && (
          <div className="sticky top-4 hidden h-[calc(100dvh-32px)] w-[480px] xl:w-[560px] 2xl:w-[620px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-card lg:flex">
            <ScooterCard
              drawerChrome
              scooter={openScooter.scooter}
              status={openScooter.status}
              onBack={() => setOpenScooterId(null)}
            />
          </div>
        )}
        {openScooter && (
          <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface animate-slide-in-right lg:hidden">
            <ScooterCard
              drawerChrome
              scooter={openScooter.scooter}
              status={openScooter.status}
              onBack={() => setOpenScooterId(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
