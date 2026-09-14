import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuthRole } from "./auth";
import type { PermissionKey } from "@/lib/permissions";

/** Ответ директора при создании аккаунта (14.09). */
export type StaffKind = "existing" | "new";

export type ApiStaffUser = {
  id: number;
  name: string;
  login: string;
  role: AuthRole;
  active: boolean;
  avatarColor: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** Должность словами (14.09). */
  position: string | null;
  staffKind: StaffKind | null;
  /** Итоговые права: у директора и создателя — всё. */
  permissions: Record<PermissionKey, boolean>;
};

export type CreateUserInput = {
  name: string;
  login: string;
  role: Exclude<AuthRole, "creator">;
  avatarColor?: "blue" | "green" | "orange" | "pink" | "purple";
  /** Если не задан — сервер сгенерирует и вернёт в ответе. */
  password?: string;
  position?: string;
  staffKind?: StaffKind;
  permissions?: Partial<Record<PermissionKey, boolean>>;
};

export type CreateUserResult = ApiStaffUser & {
  /** Плейн-пароль. Показывается один раз — сразу в модалке. */
  initialPassword: string;
  passwordGenerated: boolean;
};

export type PatchUserInput = {
  name?: string;
  role?: Exclude<AuthRole, "creator">;
  active?: boolean;
  avatarColor?: "blue" | "green" | "orange" | "pink" | "purple";
  position?: string | null;
  staffKind?: StaffKind;
  permissions?: Partial<Record<PermissionKey, boolean>>;
};

export type ResetPasswordResult = {
  ok: true;
  newPassword: string;
  generated: boolean;
};

export const usersKeys = {
  all: ["users"] as const,
  list: () => [...usersKeys.all, "list"] as const,
};

export function useApiUsers() {
  return useQuery({
    queryKey: usersKeys.list(),
    queryFn: () =>
      api
        .get<{ items: ApiStaffUser[] }>("/api/users")
        .then((r) => r.items),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      api.post<CreateUserResult>("/api/users", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: usersKeys.all });
    },
  });
}

export function usePatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: PatchUserInput }) =>
      api.patch<ApiStaffUser>(`/api/users/${args.id}`, args.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: usersKeys.all });
    },
  });
}

export function useResetUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; newPassword?: string }) =>
      api.post<ResetPasswordResult>(
        `/api/users/${args.id}/reset-password`,
        args.newPassword ? { newPassword: args.newPassword } : {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: usersKeys.all });
    },
  });
}

/** Выход аккаунта на всех устройствах без смены пароля (14.09). */
export function useLogoutEverywhere() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ ok: true }>(`/api/users/${id}/logout-everywhere`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: usersKeys.all });
    },
  });
}
