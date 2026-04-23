import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type AuthRole = "creator" | "director" | "admin" | "mechanic" | "accountant";

export type AuthUser = {
  id: number;
  name: string;
  login: string;
  role: AuthRole;
  avatarColor: string;
  /** true — при ближайшем входе обязан сменить пароль, UI блокирует работу до смены */
  mustChangePassword?: boolean;
};

export type LoginTile = {
  id: number;
  name: string;
  login: string;
  role: AuthRole;
  avatarColor: string;
};

export const authKeys = {
  me: ["auth", "me"] as const,
  tiles: (unlock: string) => ["auth", "tiles", unlock] as const,
};

export function useMe() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: () => api.get<AuthUser>("/api/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLoginTiles(unlock: string) {
  return useQuery({
    queryKey: authKeys.tiles(unlock),
    queryFn: () => {
      const qs = unlock ? `?unlock=${encodeURIComponent(unlock)}` : "";
      return api
        .get<{ items: LoginTile[] }>(`/api/auth/tiles${qs}`)
        .then((r) => r.items);
    },
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { login: string; password: string; remember: boolean }) =>
      api.post<AuthUser>("/api/auth/login", input),
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: true }>("/api/auth/logout", {}),
    onSuccess: () => {
      qc.setQueryData(authKeys.me, null);
      qc.clear();
    },
  });
}

export type UpdateMeInput = {
  name?: string;
  avatarColor?: "blue" | "green" | "orange" | "pink" | "purple";
};

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) =>
      api.patch<AuthUser>("/api/auth/me", input),
    onSuccess: (user) => {
      qc.setQueryData(authKeys.me, user);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api.post<{ ok: true }>("/api/auth/change-password", input),
  });
}
