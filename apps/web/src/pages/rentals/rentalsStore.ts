import { useMemo, useSyncExternalStore } from "react";
import {
  RENTALS as SEED,
  type ConfirmerRole,
  type Rental,
  type RentalSourceChannel,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { CLIENTS, type ClientSource } from "@/lib/mock/clients";
import { useQuery } from "@tanstack/react-query";
import { rentalsKeys, useApiRentals } from "@/lib/api/rentals";
import { useApiScooters } from "@/lib/api/scooters";
import { paymentsKeys, useApiPayments } from "@/lib/api/payments";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { adaptRental } from "./rentalAdapter";

/** Мапим источник клиента в канал обращения по аренде */
function deriveChannel(
  source: ClientSource | undefined,
): RentalSourceChannel {
  switch (source) {
    case "avito":
      return "avito";
    case "repeat":
      return "repeat";
    case "ref":
      return "ref";
    case "maps":
      return "passing";
    default:
      return "other";
  }
}

function withSourceChannel(rentals: Rental[]): Rental[] {
  return rentals.map((r) => {
    if (r.sourceChannel) return r;
    const client = CLIENTS.find((c) => c.id === r.clientId);
    return { ...r, sourceChannel: deriveChannel(client?.source) };
  });
}

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
  rentals: withSourceChannel([...SEED]),
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

/**
 * Все write-операции = вызов API + инвалидация кеша React Query.
 * Сигнатуры синхронные (fire-and-forget) — UI получит свежие данные
 * через ~200–500 мс на следующем refetch.
 */

function invAll() {
  queryClient.invalidateQueries({ queryKey: rentalsKeys.all });
  queryClient.invalidateQueries({ queryKey: paymentsKeys.all });
}
function logErr(op: string) {
  return (e: unknown) => console.error(`[${op}]`, e);
}

/** "13.10.2026" или "13.10.2026 14:00" → ISO (MSK) */
function ruToIso(dateRu: string, time = "12:00"): string {
  const m = dateRu.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}))?$/);
  if (!m) throw new Error(`ruToIso: не парсится ${dateRu}`);
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? time}:00+03:00`;
}

export function setRentalStatus(id: number, status: RentalStatus) {
  api.patch(`/api/rentals/${id}`, { status }).then(invAll).catch(logErr("setRentalStatus"));
}

export function setRentalDamage(id: number, amount: number) {
  api
    .patch(`/api/rentals/${id}`, { damageAmount: amount > 0 ? amount : null })
    .then(invAll)
    .catch(logErr("setRentalDamage"));
}

export function patchRental(id: number, patch: Partial<Rental>) {
  // Пропускаем большинство полей как есть; даты переводим в ISO
  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.note !== undefined) body.note = patch.note ?? null;
  if (patch.rate !== undefined) body.rate = patch.rate;
  if (patch.days !== undefined) body.days = patch.days;
  if (patch.sum !== undefined) body.sum = patch.sum;
  if (patch.depositReturned !== undefined) {
    body.depositReturned = patch.depositReturned;
  }
  if (patch.endPlanned !== undefined) {
    body.endPlannedAt = ruToIso(patch.endPlanned, patch.startTime);
  }
  if (patch.endActual !== undefined) {
    body.endActualAt = patch.endActual ? ruToIso(patch.endActual, patch.startTime) : null;
  }
  if (patch.damageAmount !== undefined) {
    body.damageAmount = patch.damageAmount ?? null;
  }
  if (Object.keys(body).length === 0) return;
  api.patch(`/api/rentals/${id}`, body).then(invAll).catch(logErr("patchRental"));
}

export function confirmRentalPayment(
  id: number,
  role: ConfirmerRole,
  byName: string,
  contractUploaded: boolean,
) {
  // В UI enum другой (director/admin) — маппим в серверный (boss/manager)
  const apiRole = role === "director" ? "boss" : "manager";
  api
    .post(`/api/rentals/${id}/confirm-payment`, {
      role: apiRole,
      byName,
      contractUploaded,
    })
    .then(invAll)
    .catch(logErr("confirmRentalPayment"));
}

export function addRentalIncident(
  rentalId: number,
  data: { type: string; date: string; damage: number; note?: string },
): void {
  const [d, m, y] = data.date.split(".");
  api
    .post(`/api/incidents`, {
      rentalId,
      type: data.type,
      occurredOn: `${y}-${m}-${d}`,
      damage: data.damage,
      note: data.note ?? null,
    })
    .then(() => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      invAll();
    })
    .catch(logErr("addRentalIncident"));
}

export function revertOverdue(id: number) {
  api
    .post(`/api/rentals/${id}/revert-overdue`, {})
    .then(invAll)
    .catch(logErr("revertOverdue"));
}

export function completeRentalNoDamage(id: number, inspection: ReturnInspection) {
  // Локально кешируем inspection (сервер хранит в returnInspections — приходит отдельным запросом, но для UI нужен synchronous hook)
  state.inspections = new Map(state.inspections).set(id, inspection);
  emit();
  api
    .post(`/api/rentals/${id}/complete`, {
      dateActual: toIsoDay(inspection.dateActual),
      conditionOk: inspection.conditionOk,
      equipmentOk: inspection.equipmentOk,
      depositReturned: inspection.depositReturned,
      mileageAtReturn: inspection.mileage,
    })
    .then(invAll)
    .catch(logErr("completeRentalNoDamage"));
}

export function completeRentalWithDamage(
  id: number,
  inspection: ReturnInspection,
  damageAmount: number,
  note?: string,
) {
  state.inspections = new Map(state.inspections).set(id, inspection);
  emit();
  api
    .post(`/api/rentals/${id}/complete`, {
      dateActual: toIsoDay(inspection.dateActual),
      conditionOk: inspection.conditionOk,
      equipmentOk: inspection.equipmentOk,
      depositReturned: inspection.depositReturned,
      damageAmount,
      damageNotes: note ?? inspection.damageNotes ?? null,
      mileageAtReturn: inspection.mileage,
    })
    .then(() => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      invAll();
    })
    .catch(logErr("completeRentalWithDamage"));
}

export function addPayment(p: Omit<Payment, "id">) {
  // Payment (mock) использует date: string (DD.MM.YYYY) — конвертируем
  const paidAt = p.paid ? ruToIso(p.date) : null;
  api
    .post(`/api/payments`, {
      rentalId: p.rentalId,
      type: p.type,
      amount: p.amount,
      method: p.method,
      paid: p.paid,
      paidAt,
      note: p.note ?? null,
    })
    .then(invAll)
    .catch(logErr("addPayment"));
}

export function markPaymentPaid(id: number, paid = true) {
  api
    .patch(`/api/payments/${id}`, {
      paid,
      paidAt: paid ? new Date().toISOString() : null,
    })
    .then(invAll)
    .catch(logErr("markPaymentPaid"));
}

export function addRental(r: Omit<Rental, "id">): Rental {
  const body = {
    clientId: r.clientId,
    scooterId: r.scooterId ?? null,
    parentRentalId: r.parentRentalId ?? null,
    status: r.status,
    sourceChannel: r.sourceChannel,
    tariffPeriod: r.tariffPeriod,
    rate: r.rate,
    deposit: r.deposit,
    startAt: ruToIso(r.start, r.startTime),
    endPlannedAt: ruToIso(r.endPlanned, r.startTime),
    days: r.days,
    sum: r.sum,
    paymentMethod: r.paymentMethod,
    equipment: r.equipment,
    note: r.note ?? null,
  };
  api.post(`/api/rentals`, body).then(invAll).catch(logErr("addRental"));
  // локальный stub до возврата настоящего id
  return { ...r, id: Date.now() };
}

export function extendRental(
  oldId: number,
  extraDays: number,
  newRate: number,
  newTariffPeriod: Rental["tariffPeriod"],
): Rental | null {
  api
    .post(`/api/rentals/${oldId}/extend`, {
      extraDays,
      newRate,
      newTariffPeriod,
    })
    .then(invAll)
    .catch(logErr("extendRental"));
  // возвращаем stub — UI в подтверждении оплаты использует id из confirmForNewId,
  // но реальный id придёт через refetch; для MVP этого достаточно
  return null;
}

export function toggleTask(id: number) {
  const current = state.tasks.find((t) => t.id === id);
  const nextDone = !(current?.done ?? false);
  api
    .patch(`/api/tasks/${id}`, { done: nextDone })
    .then(() => queryClient.invalidateQueries({ queryKey: ["tasks"] }))
    .catch(logErr("toggleTask"));
}

function toIsoDay(ru: string): string {
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return ru;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/* ======================= hooks ======================= */

/**
 * Аренды — источник API. Локальный state.rentals используется для оптимистичных
 * мутаций (extendRental, revertOverdue, setRentalStatus) до подключения PATCH.
 * Когда будут мутации через API — локальный state уйдёт.
 */
export function useRentals(): Rental[] {
  const { data } = useApiRentals();
  const { data: scooters } = useApiScooters();
  useSyncExternalStore(subscribe, () => state.rentals, () => state.rentals);

  return useMemo(() => {
    if (!data) return [];
    const byId = new Map((scooters ?? []).map((s) => [s.id, s] as const));
    return data.map((r) => adaptRental(r, byId));
  }, [data, scooters]);
}

/**
 * Все id аренд в одной цепочке продлений (включая саму указанную).
 * Поднимаемся вверх по parentRentalId до корня, затем обходим всех потомков.
 */
export function getRentalChainIds(
  rentalId: number,
  rentals: Rental[],
): number[] {
  // Поднимаемся к корню
  let rootId = rentalId;
  const byId = new Map(rentals.map((r) => [r.id, r]));
  let cursor = byId.get(rentalId);
  while (cursor?.parentRentalId != null) {
    const parent = byId.get(cursor.parentRentalId);
    if (!parent) break;
    rootId = parent.id;
    cursor = parent;
  }
  // Обходим всех потомков
  const result: number[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    for (const r of rentals) {
      if (r.parentRentalId === id) queue.push(r.id);
    }
  }
  return result;
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
  const list = useRentals();
  if (id == null) return null;
  return list.find((r) => r.id === id) ?? null;
}

/** Платежи аренды из API, адаптированные под UI-тип Payment */
export function useRentalPayments(rentalId: number): Payment[] {
  const all = useApiPayments();
  return useMemo(() => {
    const rows = (all.data ?? []).filter((p) => p.rentalId === rentalId);
    return rows.map(toUiPayment);
  }, [all.data, rentalId]);
}

/** Платежи по цепочке аренд (родители + текущая + потомки) */
export function useChainPayments(rentalIds: number[]): Payment[] {
  const all = useApiPayments();
  return useMemo(() => {
    const set = new Set(rentalIds);
    return (all.data ?? [])
      .filter((p) => set.has(p.rentalId))
      .map(toUiPayment);
  }, [all.data, rentalIds]);
}

function toUiPayment(p: import("@/lib/api/payments").ApiPayment): Payment {
  const date = p.paidAt ?? p.scheduledOn ?? p.createdAt;
  return {
    id: p.id,
    rentalId: p.rentalId,
    type: p.type,
    amount: p.amount,
    date: isoToRu(date),
    method: p.method,
    paid: p.paid,
    note: p.note ?? undefined,
  };
}

function isoToRu(iso: string): string {
  const d = new Date(iso);
  const msk = new Date(d.getTime() + 3 * 3600 * 1000);
  const dd = String(msk.getUTCDate()).padStart(2, "0");
  const mm = String(msk.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${msk.getUTCFullYear()}`;
}

