import { useSyncExternalStore } from "react";
import type { UploadedFile } from "./DocUpload";
import { CLIENTS as SEED_CLIENTS, type Client } from "@/lib/mock/clients";

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

export function useAllClients(): Client[] {
  useSyncExternalStore(subscribe, () => rev, () => 0);
  return getAllClients();
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
