import { useMemo } from "react";
import { useSyncExternalStore } from "react";
import { FLEET, type FleetScooter, type ScooterBaseStatus } from "@/lib/mock/fleet";
import type { UploadedFile } from "@/pages/clients/DocUpload";
import {
  scootersKeys,
  useApiScooters,
  type CreateScooterInput,
  type PatchScooterInput,
} from "@/lib/api/scooters";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { adaptScooter } from "./scooterAdapter";

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
  /** Итоговый список = FLEET + added, сверху применены patches */
  scooters: FleetScooter[];
  /** Скутеры, добавленные пользователем в рантайме */
  added: FleetScooter[];
  /** Патчи (ручные правки), накладываемые поверх базы + added */
  patches: Map<number, Partial<FleetScooter>>;
  docs: Map<number, ScooterDocs>;
};

function applyPatches(
  base: FleetScooter[],
  added: FleetScooter[],
  patches: Map<number, Partial<FleetScooter>>,
): FleetScooter[] {
  const all = [...base, ...added];
  if (patches.size === 0) return all;
  return all.map((s) => {
    const p = patches.get(s.id);
    return p ? { ...s, ...p } : s;
  });
}

const state: State = {
  scooters: [...FLEET],
  added: [],
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

/**
 * Создание скутера. Отправляем POST и инвалидируем кеш — React Query
 * подтянет обновлённый список.
 */
export function addScooter(data: Omit<FleetScooter, "id">): FleetScooter {
  const body: CreateScooterInput = {
    name: data.name,
    model: data.model,
    vin: data.vin ?? null,
    engineNo: data.engineNo ?? null,
    mileage: data.mileage,
    baseStatus: data.baseStatus,
    purchaseDate: ruToIsoDate(data.purchaseDate),
    purchasePrice: data.purchasePrice ?? null,
    lastOilChangeMileage: data.lastOilChangeMileage ?? null,
    note: data.note ?? null,
  };
  api
    .post(`/api/scooters`, body)
    .then(() => {
      queryClient.invalidateQueries({ queryKey: scootersKeys.all });
    })
    .catch((err) => {
      console.error("POST /api/scooters failed:", err);
    });

  // временный stub для совместимости со старым синхронным API
  const maxBase = FLEET.reduce((m, s) => Math.max(m, s.id), 0);
  const id = Math.max(maxBase, ...state.added.map((s) => s.id)) + 10_000;
  return { ...data, id };
}

/**
 * Патчим скутер (пробег, VIN, статус, ущерб, дата замены масла...).
 * Оптимистично применяем локально, потом шлём PATCH. На ошибке — откат.
 */
export function patchScooter(id: number, patch: Partial<FleetScooter>) {
  const prev = state.patches.get(id);
  const next = new Map(state.patches);
  next.set(id, { ...(prev ?? {}), ...patch });
  state.patches = next;
  state.scooters = applyPatches(FLEET, state.added, state.patches);
  emit();

  const apiPatch: PatchScooterInput = {};
  if (patch.mileage !== undefined) apiPatch.mileage = patch.mileage;
  if (patch.vin !== undefined) apiPatch.vin = patch.vin ?? null;
  if (patch.engineNo !== undefined) apiPatch.engineNo = patch.engineNo ?? null;
  if (patch.frameNumber !== undefined) apiPatch.frameNumber = patch.frameNumber ?? null;
  if (patch.year !== undefined) apiPatch.year = patch.year ?? null;
  if (patch.color !== undefined) apiPatch.color = patch.color ?? null;
  if (patch.baseStatus !== undefined) apiPatch.baseStatus = patch.baseStatus;
  if (patch.purchaseDate !== undefined) {
    apiPatch.purchaseDate = ruToIsoDate(patch.purchaseDate);
  }
  if (patch.purchasePrice !== undefined) {
    apiPatch.purchasePrice = patch.purchasePrice ?? null;
  }
  if (patch.lastOilChangeMileage !== undefined) {
    apiPatch.lastOilChangeMileage = patch.lastOilChangeMileage ?? null;
  }
  if (patch.note !== undefined) apiPatch.note = patch.note ?? null;

  if (Object.keys(apiPatch).length === 0) return;

  api
    .patch(`/api/scooters/${id}`, apiPatch)
    .then(() => {
      queryClient.invalidateQueries({ queryKey: scootersKeys.all });
      // после инвалидации можно снять локальный патч — API уже отдаст правду
      const cleanup = new Map(state.patches);
      cleanup.delete(id);
      state.patches = cleanup;
    })
    .catch((err) => {
      console.error(`PATCH /api/scooters/${id} failed:`, err);
      // откат
      const rollback = new Map(state.patches);
      if (prev) rollback.set(id, prev);
      else rollback.delete(id);
      state.patches = rollback;
      state.scooters = applyPatches(FLEET, state.added, state.patches);
      emit();
    });
}

/** "15.04.2026" → "2026-04-15" */
function ruToIsoDate(ru?: string | null): string | null | undefined {
  if (ru === undefined) return undefined;
  if (ru === null || ru === "") return null;
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return ru;
  return `${m[3]}-${m[2]}-${m[1]}`;
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

/**
 * Скутеры — источник API. Поверх накладываются:
 *   • added (локально созданные в рантайме — пока не работает POST /api/scooters)
 *   • patches (локальные правки — пока не работает PATCH /api/scooters/:id)
 * Когда подключим мутации — added/patches уйдут, данные будут жить только в API.
 */
export function useFleetScooters(): FleetScooter[] {
  const { data } = useApiScooters();
  // подписка на локальные правки
  useSyncExternalStore(subscribe, () => state.scooters, () => state.scooters);

  return useMemo(() => {
    const base = data ? data.map(adaptScooter) : [];
    const all = [...base, ...state.added];
    if (state.patches.size === 0) return all;
    return all.map((s) => {
      const p = state.patches.get(s.id);
      return p ? { ...s, ...p } : s;
    });
  }, [data]);
}

export function useFleetScooter(id: number | null): FleetScooter | null {
  const scooters = useFleetScooters();
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
