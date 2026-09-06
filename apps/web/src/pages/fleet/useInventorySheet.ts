import { useMemo } from "react";
import { useFleetScooters } from "./fleetStore";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { useBuyoutDeals } from "@/lib/api/buyout";
import { buyoutDealByScooter } from "@/lib/buyoutStock";
import { scooterModelName } from "@/components/ScooterName";
import { useApiClients } from "@/lib/api/clients";
import { buildInventorySheetHtml, type InventoryGroup, type InventoryRow } from "./inventorySheet";

/**
 * Данные для «Ревизии парка» (06.09, п.2): те же категории, что во вкладках
 * «Скутеров». Аренда — с подстатусами (в аренде / готов / ремонт / ДТП /
 * разборка), Выкуп и Продажи — только то, что физически у нас (доступно),
 * Не распределены — заведены без подразделения.
 */
export function useInventorySheet(): { groups: InventoryGroup[]; html: string; total: number } {
  const FLEET = useFleetScooters();
  const rentals = useRentals();
  const { data: buyoutData } = useBuyoutDeals();
  const { data: clients = [] } = useApiClients();

  return useMemo(() => {
    const clientName = new Map(clients.map((c) => [c.id, c.name] as const));
    const byScooter = buyoutDealByScooter(buyoutData?.items ?? []);
    const rentedBy = new Map<string, string>();
    for (const r of rentals) {
      if (r.status === "active" || r.status === "overdue" || r.status === "returning") {
        rentedBy.set(r.scooter, clientName.get(r.clientId) ?? "клиент");
      }
    }
    const label = (s: (typeof FLEET)[number]) => {
      const model = scooterModelName(s.name);
      const num = s.rentalSlot ?? s.exRentalSlot;
      return num != null ? `${model} №${num}` : model;
    };
    const row = (s: (typeof FLEET)[number], state: string, holder?: string | null): InventoryRow => ({
      name: label(s),
      vin: s.vin ?? s.frameNumber ?? "",
      state,
      holder: holder ?? null,
    });
    const own = FLEET.filter((s) => !s.isPartner);
    const bySlot = (a: InventoryRow, b: InventoryRow) => a.name.localeCompare(b.name, "ru", { numeric: true });

    const rental: InventoryRow[] = [];
    const buyout: InventoryRow[] = [];
    const sale: InventoryRow[] = [];
    const free: InventoryRow[] = [];
    for (const s of own) {
      const client = rentedBy.get(s.name);
      switch (s.baseStatus) {
        case "rental_pool":
          rental.push(client ? row(s, "в аренде", client) : row(s, "готов"));
          break;
        case "repair":
          rental.push(row(s, "ремонт"));
          break;
        case "dtp":
          rental.push(row(s, "ДТП"));
          break;
        case "disassembly":
          rental.push(row(s, "разборка"));
          break;
        case "buyout":
          if (!byScooter.has(s.id)) buyout.push(row(s, "доступен для выкупа"));
          break;
        case "for_sale":
          sale.push(row(s, "доступен для продажи"));
          break;
        case "ready":
          free.push(row(s, "не распределён"));
          break;
        default:
          break;
      }
    }
    const groups: InventoryGroup[] = [
      { title: "Аренда", hint: "в аренде · готов · ремонт · ДТП · разборка", rows: rental.sort(bySlot) },
      { title: "Выкуп", hint: "доступны для выкупа, не у клиента", rows: buyout.sort(bySlot) },
      { title: "Продажи", hint: "доступны для продажи", rows: sale.sort(bySlot) },
      { title: "Не распределены", hint: "подразделение ещё не выбрано", rows: free.sort(bySlot) },
    ];
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    return { groups, html: buildInventorySheetHtml(groups), total };
  }, [FLEET, rentals, buyoutData, clients]);
}