export function useRentalIncidents(rentalId: number): RentalIncident[] {
  const q = useQuery({
    queryKey: ["incidents", rentalId],
    queryFn: () =>
      api
        .get<{ items: Array<{
          id: number;
          rentalId: number;
          type: string;
          occurredOn: string;
          damage: number;
          paidTowardDamage: number;
          note: string | null;
        }> }>(`/api/incidents?rentalId=${rentalId}`)
        .then((r) => r.items),
  });
  return useMemo(
    () =>
      (q.data ?? []).map((i) => ({
        id: i.id,
        rentalId: i.rentalId,
        type: i.type,
        date: isoToRu(i.occurredOn),
        damage: i.damage,
        paid: i.paidTowardDamage,
        note: i.note ?? undefined,
      })),
    [q.data],
  );
}

export function useRentalTasks(rentalId: number): RentalTask[] {
  const q = useQuery({
    queryKey: ["tasks", rentalId],
    queryFn: () =>
      api
        .get<{ items: Array<{
          id: number;
          rentalId: number | null;
          title: string;
          dueAt: string;
          done: boolean;
        }> }>(`/api/tasks?rentalId=${rentalId}`)
        .then((r) => r.items),
  });
  return useMemo(
    () =>
      (q.data ?? []).map((t) => ({
        id: t.id,
        rentalId: t.rentalId ?? rentalId,
        title: t.title,
        due: isoToRuWithTime(t.dueAt),
        done: t.done,
      })),
    [q.data, rentalId],
  );
}

function isoToRuWithTime(iso: string): string {
  const d = new Date(iso);
  const msk = new Date(d.getTime() + 3 * 3600 * 1000);
  const dd = String(msk.getUTCDate()).padStart(2, "0");
  const mm = String(msk.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(msk.getUTCHours()).padStart(2, "0");
  const mi = String(msk.getUTCMinutes()).padStart(2, "0");
  const base = `${dd}.${mm}.${msk.getUTCFullYear()}`;
  return hh === "00" && mi === "00" ? base : `${base} ${hh}:${mi}`;
}

export function useInspection(rentalId: number): ReturnInspection | null {
  const inspections = useSyncExternalStore(
    subscribe,
    () => state.inspections,
    () => state.inspections,
  );
  return inspections.get(rentalId) ?? null;
}
