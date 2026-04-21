import { useMemo, useSyncExternalStore } from "react";
import type { UploadedFile } from "./DocUpload";
import { CLIENTS as SEED_CLIENTS, type Client } from "@/lib/mock/clients";
import { useApiClients } from "@/lib/api/clients";
import { useApiRentals } from "@/lib/api/rentals";
import type { ApiRental } from "@/lib/api/types";
import { adaptClient } from "./clientAdapter";

type State = {
  photos: Map<number, UploadedFile>;
  extraDocs: Map<number, UploadedFile[]>;
  extraPhones: Map<number, string>;
  addedClients: Client[];
  /** id клиентов, помеченных «не выходит на связь» */
  unreachable: Set<number>;
};

const state: State = {
  photos: new Map(),
  extraDocs: new Map(),
  extraPhones: new Map(),
  addedClients: [],
  unreachable: new Set(),
};

let rev = 0;

const listeners = new Set<() => void>();

function emit() {
  rev = (rev + 1) & 0x7fffffff;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getPhoto(id: number): UploadedFile | null {
  return state.photos.get(id) ?? null;
}

function setPhoto(id: number, f: UploadedFile | null) {
  if (f) state.photos.set(id, f);
  else state.photos.delete(id);
  emit();
}

function getExtraDocs(id: number): UploadedFile[] {
  return state.extraDocs.get(id) ?? [];
}

function setExtraDocs(id: number, list: UploadedFile[]) {
  if (list.length === 0) state.extraDocs.delete(id);
  else state.extraDocs.set(id, list);
  emit();
}

function addExtraDocs(id: number, list: UploadedFile[]) {
  const current = getExtraDocs(id);
  setExtraDocs(id, [...current, ...list]);
}

function getExtraPhone(id: number): string | null {
  return state.extraPhones.get(id) ?? null;
}

function setExtraPhone(id: number, phone: string | null) {
  const trimmed = phone?.trim() ?? "";
  if (trimmed) state.extraPhones.set(id, trimmed);
  else state.extraPhones.delete(id);
  emit();
}

function isUnreachable(id: number): boolean {
  return state.unreachable.has(id);
}

function setUnreachable(id: number, on: boolean) {
  const next = new Set(state.unreachable);
  if (on) next.add(id);
  else next.delete(id);
  state.unreachable = next;
  emit();
}

function getUnreachableSet(): Set<number> {
  return state.unreachable;
}

function addClient(data: Omit<Client, "id">): Client {
  const maxSeed = SEED_CLIENTS.reduce((m, c) => Math.max(m, c.id), 0);
  const maxAdded = state.addedClients.reduce((m, c) => Math.max(m, c.id), 0);
  const id = Math.max(maxSeed, maxAdded) + 1;
  const client: Client = { ...data, id };
  state.addedClients = [...state.addedClients, client];
  emit();
  return client;
}

function getAllClients(): Client[] {
  return [...SEED_CLIENTS, ...state.addedClients];
}

export const clientStore = {
  getPhoto,
  setPhoto,
  getExtraDocs,
  setExtraDocs,
  addExtraDocs,
  getExtraPhone,
  setExtraPhone,
  isUnreachable,
  setUnreachable,
  getUnreachableSet,
  addClient,
  getAllClients,
  subscribe,
};

export function useClientUnreachable(id: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.unreachable.has(id),
    () => false,
  );
}

export function useUnreachableSet(): Set<number> {
  return useSyncExternalStore(
    subscribe,
    () => state.unreachable,
    () => state.unreachable,
  );
}

/**
 * Единственный источник клиентов в UI.
 * Источник данных — API (Postgres). Локально через React Query кешируется.
 * Локальные `addedClients` пока сохраняются в памяти на случай если API временно
 * недоступен или пока не подключён POST /api/clients — но в нормальном режиме
 * они не используются.
 */
export function useAllClients(): Client[] {
  const { data: apiClients } = useApiClients();
  const { data: apiRentals } = useApiRentals();
  useSyncExternalStore(subscribe, () => rev, () => 0);

  return useMemo(() => {
    if (!apiClients) return state.addedClients;
    const { rentsByClient, debtByClient } = computeStats(apiRentals ?? []);
    const mapped = apiClients.map((a) => ({
      ...adaptClient(a),
      rents: rentsByClient.get(a.id) ?? 0,
      debt: debtByClient.get(a.id) ?? 0,
    }));
    return [...mapped, ...state.addedClients];
  }, [apiClients, apiRentals]);
}

/**
 * Вычисляем для каждого клиента:
 *   rents — число аренд в истории
 *   debt  — сумма просрочек по формуле (тариф + 250 ₽) × дней просрочки
 * «Сегодня» по демо-таймлайну — 13.10.2026.
 */
function computeStats(rentals: ApiRental[]): {
  rentsByClient: Map<number, number>;
  debtByClient: Map<number, number>;
} {
  const today = new Date(2026, 9, 13);
  const rentsByClient = new Map<number, number>();
  const debtByClient = new Map<number, number>();
  for (const r of rentals) {
    rentsByClient.set(r.clientId, (rentsByClient.get(r.clientId) ?? 0) + 1);
    if (r.status !== "overdue") continue;
    const end = new Date(r.endPlannedAt);
    const diffDays = Math.max(
      0,
      Math.round((today.getTime() - end.getTime()) / 86_400_000),
    );
    if (diffDays <= 0) continue;
    const add = diffDays * (r.rate + 250);
    debtByClient.set(r.clientId, (debtByClient.get(r.clientId) ?? 0) + add);
  }
  return { rentsByClient, debtByClient };
}

export function useClientPhoto(id: number): UploadedFile | null {
  return useSyncExternalStore(
    subscribe,
    () => state.photos.get(id) ?? null,
    () => null,
  );
}

export function useClientExtraDocs(id: number): UploadedFile[] {
  return useSyncExternalStore(
    subscribe,
    () => state.extraDocs.get(id) ?? EMPTY,
    () => EMPTY,
  );
}

export function useClientExtraPhone(id: number): string | null {
  return useSyncExternalStore(
    subscribe,
    () => state.extraPhones.get(id) ?? null,
    () => null,
  );
}

const EMPTY: UploadedFile[] = [];
