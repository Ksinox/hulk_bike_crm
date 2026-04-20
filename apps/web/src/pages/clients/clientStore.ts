import { useSyncExternalStore } from "react";
import type { UploadedFile } from "./DocUpload";

type State = {
  photos: Map<number, UploadedFile>;
  extraDocs: Map<number, UploadedFile[]>;
};

const state: State = {
  photos: new Map(),
  extraDocs: new Map(),
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

export const clientStore = {
  getPhoto,
  setPhoto,
  getExtraDocs,
  setExtraDocs,
  addExtraDocs,
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

const EMPTY: UploadedFile[] = [];
