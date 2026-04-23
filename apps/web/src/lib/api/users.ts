import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AuthRole } from "./auth";

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
};

export type CreateUserInput = {
  name: string;
  login: string;
  role: Exclude<AuthRole, "creator">;
  avatarColor?: "blue" | "green" | "orange" | "pink" | "purple";
  /** Если не задан — сервер сгенерирует и вернёт в ответе. */
  password?: string;
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
