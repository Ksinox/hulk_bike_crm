import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type MaintenanceKind = "oil" | "repair" | "parts" | "other";

export type ApiMaintenance = {
  id: number;
  scooterId: number;
  kind: MaintenanceKind;
  performedOn: string; // YYYY-MM-DD
  amount: number;
  mileage: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type CreateMaintenanceInput = {
  scooterId: number;
  kind?: MaintenanceKind;
  performedOn: string;
  amount?: number;
  mileage?: number | null;
  note?: string | null;
};

export const maintenanceKeys = {
  all: ["scooter-maintenance"] as const,
  byScooter: (scooterId: number) =>
    [...maintenanceKeys.all, "scooter", scooterId] as const,
};

export function useScooterMaintenance(scooterId: number | null) {
  return useQuery({
    queryKey:
      scooterId != null
        ? maintenanceKeys.byScooter(scooterId)
        : maintenanceKeys.all,
    queryFn: () =>
      api
        .get<{ items: ApiMaintenance[] }>(
          `/api/scooter-maintenance?scooterId=${scooterId}`,
        )
        .then((r) => r.items),
    enabled: scooterId != null,
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaintenanceInput) =>
      api.post<ApiMaintenance>("/api/scooter-maintenance", input),
    onSuccess: (row) => {
      qc.invalidateQueries({
        queryKey: maintenanceKeys.byScooter(row.scooterId),
      });
    },
  });
}

export function useDeleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/scooter-maintenance/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: maintenanceKeys.all });
    },
  });
}
