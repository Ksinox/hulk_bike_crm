import { useSyncExternalStore } from "react";
import {
  RENTALS as SEED,
  type ConfirmerRole,
  type PaymentConfirmation,
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
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ======================= actions ======================= */

export function setRentalStatus(id: number, status: RentalStatus) {
  state.rentals = state.rentals.map((r) =>
    r.id === id ? { ...r, status } : r,
  );
  emit();
}

export function patchRental(id: number, patch: Partial<Rental>) {
  state.rentals = state.rentals.map((r) =>
    r.id === id ? { ...r, ...patch } : r,
  );
  emit();
}

export function confirmRentalPayment(
  id: number,
  role: ConfirmerRole,
  byName: string,
  contractUploaded: boolean,
) {
  const confirmation: PaymentConfirmation = {
    by: role,
    byName,
    at: "13.10.2026",
  };
  state.rentals = state.rentals.map((r) =>
    r.id === id
      ? { ...r, paymentConfirmed: confirmation, contractUploaded }
      : r,
  );
  emit();
}

export function addRentalIncident(
  rentalId: number,
  data: { type: string; date: string; damage: number; note?: string },
): void {
  const id = Math.max(0, ...state.incidents.map((i) => i.id)) + 1;
  state.incidents = [
    ...state.incidents,
    { id, rentalId, type: data.type, date: data.date, damage: data.damage, paid: 0, note: data.note },
  ];
  if (data.damage > 0) {
    state.payments = [
      ...state.payments,
      {
        id: Date.now(),
        rentalId,
        type: "damage",
        amount: data.damage,
        date: data.date,
        method: "cash",
        paid: false,
        note: data.note || "ущерб по инциденту",
      },
    ];
  }
  emit();
}

export function revertOverdue(id: number) {
  // Сегодня по демо-таймлайну — 13.10.2026
  const today = "13.10.2026";
  state.rentals = state.rentals.map((r) =>
    r.id === id && r.status === "overdue"
      ? {
          ...r,
          status: "active",
          // Просрочка «прощена» — возврат переносится на сегодня,
          // дальше админ либо принимает возврат, либо продлевает
          endPlanned: today,
        }
      : r,
  );
  // снимаем начисленные штрафы по этой аренде
  state.payments = state.payments.filter(
    (p) => !(p.rentalId === id && p.type === "fine" && !p.paid),
  );
  emit();
}

export function completeRentalNoDamage(id: number, inspection: ReturnInspection) {
  state.inspections = new Map(state.inspections).set(id, inspection);
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
  state.inspections = new Map(state.inspections).set(id, inspection);
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

function maybeAutoClose(rentalId: number) {
  const rental = state.rentals.find((r) => r.id === rentalId);
  if (!rental || rental.status !== "completed_damage") return;
  const damageUnpaid = state.payments
    .filter((p) => p.rentalId === rentalId && p.type === "damage" && !p.paid)
    .reduce((s, p) => s + p.amount, 0);
  if (damageUnpaid === 0) {
    state.rentals = state.rentals.map((r) =>
      r.id === rentalId ? { ...r, status: "completed" } : r,
    );
  }
}

export function addPayment(p: Omit<Payment, "id">) {
  state.payments = [...state.payments, { ...p, id: Date.now() }];
  maybeAutoClose(p.rentalId);
  emit();
}

export function markPaymentPaid(id: number, paid = true) {
  state.payments = state.payments.map((p) =>
    p.id === id ? { ...p, paid } : p,
  );
  const p = state.payments.find((x) => x.id === id);
  if (p) maybeAutoClose(p.rentalId);
  emit();
}

export function addRental(r: Omit<Rental, "id">): Rental {
  const id = Math.max(...state.rentals.map((x) => x.id), 0) + 1;
  const next: Rental = { ...r, id };
  state.rentals = [...state.rentals, next];
  emit();
  return next;
}

/**
 * Продление аренды: закрываем текущую как completed,
 * создаём новую с той же парой клиент+скутер от даты предыдущего планового возврата.
 */
export function extendRental(
  oldId: number,
  extraDays: number,
  newRate: number,
  newTariffPeriod: Rental["tariffPeriod"],
): Rental | null {
  const old = state.rentals.find((r) => r.id === oldId);
  if (!old) return null;
  // закрываем старую
  state.rentals = state.rentals.map((r) =>
    r.id === oldId
      ? {
          ...r,
          status: "completed",
          endActual: r.endPlanned,
          depositReturned: false, // залог переходит в новую аренду
        }
      : r,
  );
  // новая начинается там, где закончилась старая
  const newStart = old.endPlanned;
  const [d, m, y] = newStart.split(".").map(Number);
  const endDate = new Date(y, m - 1, d);
  endDate.setDate(endDate.getDate() + extraDays);
  const dd = String(endDate.getDate()).padStart(2, "0");
  const mm = String(endDate.getMonth() + 1).padStart(2, "0");
  const newEnd = `${dd}.${mm}.${endDate.getFullYear()}`;

  const newId = Math.max(...state.rentals.map((x) => x.id), 0) + 1;
  const created: Rental = {
    ...old,
    id: newId,
    start: newStart,
    startTime: old.startTime,
    endPlanned: newEnd,
    endActual: undefined,
    status: "active",
    tariffPeriod: newTariffPeriod,
    rate: newRate,
    days: extraDays,
    sum: newRate * extraDays,
    contractUploaded: false,
    paymentConfirmed: null,
    note: `продление аренды #${String(oldId).padStart(4, "0")}`,
  };
  state.rentals = [...state.rentals, created];
  emit();
  return created;
}

export function toggleTask(id: number) {
  state.tasks = state.tasks.map((t) =>
    t.id === id ? { ...t, done: !t.done } : t,
  );
  emit();
}

/* ======================= hooks ======================= */

export function useRentals(): Rental[] {
  return useSyncExternalStore(
    subscribe,
    () => state.rentals,
    () => state.rentals,
  );
}

export function useRentalsByClient(clientId: number): Rental[] {
  const rentals = useSyncExternalStore(
    subscribe,
    () => state.rentals,
    () => state.rentals,
  );
  return rentals.filter((r) => r.clientId === clientId);
}

export function getActiveRentalByClient(
  clientId: number,
  rentals: Rental[],
): Rental | null {
  return (
    rentals.find(
      (r) =>
        r.clientId === clientId &&
        (r.status === "active" ||
          r.status === "overdue" ||
          r.status === "returning"),
    ) ?? null
  );
}

export function useRental(id: number | null): Rental | null {
  const rentals = useSyncExternalStore(
    subscribe,
    () => state.rentals,
    () => state.rentals,
  );
  if (id == null) return null;
  return rentals.find((r) => r.id === id) ?? null;
}

export function useRentalPayments(rentalId: number): Payment[] {
  const payments = useSyncExternalStore(
    subscribe,
    () => state.payments,
    () => state.payments,
  );
  return payments.filter((p) => p.rentalId === rentalId);
}

export function useRentalIncidents(rentalId: number): RentalIncident[] {
  const incidents = useSyncExternalStore(
    subscribe,
    () => state.incidents,
    () => state.incidents,
  );
  return incidents.filter((i) => i.rentalId === rentalId);
}

export function useRentalTasks(rentalId: number): RentalTask[] {
  const tasks = useSyncExternalStore(
    subscribe,
    () => state.tasks,
    () => state.tasks,
  );
  return tasks.filter((t) => t.rentalId === rentalId);
}

export function useInspection(rentalId: number): ReturnInspection | null {
  const inspections = useSyncExternalStore(
    subscribe,
    () => state.inspections,
    () => state.inspections,
  );
  return inspections.get(rentalId) ?? null;
}
