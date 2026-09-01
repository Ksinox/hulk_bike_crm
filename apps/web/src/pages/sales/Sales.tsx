import { useEffect, useMemo, useState } from "react";
import { BarChart3, Handshake, Package, Users } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { useIsMobile } from "@/lib/useIsMobile";
import { consumePending, onNavigate } from "@/app/navigationStore";
import { ApplicationsButton } from "@/pages/applications/ApplicationsPanel";
import { cn } from "@/lib/utils";
import { useFleetScooters } from "@/pages/fleet/fleetStore";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { ScooterCard } from "@/pages/fleet/ScooterCard";
import type { ScooterDisplayStatus } from "@/lib/mock/fleet";
import { useApiScooters } from "@/lib/api/scooters";
import { useSaleDeals } from "@/lib/api/sales";
import { SalesOverview } from "./SalesOverview";
import { SalesDeals } from "./SalesDeals";
import { SalesStock } from "./SalesStock";
import { SalesManagers } from "./SalesManagers";
import { NewSaleWizard } from "./NewSaleWizard";
import { SaleDealDrawer } from "./SaleDealDrawer";
import { plural } from "./salesUtils";

/**
 * Раздел «Продажи» (задание заказчика 31.08).
 *
 * Самостоятельное рабочее место, как «Партнёрка»: обзор с показателями и
 * планом, детализация сделок с поиском по VIN, витрина техники в продаже и
 * менеджеры. Всё открывается ВНУТРИ раздела — карточка техники выезжает
 * дровером справа, наружу в «Скутеры» не выкидывает.
 */

type Tab = "overview" | "deals" | "stock" | "managers";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "Обзор", icon: BarChart3 },
  { id: "deals", label: "Сделки", icon: Handshake },
  { id: "stock", label: "В продаже", icon: Package },
  { id: "managers", label: "Менеджеры", icon: Users },
];

export function Sales() {
  const [tab, setTab] = useState<Tab>("overview");
  const [openScooterId, setOpenScooterId] = useState<number | null>(null);
  const [openDealId, setOpenDealId] = useState<number | null>(null);
  const [wizard, setWizard] = useState<
    | { open: false }
    | {
        open: true;
        dealId?: number | null;
        scooterId?: number | null;
        clientId?: number | null;
      }
  >({ open: false });

  /**
   * Переход из «Новой сделки» → сразу открываем мастер продажи.
   *
   * Читаем и pending при монтировании, и события навигации: если мы УЖЕ
   * в «Продажах», раздел не перемонтируется, и одного эффекта на монтаж
   * не хватало — по кнопке ничего не происходило (баг 31.08).
   */
  useEffect(() => {
    const p = consumePending("sales");
    if (p?.newSale) setWizard({ open: true, clientId: p.clientId ?? null });
    return onNavigate((req) => {
      if (req.route === "sales" && req.newSale) {
        consumePending("sales");
        setWizard({ open: true, clientId: req.clientId ?? null });
      }
    });
  }, []);

  const FLEET = useFleetScooters();
  const rentals = useRentals();
  const { data: apiScooters = [] } = useApiScooters();
  const { data: dealsData } = useSaleDeals();

  const stockCount = useMemo(
    () =>
      apiScooters.filter((s) => s.baseStatus === "for_sale" && !s.archivedAt).length,
    [apiScooters],
  );
  const inWork = useMemo(
    () =>
      (dealsData?.items ?? []).filter(
        (d) => d.status === "draft" || d.status === "contract",
      ).length,
    [dealsData],
  );

  /** Статус техники для карточки — та же логика, что в «Скутерах». */
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

  const openDeal = useMemo(
    () => (dealsData?.items ?? []).find((d) => d.id === openDealId) ?? null,
    [dealsData, openDealId],
  );

  const drawer = openDeal ? "deal" : openScooter ? "scooter" : null;
  const isMobile = useIsMobile();

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      {/* На телефоне свой app-shell со своей шапкой — десктопная панель
          поверх него дублировала поиск и ломала строку (фидбэк 01.09). */}
      {!isMobile && <Topbar />}
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Продажи
        </h1>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11.5px] font-bold text-emerald-700">
          {stockCount} в продаже
        </span>
        {inWork > 0 && (
          <button
            type="button"
            onClick={() => setTab("deals")}
            className="rounded-full bg-orange-soft px-3 py-1 text-[11.5px] font-bold text-orange-ink"
          >
            {inWork} {plural(inWork, ["сделка", "сделки", "сделок"])} в работе
          </button>
        )}
        <div className="flex-1" />
        {/* Заявки на покупку (правка 31.08). Отдельной кнопки «Новая
            продажа» здесь нет: сделка заводится из «Новой сделки» в шапке,
            где выбирается её тип — иначе две кнопки об одном и том же. */}
        <ApplicationsButton purpose="sale" />
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
                  tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
              >
                <t.icon size={14} />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <SalesOverview
              onOpenStock={() => setTab("stock")}
              onOpenDeal={(id) => {
                setOpenScooterId(null);
                setOpenDealId(id);
              }}
            />
          )}
          {tab === "deals" && (
            <SalesDeals
              onOpenDeal={(id) => {
                setOpenScooterId(null);
                setOpenDealId(id);
              }}
              onNewDeal={() => setWizard({ open: true })}
            />
          )}
          {tab === "stock" && (
            <SalesStock
              onOpenScooter={(id) => {
                setOpenDealId(null);
                setOpenScooterId(id);
              }}
              onSell={(scooterId) => setWizard({ open: true, scooterId })}
            />
          )}
          {tab === "managers" && (
            <SalesManagers
              onOpenDeal={(id) => {
                setOpenScooterId(null);
                setOpenDealId(id);
              }}
            />
          )}
        </div>

        {/* Дровер: карточка сделки или карточка техники — как в «Партнёрке»,
            список сужается, панель выезжает справа, всё внутри раздела. */}
        {drawer && (
          <div className="drawer-slide-in sticky top-4 hidden h-[calc(100dvh-32px)] w-[480px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-card lg:flex xl:w-[560px] 2xl:w-[620px]">
            {openDeal ? (
              <SaleDealDrawer
                deal={openDeal}
                onClose={() => setOpenDealId(null)}
                onContinue={(id) => {
                  setOpenDealId(null);
                  setWizard({ open: true, dealId: id });
                }}
                onOpenScooter={(id) => {
                  setOpenDealId(null);
                  setOpenScooterId(id);
                }}
              />
            ) : openScooter ? (
              <ScooterCard
                drawerChrome
                scooter={openScooter.scooter}
                status={openScooter.status}
                onBack={() => setOpenScooterId(null)}
              />
            ) : null}
          </div>
        )}
        {drawer && (
          <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface animate-slide-in-right lg:hidden">
            {openDeal ? (
              <SaleDealDrawer
                deal={openDeal}
                onClose={() => setOpenDealId(null)}
                onContinue={(id) => {
                  setOpenDealId(null);
                  setWizard({ open: true, dealId: id });
                }}
                onOpenScooter={(id) => {
                  setOpenDealId(null);
                  setOpenScooterId(id);
                }}
              />
            ) : openScooter ? (
              <ScooterCard
                drawerChrome
                scooter={openScooter.scooter}
                status={openScooter.status}
                onBack={() => setOpenScooterId(null)}
              />
            ) : null}
          </div>
        )}
      </div>

      {wizard.open && (
        <NewSaleWizard
          dealId={wizard.dealId ?? null}
          presetScooterId={wizard.scooterId ?? null}
          presetClientId={wizard.clientId ?? null}
          onClose={() => setWizard({ open: false })}
        />
      )}
    </main>
  );
}
