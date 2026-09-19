import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Сторонние ремонты (06.09, деньги — 2.0.2) — заказ-наряды на чужую технику.
 *
 * Деньги считает сервер и отдаёт в totals: к оплате = работы + запчасти −
 * скидка, внесено = сумма платежей, остаток = к оплате − внесено. На фронте
 * их не пересчитываем, чтобы цифра была одна и та же в списке, в карточке,
 * в накладной и в статистике.
 */

export type ServiceOrderItem = {
  id: number;
  orderId: number;
  kind: "work" | "part";
  priceItemId: number | null;
  name: string;
  qty: number;
  price: number;
  /** Закуп за штуку — приходит только с правом на прибыль ремонтов. */
  cost?: number;
  sortOrder: number;
  createdAt: string;
};

export type ServiceOrderPayment = {
  id: number;
  orderId: number;
  kind: "advance" | "payment" | "refund";
  /** У возврата — отрицательная. */
  amount: number;
  method: "cash" | "transfer" | "mixed";
  cashAmount: number;
  transferAmount: number;
  discount: number;
  paidAt: string;
  note: string | null;
  prevStatus: string | null;
  createdByUserId: number | null;
  createdAt: string;
};

export type ServiceOrderTotals = {
  works: number;
  parts: number;
  /** Работы + запчасти, до скидки. */
  revenue: number;
  discount: number;
  /** К оплате. */
  due: number;
  cost?: number;
  /** Общая прибыль: к оплате − закуп запчастей. */
  profit?: number;
  /** Доля механика с прибыли (правки 7.0). */
  mechanicShare?: number;
  /** Наша прибыль — за вычетом доли механика. */
  ourProfit?: number;
  /** Внесено всего (возвраты вычтены). */
  paid: number;
  /** Остаток к оплате. */
  left: number;
  /** Внесли больше, чем к оплате. */
  overpaid: number;
};

export type ServiceOrderStatus = "in_work" | "done" | "paid" | "cancelled";

export type ServiceOrder = {
  id: number;
  number: number;
  status: ServiceOrderStatus;
  clientId: number | null;
  customerName: string;
  customerPhone: string | null;
  vehicle: string;
  vehicleNumber: string | null;
  complaint: string | null;
  note: string | null;
  acceptedAt: string;
  completedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  statusBeforeCancel: string | null;
  paymentMethod: "cash" | "transfer" | "mixed" | null;
  paidAmount: number | null;
  discount: number;
  cashAmount: number;
  transferAmount: number;
  masterUserId: number | null;
  /** Механик (правки 7.0) и его процент — копия на момент назначения. */
  mechanicId: number | null;
  mechanicName: string | null;
  /** Приходит только с правом на прибыль ремонтов. */
  mechanicPercent?: number | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  items: ServiceOrderItem[];
  payments: ServiceOrderPayment[];
  totals: ServiceOrderTotals;
};

const key = ["service-orders"] as const;

export function useServiceOrders() {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<{ orders: ServiceOrder[] }>("/api/service-orders"),
    staleTime: 20_000,
    select: (d) => d.orders,
  });
}

/**
 * Ответ мутации сразу кладём в кэш списка — карточка обновляется без
 * ожидания повторного запроса (иначе «остаток» мигал старой цифрой).
 */
function useSettle() {
  const qc = useQueryClient();
  return (order?: ServiceOrder | null, savedToPrice?: SavedToPrice[]) => {
    // Своя позиция ушла в прайс — список прайса обновить.
    if (savedToPrice?.length) void qc.invalidateQueries({ queryKey: ["price-list"] });
    if (order) {
      qc.setQueryData<{ orders: ServiceOrder[] }>(key, (prev) => {
        if (!prev) return prev;
        const has = prev.orders.some((o) => o.id === order.id);
        return {
          orders: has
            ? prev.orders.map((o) => (o.id === order.id ? order : o))
            : [order, ...prev.orders],
        };
      });
    }
    void qc.invalidateQueries({ queryKey: key });
    // Аналитика считает ремонты за период — обновим и её.
    void qc.invalidateQueries({ queryKey: ["analytics"] });
  };
}

export type PayMethodValue = "cash" | "transfer" | "mixed";

export type NewServiceItem = {
  kind: "work" | "part";
  name: string;
  qty?: number;
  price?: number;
  cost?: number;
  priceItemId?: number | null;
  /** Своя позиция — сохранить в прайс работ или запчастей (2.0.2). */
  saveToPrice?: boolean;
};

export type NewServiceOrder = {
  customerName: string;
  customerPhone?: string | null;
  clientId?: number | null;
  vehicle: string;
  vehicleNumber?: string | null;
  complaint?: string | null;
  note?: string | null;
  masterUserId?: number | null;
  mechanicId?: number | null;
  items?: NewServiceItem[];
  advance?: { amount: number; method: PayMethodValue; cashAmount?: number };
};

export type SavedToPrice = { name: string; kind: "service" | "part"; created: boolean };

