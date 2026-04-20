import { useSyncExternalStore } from "react";
import type { UploadedFile } from "./DocUpload";

type State = {
  photos: Map<number, UploadedFile>;
  extraDocs: Map<number, UploadedFile[]>;
  extraPhones: Map<number, string>;
};

const state: State = {
  photos: new Map(),
  extraDocs: new Map(),
  extraPhones: new Map(),
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

export const clientStore = {
  getPhoto,
  setPhoto,
  getExtraDocs,
  setExtraDocs,
  addExtraDocs,
  getExtraPhone,
  setExtraPhone,
  subscribe,
};

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
