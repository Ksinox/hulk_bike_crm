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
export type PaymentType =
  | "rent"
  | "deposit"
  | "fine"
  | "damage"
  | "refund"
  | "swap_fee"
  | "equipment_fee"
  | "parking"
  | "deposit_forfeit";

export type Payment = {
  id: number;
  rentalId: number;
  type: PaymentType;
  amount: number;
  date: string;
  method: "cash" | "card" | "transfer" | "deposit";
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
  // v0.6.51: чтобы хронология/лента событий обновилась сразу после правок
  // (например, «Изменить период» логирует было→стало) — раньше новое
  // событие появлялось только после перезагрузки страницы.
  queryClient.invalidateQueries({ queryKey: ["activity"] });
  // v0.9.1: долг/просрочка считаются на сервере из endPlanned. После любой
  // правки аренды («Изменить период», смена ставки/срока и т.п.) KPI
  // «Просрочка»/«Долг» и состав долга должны пересчитаться СРАЗУ, а не
  // только после перезагрузки страницы. Инвалидируем per-rental долг и
  // агрегат по всем арендам (дашборд, список, должники).
  queryClient.invalidateQueries({ queryKey: ["rental-debt"] });
  queryClient.invalidateQueries({ queryKey: ["debt-aggregate"] });
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

/**
 * Откат последнего действия аренды «в день совершения» (пока — продления).
 * Бэк бросает 409/422 (поздно / не последнее / не поддержано) — вызывающий
 * ловит и показывает сообщение. На успехе — инвалидируем кеш аренд/платежей.
 */
export async function rollbackLastPayment(
  rentalId: number,
  paymentId: number,
): Promise<void> {
  await api.post(`/api/rentals/${rentalId}/rollback-payment`, { paymentId });
  invAll();
}

/**
 * Откат безденежной операции «в день совершения» — якорь строка журнала
 * (начисление ручного долга, прощение штрафа/дней/просрочки).
 */
export async function rollbackAction(
  rentalId: number,
  activityId: number,
): Promise<void> {
  await api.post(`/api/rentals/${rentalId}/rollback-action`, { activityId });
  invAll();
}

/**
 * Откат завершения аренды (кнопка на строке «Завершена аренда» в хронологии,
 * условия «сегодня + последнее действие» проверяет вызывающий). Использует
 * существующий /revert-completion: статус→active, инспекция и refund-платёж
 * удаляются, скутер снова занят.
 */
export async function rollbackCompletion(rentalId: number): Promise<void> {
  await api.post(`/api/rentals/${rentalId}/revert-completion`, {});
  invAll();
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

export function patchRental(
  id: number,
  patch: Partial<Rental>,
  opts?: {
    /**
     * v0.8.x: «Изменить период» для продлённой аренды синхронизирует rent-
     * платёж КОНКРЕТНОЙ (последней) ветки, а не первый платёж. Бэк по этому id
     * подгоняет amount платежа под новую сумму ветки.
     */
    rentPaymentId?: number;
  },
) {
  // Пропускаем большинство полей как есть; даты переводим в ISO
  const body: Record<string, unknown> = {};
  if (opts?.rentPaymentId != null) body.rentPaymentId = opts.rentPaymentId;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.note !== undefined) body.note = patch.note ?? null;
  if (patch.rate !== undefined) body.rate = patch.rate;
  if (patch.rateUnit !== undefined) body.rateUnit = patch.rateUnit;
  if (patch.days !== undefined) body.days = patch.days;
  if (patch.sum !== undefined) body.sum = patch.sum;
  // v0.6.50: коррекция периода («Изменить период») присылает пересчитанную
  // тарифную ступень. БД enum принимает short/week/month — "day" сюда не
  // приходит (periodForDays его не возвращает).
  if (patch.tariffPeriod !== undefined && patch.tariffPeriod !== "day") {
    body.tariffPeriod = patch.tariffPeriod;
  }
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

export function revertOverdue(id: number) {
  api
    .post(`/api/rentals/${id}/revert-overdue`, {})
    .then(invAll)
    .catch(logErr("revertOverdue"));
}

/**
 * v0.6.1: scooterNextStatus — что делать со скутером после завершения.
 * Если не передан — бэк ставит rental_pool (старое поведение).
 */
export type ScooterNextStatus =
  | "rental_pool"
  | "repair"
  | "for_sale"
  | "disassembly"
  | "buyout";

export function completeRentalNoDamage(
  id: number,
  inspection: ReturnInspection,
  scooterNextStatus?: ScooterNextStatus,
): Promise<void> {
  // Локально кешируем inspection (сервер хранит в returnInspections — приходит отдельным запросом, но для UI нужен synchronous hook)
  state.inspections = new Map(state.inspections).set(id, inspection);
  emit();
  return api
    .post(`/api/rentals/${id}/complete`, {
      dateActual: toIsoDay(inspection.dateActual),
      conditionOk: inspection.conditionOk,
      equipmentOk: inspection.equipmentOk,
      depositReturned: inspection.depositReturned,
      mileageAtReturn: inspection.mileage,
      ...(scooterNextStatus ? { scooterNextStatus } : {}),
    })
    .then(invAll)
    .catch((e) => {
      logErr("completeRentalNoDamage")(e);
      throw e;
    });
}

export function completeRentalWithDamage(
  id: number,
  inspection: ReturnInspection,
  damageAmount: number,
  note?: string,
  scooterNextStatus?: ScooterNextStatus,
): Promise<void> {
  state.inspections = new Map(state.inspections).set(id, inspection);
  emit();
  return api
    .post(`/api/rentals/${id}/complete`, {
      dateActual: toIsoDay(inspection.dateActual),
      conditionOk: inspection.conditionOk,
      equipmentOk: inspection.equipmentOk,
      depositReturned: inspection.depositReturned,
      damageAmount,
      damageNotes: note ?? inspection.damageNotes ?? null,
      mileageAtReturn: inspection.mileage,
      ...(scooterNextStatus ? { scooterNextStatus } : {}),
    })
    .then(() => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      invAll();
    })
    .catch((e) => {
      logErr("completeRentalWithDamage")(e);
      throw e;
    });
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

export function addRentalIncident(
  rentalId: number,
  inc: Omit<RentalIncident, "id" | "rentalId" | "paid"> & { paid?: number },
) {
  api
    .post(`/api/incidents`, {
      rentalId,
      type: inc.type,
      occurredOn: ruToIso(inc.date).slice(0, 10),
      damage: inc.damage,
      note: inc.note ?? null,
    })
    .then(() => {
      queryClient.invalidateQueries({ queryKey: ["incidents", rentalId] });
      invAll();
    })
    .catch(logErr("addRentalIncident"));
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
    customTariff: r.customTariff ?? false,
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
  /** v0.4.45: если false — бэк создаёт rent-платёж как paid=false
   *  (placeholder), фронт затем открывает PaymentAcceptDialog для
   *  фиксации фактически принятой суммы (с расчётом депозит/просрочка). */
  autoMarkPaid = true,
): Promise<{ id: number }> {
  const created = await api.post<{ id: number }>(
    `/api/rentals/${oldId}/extend`,
    { extraDays, newRate, newTariffPeriod, newRateUnit, autoMarkPaid },
  );
  invAll();
  return created;
}

/**
 * v0.4.49: продление БЕЗ chain — обновляет endPlannedAt/days/sum
 * существующей аренды и создаёт rent-payment. Возвращает id той же
 * аренды (для совместимости с extendRentalAsync интерфейсом).
 */
export async function extendInplaceAsync(
  rentalId: number,
  extraDays: number,
  newRate: number,
  newTariffPeriod: Rental["tariffPeriod"],
  newRateUnit: "day" | "week" = "day",
  autoMarkPaid = true,
  /** #177: экипировка НА НОВЫЙ ПЕРИОД — полный набор для продления.
   *  Бэкенд берёт по нему дневную стоимость платной экипировки (× дни
   *  продления, НЕ остаток текущего периода) и фиксирует набор как текущую
   *  экипировку аренды. Не передан — экипировка не трогается. */
  equipmentJson?: Array<{
    itemId?: number | null;
    name: string;
    price: number;
    free: boolean;
  }>,
): Promise<{ id: number }> {
  await api.post(`/api/rentals/${rentalId}/extend-inplace`, {
    extraDays,
    newRate,
    newTariffPeriod,
    newRateUnit,
    autoMarkPaid,
    ...(equipmentJson ? { equipmentJson } : {}),
  });
  invAll();
  return { id: rentalId };
}

/** v0.4.49: пополнение залога. Только для денежных залогов. */
export async function topupSecurityAsync(
  rentalId: number,
  amount: number,
  method: "cash" | "transfer",
): Promise<void> {
  await api.post(`/api/rentals/${rentalId}/security-topup`, {
    amount,
    method,
  });
  invAll();
}

/** v0.4.49: смена экипировки активной аренды.
 *  payNow=true → сразу payment(equipment_fee, paid=true)
 *  payNow=false → debt_entry(manual_charge) при доплате,
 *                 или возврат на clients.deposit_balance при удешевлении. */
export async function equipmentChangeAsync(args: {
  rentalId: number;
  newEquipmentJson: Array<{
    itemId?: number | null;
    name: string;
    price: number;
    free: boolean;
  }>;
  payNow: boolean;
  method?: "cash" | "transfer";
  comment?: string;
  refundTo?: "cash" | "deposit";
  refundMethod?: "cash" | "transfer";
}): Promise<void> {
  await api.post(`/api/rentals/${args.rentalId}/equipment-change`, {
    newEquipmentJson: args.newEquipmentJson,
    payNow: args.payNow,
    method: args.method,
    comment: args.comment,
    refundTo: args.refundTo,
    refundMethod: args.refundMethod,
  });
  invAll();
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

/**
 * v0.9.x: «Эта аренда» — оплата за ТЕКУЩИЙ (последний) период цепочки.
 * Единый источник истины для KPI «Эта аренда» в карточке и колонки
 * «Сумма аренды» в списке (F5). Раньше список показывал rental.sum
 * (накопительную по всем продлениям) — расходилось с карточкой.
 *
 *   rentPart      = сумма последнего «периодного» rent-платежа
 *                   (базовый/продление; НЕ ручной долг и НЕ выкуп просрочки)
 *                   либо rental.sum, если периодных платежей ещё нет.
 *   surchargePart = доплаты ТЕКУЩЕГО периода (не-период rent-платежи,
 *                   проведённые с начала последнего периода).
 *   total         = rentPart + surchargePart  ← это и есть «Эта аренда».
 *
 * Классификация по заметке — та же, что у ревизора (reconcile).
 * chainPayments — UI-платежи цепочки (см. useChainPayments / toUiPayment),
 * с датой в формате «дд.мм.гггг».
 */
export function computeCurrentPeriod(
  chainPayments: Payment[],
  rental: Pick<Rental, "sum">,
): { total: number; rentPart: number; surchargePart: number; extendCount: number } {
  const rentPays = chainPayments.filter((p) => p.type === "rent");
  const isManualNote = (n?: string | null) => /ручн[а-яё]*\s+долг/i.test(n ?? "");
  const isOverdueNote = (n?: string | null) => /просрочк/i.test(n ?? "");
  const isPeriodPay = (p: { note?: string | null }) =>
    !isManualNote(p.note) && !isOverdueNote(p.note);
  const isExtNote = (n?: string | null) => /продлени[ея]/i.test(n ?? "");
  const payTs = (s?: string): number => {
    const m = (s ?? "").match(
      /^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/,
    );
    if (!m) return 0;
    return new Date(
      +m[3]!,
      +m[2]! - 1,
      +m[1]!,
      m[4] ? +m[4] : 0,
      m[5] ? +m[5] : 0,
    ).getTime();
  };
  const byDate = (
    a: { date?: string; id?: number },
    b: { date?: string; id?: number },
  ) => payTs(a.date) - payTs(b.date) || (a.id ?? 0) - (b.id ?? 0);
  const periodPays = rentPays.filter(isPeriodPay);
  const extendCount = periodPays.filter((p) => isExtNote(p.note)).length;
  const lastPeriodPay = periodPays.length
    ? [...periodPays].sort(byDate)[periodPays.length - 1]!
    : null;
  const rentPart = lastPeriodPay ? lastPeriodPay.amount : rental.sum;
  const periodTs = lastPeriodPay ? payTs(lastPeriodPay.date) : 0;
  const surchargePart = rentPays
    .filter((p) => !isPeriodPay(p) && payTs(p.date) >= periodTs)
    .reduce((s, p) => s + (p.amount ?? 0), 0);
  return { total: rentPart + surchargePart, rentPart, surchargePart, extendCount };
}

/**
 * F5: карта rentalId → «Эта аренда» (текущий период) для строк списка.
 * Считает ровно как карточка: цепочка → её rent-платежи → последний период
 * + доплаты периода. Платежи берём одним bulk-запросом (useApiPayments),
 * цепочки — из active+archived. Ключ — id переданной аренды (любого сегмента
 * цепочки); значение одинаково для всей цепочки, кроме fallback rental.sum,
 * поэтому считаем по конкретной строке.
 */
export function useCurrentPeriodSums(rentalsForRows: Rental[]): Map<number, number> {
  const paymentsQ = useApiPayments();
  const active = useRentals();
  const archived = useArchivedRentals();
  return useMemo(() => {
    const all = [...active, ...archived];
    const byId = new Map(all.map((r) => [r.id, r] as const));
    const byRental = new Map<number, import("@/lib/api/payments").ApiPayment[]>();
    for (const p of paymentsQ.data ?? []) {
      const arr = byRental.get(p.rentalId);
      if (arr) arr.push(p);
      else byRental.set(p.rentalId, [p]);
    }
    const out = new Map<number, number>();
    for (const r of rentalsForRows) {
      const chainIds = getRentalChainIds(r.id, all).filter((id) => {
        const x = byId.get(id);
        return !x || !x.archivedBy;
      });
      const chainPays = chainIds
        .flatMap((id) => byRental.get(id) ?? [])
        .map(toUiPayment);
      out.set(r.id, computeCurrentPeriod(chainPays, r).total);
    }
    return out;
  }, [rentalsForRows, paymentsQ.data, active, archived]);
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