type OrderResp = { order: ServiceOrder; paymentId?: number; savedToPrice?: SavedToPrice[] };

export function useCreateServiceOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (body: NewServiceOrder) => api.post<OrderResp>("/api/service-orders", body),
    onSuccess: (r) => settle(r.order, r.savedToPrice),
  });
}

export function usePatchServiceOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Omit<NewServiceOrder, "items" | "advance">>) =>
      api.patch<OrderResp>(`/api/service-orders/${id}`, body),
    onSuccess: (r) => settle(r.order),
  });
}

export function useAddServiceOrderItem() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ orderId, ...body }: { orderId: number } & NewServiceItem) =>
      api.post<OrderResp>(`/api/service-orders/${orderId}/items`, body),
    onSuccess: (r) => settle(r.order, r.savedToPrice),
  });
}

export function usePatchServiceOrderItem() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({
      itemId,
      ...body
    }: {
      itemId: number;
      name?: string;
      qty?: number;
      price?: number;
      cost?: number;
    }) => api.patch<OrderResp>(`/api/service-orders/items/${itemId}`, body),
    onSuccess: (r) => settle(r.order),
  });
}

export function useDeleteServiceOrderItem() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (itemId: number) =>
      api.delete<OrderResp>(`/api/service-orders/items/${itemId}`),
    onSuccess: (r) => settle(r.order),
  });
}

export function useCompleteServiceOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<OrderResp>(`/api/service-orders/${id}/complete`, {}),
    onSuccess: (r) => settle(r.order),
  });
}

/** Правки 7.0 (п.10): «Готов к выдаче» → «В работе». Только директор. */
export function useUncompleteServiceOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<OrderResp>(`/api/service-orders/${id}/uncomplete`, {}),
    onSuccess: (r) => settle(r.order),
  });
}

/* ---------- Механики (правки 7.0, п.2) ---------- */

export type ServiceMechanic = {
  id: number;
  name: string;
  /** Процент с прибыли ремонта — только с правом на прибыль ремонтов. */
  percent?: number;
  archivedAt: string | null;
  createdAt: string;
};

const mechKey = ["service-mechanics"] as const;

export function useServiceMechanics() {
  return useQuery({
    queryKey: mechKey,
    queryFn: () => api.get<{ mechanics: ServiceMechanic[] }>("/api/service-orders/mechanics"),
    staleTime: 60_000,
    select: (d) => d.mechanics,
  });
}

export function useSaveServiceMechanic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: number;
      name?: string;
      percent?: number;
      archived?: boolean;
    }) =>
      id
        ? api.patch<{ mechanic: ServiceMechanic }>(`/api/service-orders/mechanics/${id}`, body)
        : api.post<{ mechanic: ServiceMechanic }>("/api/service-orders/mechanics", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mechKey });
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** Аванс — часть суммы, остаток считается сам. */
export function useServiceAdvance() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      amount: number;
      method: PayMethodValue;
      cashAmount?: number;
    }) => api.post<OrderResp>(`/api/service-orders/${id}/advance`, body),
    onSuccess: (r) => settle(r.order),
  });
}

/** Расчёт при выдаче: остаток (можно со скидкой) — ремонт оплачен. */
export function useSettleServiceOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      method: PayMethodValue;
      cashAmount?: number;
      discount: number;
      /** Остаток, который видел оператор. */
      expected: number;
    }) => api.post<OrderResp>(`/api/service-orders/${id}/settle`, body),
    onSuccess: (r) => settle(r.order),
  });
}

/** Вернули клиенту переплату. */
export function useServiceRefund() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      amount: number;
      method: PayMethodValue;
      cashAmount?: number;
    }) => api.post<OrderResp>(`/api/service-orders/${id}/refund`, body),
    onSuccess: (r) => settle(r.order),
  });
}

/** Отменить последний платёж (для кнопки «Отменить» в уведомлении). */
export function useUndoServicePayment() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (paymentId: number) =>
      api.delete<OrderResp>(`/api/service-orders/payments/${paymentId}`),
    onSuccess: (r) => settle(r.order),
  });
}

export function useCancelServiceOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<OrderResp>(`/api/service-orders/${id}/cancel`, {}),
    onSuccess: (r) => settle(r.order),
  });
}

/** Вернуть отменённый ремонт в работу. */
export function useReopenServiceOrder() {
  const settle = useSettle();
  return useMutation({
    mutationFn: ({ id, keepAdvance }: { id: number; keepAdvance?: boolean }) =>
      api.post<OrderResp>(`/api/service-orders/${id}/reopen`, { keepAdvance }),
    onSuccess: (r) => settle(r.order),
  });
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** Накладная по ремонту: html — предпросмотр и печать, docx — Word. */
export function serviceInvoiceUrl(id: number, format: "html" | "docx" = "html") {
  return `${API_BASE}/api/service-orders/${id}/document${format === "docx" ? "?format=docx" : ""}`;
}
