import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type StorageCategory = {
  key: string;
  label: string;
  count: number;
  size: number;
};

export type StorageStats = {
  bucket: string;
  db: { size: number };
  files: { count: number; size: number; byCategory: StorageCategory[] };
  disk: { total: number; free: number; used: number } | null;
};

export type StorageFile = {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
};

export type StorageFolder = {
  prefix: string;
  name: string;
  label?: string;
};

export type StorageListing = {
  prefix: string;
  folders: StorageFolder[];
  files: StorageFile[];
};

export function useStorageStats() {
  return useQuery({
    queryKey: ["storage", "stats"],
    queryFn: () => api.get<StorageStats>("/api/storage/stats"),
    staleTime: 30_000,
  });
}

export function useStorageList(prefix: string) {
  return useQuery({
    queryKey: ["storage", "list", prefix],
    queryFn: () =>
      api.get<StorageListing>(
        `/api/storage/list?prefix=${encodeURIComponent(prefix)}`,
      ),
    staleTime: 15_000,
  });
}
