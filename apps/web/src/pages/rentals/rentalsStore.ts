import { useSyncExternalStore } from "react";
import {
  RENTALS as SEED,
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";

/* Платёж привязан к конкретной аренде */
export type PaymentType = "rent" | "deposit" | "fine" | "damage" | "refund";

export type Payment = {
  id: number;
  rentalId: number;
  type: PaymentType;
  amount: number;
  date: string;
  method: "cash" | "card" | "transfer";
  note?: string;
  paid: boolean;
};

export type RentalIncident = {
  id: number;
  rentalId: number;
  type: string;
  date: string;
  damage: number;
  paid: number;
  note?: string;
};

export type RentalTask = {
  id: number;
  rentalId: number;
  title: string;
  due: string;
  done: boolean;
};

export type ReturnInspection = {
  dateActual: string;
  conditionOk: boolean;
  mileage?: number;
  equipmentOk: boolean;
  damageNotes?: string;
  depositReturned: boolean;
};

type State = {
  rentals: Rental[];
  payments: Payment[];
  incidents: RentalIncident[];
  tasks: RentalTask[];
  inspections: Map<number, ReturnInspection>;
};

function seedPayments(): Payment[] {
  const p: Payment[] = [];
  let pid = 1000;
  for (const r of SEED) {
    if (r.sum > 0 && (r.status === "active" || r.status === "completed" || r.status === "returning" || r.status === "overdue" || r.status === "completed_damage")) {
      p.push({
        id: pid++, rentalId: r.id, type: "rent", amount: r.sum, date: r.start,
        method: r.paymentMethod, paid: true, note: "оплата аренды",
      });
      p.push({
        id: pid++, rentalId: r.id, type: "deposit", amount: r.deposit || 2000,
        date: r.start, method: r.paymentMethod, paid: true, note: "залог",
      });
    }
    if (r.status === "overdue") {
      p.push({
        id: pid++, rentalId: r.id, type: "fine", amount: 200, date: r.endPlanned,
        method: "cash", paid: false, note: "штраф за просрочку (200 ₽/день)",
      });
    }
    if (r.status === "completed_damage") {
      p.push({
        id: pid++, rentalId: r.id, type: "damage", amount: 3200, date: r.endActual || r.endPlanned,
        method: "cash", paid: false, note: "ущерб по возврату не погашен",
      });
    }
    if (r.status === "completed" && r.depositReturned) {
      p.push({
        id: pid++, rentalId: r.id, type: "refund", amount: r.deposit || 2000,
        date: r.endActual || r.endPlanned, method: r.paymentMethod, paid: true,
        note: "возврат залога",
      });
    }
  }
  return p;
}

function seedIncidents(): RentalIncident[] {
  return [
    { id: 1, rentalId: 150, type: "Просрочка возврата", date: "23.04.2026", damage: 3200, paid: 0, note: "штраф за 3 дня просрочки" },
    { id: 2, rentalId: 160, type: "Невозврат скутера", date: "15.04.2026", damage: 45000, paid: 0, note: "скутер не возвращён, заявление в ОВД" },
    { id: 3, rentalId: 160, type: "ДТП", date: "13.04.2026", damage: 18000, paid: 0, note: "повредил передний фонарь и крыло" },
  ];
}

function seedTasks(): RentalTask[] {
  return [
    { id: 1, rentalId: 121, title: "Встретить клиента и принять Gear #18", due: "13.10.2026 14:00", done: false },
    { id: 2, rentalId: 140, title: "Осмотр Gear #01 по возврату", due: "13.10.2026 14:00", done: false },
    { id: 3, rentalId: 180, title: "Встреча с Щербаковым Глебом, привезёт паспорт", due: "14.10.2026 11:00", done: false },
    { id: 4, rentalId: 181, title: "Встреча с Лаврентьевым И., Gear #17", due: "14.10.2026 16:30", done: false },
    { id: 5, rentalId: 130, title: "Позвонить Волковой А. по просрочке Jog #04", due: "13.10.2026", done: false },
    { id: 6, rentalId: 131, title: "Звонок по Gear #06 (Рубцов)", due: "13.10.2026", done: false },
    { id: 7, rentalId: 150, title: "Передать юристу — ущерб Кузнецов С.", due: "15.10.2026", done: false },
  ];
}

const state: State = {
  rentals: [...SEED],
  payments: seedPayments(),
  incidents: seedIncidents(),
  tasks: seedTasks(),
  inspections: new Map(),
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
  // ревизия для useSyncExternalStore
  rev = (rev + 1) & 0x7fffffff;
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

let rev = 0;

/* ======================= actions ======================= */

export function setRentalStatus(id: number, status: RentalStatus) {
  state.rentals = state.rentals.map((r) =>
    r.id === id ? { ...r, status } : r,
  );
  emit();
}

export function completeRentalNoDamage(id: number, inspection: ReturnInspection) {
  state.inspections.set(id, inspection);
  state.rentals = state.rentals.map((r) =>
    r.id === id
      ? {
          ...r,
          status: "completed",
          endActual: inspection.dateActual,
          depositReturned: inspection.depositReturned,
        }
      : r,
  );
  emit();
}

export function completeRentalWithDamage(
  id: number,
  inspection: ReturnInspection,
  damageAmount: number,
  note?: string,
) {
  state.inspections.set(id, inspection);
  state.rentals = state.rentals.map((r) =>
    r.id === id
      ? {
          ...r,
          status: "completed_damage",
          endActual: inspection.dateActual,
          depositReturned: inspection.depositReturned,
        }
      : r,
  );
  state.payments = [
    ...state.payments,
    {
      id: Date.now(),
      rentalId: id,
      type: "damage",
      amount: damageAmount,
      date: inspection.dateActual,
      method: "cash",
      paid: false,
      note: note || "ущерб зафиксирован при возврате",
    },
  ];
  state.incidents = [
    ...state.incidents,
    {
      id: Date.now() + 1,
      rentalId: id,
      type: "Ущерб при возврате",
      date: inspection.dateActual,
      damage: damageAmount,
      paid: 0,
      note,
    },
  ];
  emit();
}

export function addPayment(p: Omit<Payment, "id">) {
  state.payments = [...state.payments, { ...p, id: Date.now() }];
  emit();
}

export function markPaymentPaid(id: number, paid = true) {
  state.payments = state.payments.map((p) =>
    p.id === id ? { ...p, paid } : p,
  );
  emit();
}

export function addRental(r: Omit<Rental, "id">): Rental {
  const id = Math.max(...state.rentals.map((x) => x.id), 0) + 1;
  const next: Rental = { ...r, id };
  state.rentals = [...state.rentals, next];
  emit();
  return next;
}

export function toggleTask(id: number) {
  state.tasks = state.tasks.map((t) =>
    t.id === id ? { ...t, done: !t.done } : t,
  );
  emit();
}

/* ======================= hooks ======================= */

export function useRentals(): Rental[] {
  useSyncExternalStore(subscribe, () => rev, () => 0);
  return state.rentals;
}

export function useRental(id: number | null): Rental | null {
  useSyncExternalStore(subscribe, () => rev, () => 0);
  if (id == null) return null;
  return state.rentals.find((r) => r.id === id) ?? null;
}

export function useRentalPayments(rentalId: number): Payment[] {
  useSyncExternalStore(subscribe, () => rev, () => 0);
  return state.payments.filter((p) => p.rentalId === rentalId);
}

export function useRentalIncidents(rentalId: number): RentalIncident[] {
  useSyncExternalStore(subscribe, () => rev, () => 0);
  return state.incidents.filter((i) => i.rentalId === rentalId);
}

export function useRentalTasks(rentalId: number): RentalTask[] {
  useSyncExternalStore(subscribe, () => rev, () => 0);
  return state.tasks.filter((t) => t.rentalId === rentalId);
}

export function useInspection(rentalId: number): ReturnInspection | null {
  useSyncExternalStore(subscribe, () => rev, () => 0);
  return state.inspections.get(rentalId) ?? null;
}
