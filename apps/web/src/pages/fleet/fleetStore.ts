import { useSyncExternalStore } from "react";
import { FLEET, type FleetScooter, type ScooterBaseStatus } from "@/lib/mock/fleet";
import type { UploadedFile } from "@/pages/clients/DocUpload";

export type ScooterDocKind = "pts" | "sts" | "osago" | "purchase";

export type ScooterDocs = {
  pts: UploadedFile | null;
  sts: UploadedFile | null;
  osago: UploadedFile | null;
  purchase: UploadedFile | null;
  /** ДД.ММ.ГГГГ — дата окончания ОСАГО */
  osagoValidUntil?: string;
};

function emptyDocs(): ScooterDocs {
  return { pts: null, sts: null, osago: null, purchase: null };
}

type State = {
  scooters: FleetScooter[];
  /** Патчи, накладываемые поверх мок-данных */
  patches: Map<number, Partial<FleetScooter>>;
  docs: Map<number, ScooterDocs>;
};

function applyPatches(
  base: FleetScooter[],
  patches: Map<number, Partial<FleetScooter>>,
): FleetScooter[] {
  if (patches.size === 0) return base;
  return base.map((s) => {
    const p = patches.get(s.id);
    return p ? { ...s, ...p } : s;
  });
}

const state: State = {
  scooters: [...FLEET],
  patches: new Map(),
  docs: new Map(),
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

/* =================== actions =================== */

export function patchScooter(id: number, patch: Partial<FleetScooter>) {
  const next = new Map(state.patches);
  const current = next.get(id) ?? {};
  next.set(id, { ...current, ...patch });
  state.patches = next;
  state.scooters = applyPatches(FLEET, state.patches);
  emit();
}

export function setScooterBaseStatus(id: number, status: ScooterBaseStatus) {
  patchScooter(id, { baseStatus: status });
}

export function recordOilChange(id: number, atMileage: number) {
  patchScooter(id, { lastOilChangeMileage: atMileage });
}

function getOrInitDocs(id: number): ScooterDocs {
  const existing = state.docs.get(id);
  if (existing) return existing;
  const fresh = emptyDocs();
  state.docs.set(id, fresh);
  return fresh;
}

export function setScooterDoc(
  id: number,
  kind: ScooterDocKind,
  file: UploadedFile | null,
) {
  const next = new Map(state.docs);
  const current = next.get(id) ?? emptyDocs();
  next.set(id, { ...current, [kind]: file });
  state.docs = next;
  emit();
}

export function setOsagoValidUntil(id: number, date: string | undefined) {
  const next = new Map(state.docs);
  const current = next.get(id) ?? emptyDocs();
  next.set(id, { ...current, osagoValidUntil: date });
  state.docs = next;
  emit();
}

/* =================== selectors =================== */

export function useFleetScooters(): FleetScooter[] {
  return useSyncExternalStore(
    subscribe,
    () => state.scooters,
    () => state.scooters,
  );
}

export function useFleetScooter(id: number | null): FleetScooter | null {
  const scooters = useSyncExternalStore(
    subscribe,
    () => state.scooters,
    () => state.scooters,
  );
  if (id == null) return null;
  return scooters.find((s) => s.id === id) ?? null;
}

export function useScooterDocs(id: number): ScooterDocs {
  return useSyncExternalStore(
    subscribe,
    () => state.docs.get(id) ?? EMPTY_DOCS,
    () => EMPTY_DOCS,
  );
}

const EMPTY_DOCS: ScooterDocs = emptyDocs();

// expose init for consumers who want to pre-populate
export const fleetStore = {
  getOrInitDocs,
};
