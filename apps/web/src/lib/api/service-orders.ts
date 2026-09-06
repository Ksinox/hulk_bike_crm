import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Сторонние ремонты (06.09) — заказ-наряды на чужую технику.
 *
 * Деньги считает сервер и отдаёт в totals: выручка = работы + запчасти,
 * себестоимость = закуп запчастей, прибыль = разница. На фронте их не
 * пересчитываем, чтобы цифра была одна и та же в списке, в карточке и в
 * статистике.
 */

export type ServiceOrderItem = {
  id: number;
  orderId: number;
  kind: "work" | "part";
  priceItemId: number | null;
  name: string;
  qty: number;
  price: number;
  cost: number;
  sortOrder: number;
  createdAt: string;
};

export type ServiceOrderTotals = {
  works: number;
  parts: number;
  revenue: number;
  cost: number;
  profit: number;
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
  paymentMethod: "cash" | "transfer" | null;
  paidAmount: number | null;
  masterUserId: number | null;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  items: ServiceOrderItem[];
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

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: key });
    // Аналитика считает ремонты за период — обновим и её.
    void qc.invalidateQueries({ queryKey: ["analytics"] });
  };
}

export type NewServiceOrder = {
  customerName: string;
  customerPhone?: string | null;
  clientId?: number | null;
  vehicle: string;
  vehicleNumber?: string | null;
  complaint?: string | null;
  note?: string | null;
  masterUserId?: number | null;
};

export function useCreateServiceOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: NewServiceOrder) =>
      api.post<{ order: ServiceOrder }>("/api/service-orders", body),
    onSuccess: invalidate,
  });
}

export function usePatchServiceOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<NewServiceOrder>) =>
      api.patch<{ order: ServiceOrder }>(`/api/service-orders/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useAddServiceOrderItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      orderId,
      ...body
    }: {
      orderId: number;
      kind: "work" | "part";
      name: string;
      qty?: number;
      price?: number;
      cost?: number;
      priceItemId?: number | null;
    }) =>
      api.post<{ order: ServiceOrder }>(
        `/api/service-orders/${orderId}/items`,
        body,
      ),
    onSuccess: invalidate,
  });
}

export function usePatchServiceOrderItem() {
  const invalidate = useInvalidate();
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
    }) =>
      api.patch<{ order: ServiceOrder }>(
        `/api/service-orders/items/${itemId}`,
        body,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteServiceOrderItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (itemId: number) =>
      api.delete<{ order: ServiceOrder }>(`/api/service-orders/items/${itemId}`),
    onSuccess: invalidate,
  });
}

export function useCompleteServiceOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ order: ServiceOrder }>(`/api/service-orders/${id}/complete`, {}),
    onSuccess: invalidate,
  });
}

export function usePayServiceOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      method,
    }: {
      id: number;
      amount?: number;
      method: "cash" | "transfer";
    }) =>
      api.post<{ order: ServiceOrder }>(`/api/service-orders/${id}/pay`, {
        amount,
        method,
      }),
    onSuccess: invalidate,
  });
}

export function useCancelServiceOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ order: ServiceOrder }>(`/api/service-orders/${id}/cancel`, {}),
    onSuccess: invalidate,
  });
}
