import { useMemo, useSyncExternalStore } from "react";
import {
  type ConfirmerRole,
  type Rental,
  type RentalStatus,
} from "@/lib/mock/rentals";
import { useQuery } from "@tanstack/react-query";
import {
  rentalsKeys,
  useApiRentals,
  useApiRentalsArchived,
} from "@/lib/api/rentals";
import { useApiScooters } from "@/lib/api/scooters";
import { paymentsKeys, useApiPayments } from "@/lib/api/payments";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { adaptRental } from "./rentalAdapter";

/* Платёж привязан к конкретной аренде */
export type PaymentType = "rent" | "deposit" | "fine" | "damage" | "refund" | "swap_fee";

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

/**
 * Сиды удалены — аренды/платежи/инциденты/задачи приходят с API.
 * `state` остался только как кеш для mutation-side-effects (inspections)
 * и временный «оптимистичный» буфер.
 */
const state: State = {
  rentals: [],
  payments: [],
  incidents: [],
  tasks: [],
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
  if (patch.rateUnit !== undefined) body.rateUnit = patch.rateUnit;
  if (patch.days !== undefined) body.days = patch.days;
  if (patch.sum !== undefined) body.sum = patch.sum;
  if (patch.depositReturned !== undefined) {
    body.depositReturned = patch.depositReturned;
  }
  if (patch.start !== undefined) {
    body.startAt = ruToIso(patch.start, patch.startTime);
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
  if (patch.equipmentJson !== undefined) {
    // v0.3.7: поддержка изменения экипировки в RentalEditModal.
    // Бэк перезаписывает равно тем что прислали (атомарно).
    body.equipmentJson = patch.equipmentJson;
  }
  if (Object.keys(body).length === 0) return;
  api.patch(`/api/rentals/${id}`, body).then(invAll).catch(logErr("patchRental"));
}

export function confirmRentalPayment(
  id: number,
  role: ConfirmerRole,
  byName: string,
  contractSigned: boolean,
  rentPaid: boolean,
  depositReceived: boolean,
) {
  const apiRole = role === "director" ? "boss" : "manager";
  api
    .post(`/api/rentals/${id}/confirm-payment`, {
      role: apiRole,
      byName,
      contractSigned,
      rentPaid,
      depositReceived,
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

/**
 * Создание аренды.
 *
 * SYNC-вариант: сразу возвращает Rental со stub-id (Date.now()).
 *   Используется когда нужен мгновенный фидбек, реальный id не критичен
 *   (например показать в списке оптимистично, обновится после invAll).
 *
 * ASYNC-вариант (addRentalAsync): возвращает Promise<Rental> с РЕАЛЬНЫМ
 *   id из API. Используется когда дальше нужно работать с ID на сервере
 *   (открыть превью документа, продлить и т.п.). Stub-id не подходит:
 *   /api/rentals/{stub_id}/document/... вернёт 404.
 */
export function addRental(
  r: Omit<Rental, "id"> & {
    depositItem?: string | null;
    equipmentJson?: { itemId?: number | null; name: string; price: number; free: boolean }[];
  },
): Rental {
  const body = buildRentalBody(r);
  api.post(`/api/rentals`, body).then(invAll).catch(logErr("addRental"));
  return { ...r, id: Date.now() };
}

export async function addRentalAsync(
  r: Omit<Rental, "id"> & {
    depositItem?: string | null;
    equipmentJson?: { itemId?: number | null; name: string; price: number; free: boolean }[];
  },
): Promise<Rental> {
  const body = buildRentalBody(r);
  const created = await api.post<{ id: number }>(`/api/rentals`, body);
  invAll();
  return { ...r, id: created.id };
}

function buildRentalBody(
  r: Omit<Rental, "id"> & {
    depositItem?: string | null;
    equipmentJson?: { itemId?: number | null; name: string; price: number; free: boolean }[];
  },
): Record<string, unknown> {
  return {
    clientId: r.clientId,
    scooterId: r.scooterId ?? null,
    parentRentalId: r.parentRentalId ?? null,
    status: r.status,
    sourceChannel: r.sourceChannel,
    tariffPeriod: r.tariffPeriod,
    rate: r.rate,
    rateUnit: r.rateUnit ?? "day",
    deposit: r.deposit,
    depositItem: r.depositItem ?? null,
    startAt: ruToIso(r.start, r.startTime),
    endPlannedAt: ruToIso(r.endPlanned, r.startTime),
    days: r.days,
    sum: r.sum,
    paymentMethod: r.paymentMethod,
    equipment: r.equipment,
    equipmentJson: r.equipmentJson ?? [],
    note: r.note ?? null,
  };
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
  return null;
}

/**
 * Async-вариант продления. Возвращает реальный объект новой аренды
 * с id из API. Используется когда нужно сразу:
 *   • переключить selectedId в Rentals (через navigate)
 *   • открыть превью документа договор+акт
 * Без этого navigate шёл на null, фокус переключиться не мог,
 * карточка показывала «Выберите аренду из списка».
 */
export async function extendRentalAsync(
  oldId: number,
  extraDays: number,
  newRate: number,
  newTariffPeriod: Rental["tariffPeriod"],
  newRateUnit: "day" | "week" = "day",
): Promise<{ id: number }> {
  const created = await api.post<{ id: number }>(
    `/api/rentals/${oldId}/extend`,
    { extraDays, newRate, newTariffPeriod, newRateUnit },
  );
  invAll();
  return created;
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
 * Архивные аренды. По бизнес-логике (v0.3.7) сюда попадают ТОЛЬКО
 * завершённые/отменённые/проблемные аренды. Активные / просроченные /
 * возвращаемые в архив не должны попадать никогда — это защищает от
 * легаси-данных, где у живой аренды по ошибке проставлен archivedAt.
 */
export function useArchivedRentals(): Rental[] {
  const { data } = useApiRentalsArchived();
  const { data: scooters } = useApiScooters();

  return useMemo(() => {
    if (!data) return [];
    const byId = new Map((scooters ?? []).map((s) => [s.id, s] as const));
    const ALLOWED = new Set([
      "completed",
      "cancelled",
      "completed_damage",
      "problem",
    ]);
    return data
      .filter((r) => ALLOWED.has(r.status))
      .map((r) => adaptRental(r, byId));
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
  // Обходим всех потомков. visited защищает от дублей: если в rentals
  // одна и та же связка пришла дважды (например из active + archived
  // во время рассогласованных refetch'ей React Query), её id попадал
  // бы в result несколько раз — и в RentalEditModal появлялись бы
  // визуальные дубли «ПРОДЛ. N #0024» с разными метками.
  const result: number[] = [];
  const visited = new Set<number>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    result.push(id);
    for (const r of rentals) {
      if (r.parentRentalId === id && !visited.has(r.id)) queue.push(r.id);
    }
  }
  return result;
}

export function useRentalsByClient(clientId: number): Rental[] {
  const rentals = useRentals();
  return useMemo(
    () => rentals.filter((r) => r.clientId === clientId),
    [rentals, clientId],
  );
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
