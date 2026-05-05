import { useMemo, useSyncExternalStore } from "react";
import type { UploadedFile } from "./DocUpload";
import { type Client } from "@/lib/mock/clients";
import {
  clientsKeys,
  useApiClients,
  type CreateClientInput,
  type PatchClientInput,
} from "@/lib/api/clients";
import { useApiRentals } from "@/lib/api/rentals";
import type { ApiRental } from "@/lib/api/types";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
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

/**
 * Оптимистично обновляем локально + шлём PATCH в API.
 * Если запрос упадёт — откатываем локальную метку.
 */
function setUnreachable(id: number, on: boolean) {
  const prev = state.unreachable.has(id);
  const next = new Set(state.unreachable);
  if (on) next.add(id);
  else next.delete(id);
  state.unreachable = next;
  emit();

  api
    .patch(`/api/clients/${id}`, { unreachable: on })
    .then(() => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.all });
    })
    .catch((err) => {
      console.error("PATCH /api/clients unreachable failed:", err);
      // откат
      const rollback = new Set(state.unreachable);
      if (prev) rollback.add(id);
      else rollback.delete(id);
      state.unreachable = rollback;
      emit();
    });
}

function getUnreachableSet(): Set<number> {
  return state.unreachable;
}

/**
 * Расширение для CREATE/PATCH — наряду с базовыми полями Client принимаем
 * паспортные данные/адреса/ВУ, чтобы они попадали в API. Без этого фронт
 * молча терял всё что заполнила форма редактирования карточки клиента.
 */
type ClientExtras = {
  sourceCustom?: string | null;
  isForeigner?: boolean;
  passportRaw?: string | null;
  extraPhone?: string | null;
  birthDate?: string | null;
  passportSeries?: string | null;
  passportNumber?: string | null;
  passportIssuedOn?: string | null;
  passportIssuer?: string | null;
  passportDivisionCode?: string | null;
  passportRegistration?: string | null;
  licenseNumber?: string | null;
  licenseCategories?: string | null;
  licenseIssuedOn?: string | null;
  licenseExpiresOn?: string | null;
  blacklistReason?: string | null;
};

/**
 * Создание клиента (sync). Возвращает stub с временным id; реальный id
 * прилетает следующим обновлением useApiClients. Используется только
 * там где id не нужен сразу.
 */
function addClient(data: Omit<Client, "id"> & ClientExtras): Client {
  const body = buildCreateBody(data);
  api
    .post(`/api/clients`, body)
    .then(() => {
      queryClient.invalidateQueries({ queryKey: clientsKeys.all });
    })
    .catch((err) => {
      console.error("POST /api/clients failed:", err);
    });
  const maxAdded = state.addedClients.reduce((m, c) => Math.max(m, c.id), 0);
  const id = maxAdded + Date.now();
  return { ...data, id };
}

/**
 * Создание клиента с ожиданием реального id из API. Используется когда
 * сразу нужен ID на сервере — например, чтобы привязать только что
 * созданного клиента к создаваемой аренде. Stub-id здесь не подходит:
 * аренда уйдёт в API с несуществующим clientId → 400.
 */
async function addClientAsync(
  data: Omit<Client, "id"> & ClientExtras,
): Promise<Client> {
  const body = buildCreateBody(data);
  const created = await api.post<{ id: number }>(`/api/clients`, body);
  queryClient.invalidateQueries({ queryKey: clientsKeys.all });
  return { ...data, id: created.id };
}

/**
 * Сохраняет правки клиента в API (PATCH). В отличие от создания —
 * принимает только PATCH-поля и пробрасывает их as-is. Возвращает
 * обновлённую запись и инвалидирует список клиентов.
 *
 * Возвращает ApiClient с актуальными значениями из БД — так вызывающая
 * сторона может сразу показать пользователю что реально сохранилось
 * (и не зависеть от refetch'а React Query).
 */
async function patchClientAsync<T = unknown>(
  id: number,
  patch: PatchClientInput,
): Promise<T> {
  // Лог удобен на проде в DevTools, чтобы быстро увидеть payload и
  // ответ если пользователь жалуется «не сохранилось». Тяжёлых данных
  // тут нет — паспортные поля.
  // eslint-disable-next-line no-console
  console.info("[patchClient] →", id, patch);
  const updated = await api.patch<T>(`/api/clients/${id}`, patch);
  // eslint-disable-next-line no-console
  console.info("[patchClient] ←", updated);
  queryClient.invalidateQueries({ queryKey: clientsKeys.all });
  queryClient.invalidateQueries({ queryKey: clientsKeys.byId(id) });
  return updated;
}

function buildCreateBody(
  data: Omit<Client, "id"> & ClientExtras,
): CreateClientInput {
  return {
    name: data.name,
    phone: data.phone,
    extraPhone: data.extraPhone ?? null,
    source: data.source,
    sourceCustom: data.sourceCustom ?? null,
    isForeigner: data.isForeigner ?? false,
    passportRaw: data.passportRaw ?? null,
    rating: data.rating,
    comment: data.comment,
    blacklisted: data.blacklisted,
    blacklistReason: data.blacklistReason ?? null,
    birthDate: data.birthDate ?? null,
    passportSeries: data.passportSeries ?? null,
    passportNumber: data.passportNumber ?? null,
    passportIssuedOn: data.passportIssuedOn ?? null,
    passportIssuer: data.passportIssuer ?? null,
    passportDivisionCode: data.passportDivisionCode ?? null,
    passportRegistration: data.passportRegistration ?? null,
    licenseNumber: data.licenseNumber ?? null,
    licenseCategories: data.licenseCategories ?? null,
    licenseIssuedOn: data.licenseIssuedOn ?? null,
    licenseExpiresOn: data.licenseExpiresOn ?? null,
  };
}

function getAllClients(): Client[] {
  return [...state.addedClients];
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
  addClientAsync,
  patchClientAsync,
  getAllClients,
  subscribe,
};

/**
 * «Не выходит на связь» — источник истины API (колонка `unreachable`).
 * Локальный `state.unreachable` теперь используется только для оптимистичного
 * обновления на время POST-запроса (через union с API-значением).
 */
export function useClientUnreachable(id: number): boolean {
  const { data } = useApiClients();
  useSyncExternalStore(subscribe, () => state.unreachable, () => state.unreachable);
  const apiFlag = data?.find((c) => c.id === id)?.unreachable ?? false;
  return apiFlag || state.unreachable.has(id);
}

/** Множество id клиентов с флагом unreachable (для фильтра «Проблемные») */
export function useUnreachableSet(): Set<number> {
  const { data } = useApiClients();
  useSyncExternalStore(subscribe, () => state.unreachable, () => state.unreachable);
  const fromApi = new Set<number>();
  if (data) for (const c of data) if (c.unreachable) fromApi.add(c.id);
  for (const id of state.unreachable) fromApi.add(id);
  return fromApi;
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
 *   debt  — сумма просрочек по формуле 1.5 × rate × дней просрочки
 *           = «дни» (rate × days) + «штраф 50%» (round(rate*0.5) × days)
 *           (бизнес-формула v0.3.8 / v0.4.3).
 *
 * v0.3.8: учитываем не только status='overdue', но и status='active' с
 * прошедшим endPlannedAt. Раньше фильтр «С долгом» в Клиентах не
 * находил никого, потому что многие просроченные аренды живут в
 * статусе 'active' (статус автоматически не переключается).
 *
 * v0.4.3: внимание — здесь сумма НЕ вычитает события из debt_entries
 * (списания/оплаты). Это «потенциальный» долг по формуле. Точный
 * остаток показывается в карточке аренды (через /api/rentals/:id/debt).
 * На уровне списка клиентов этого достаточно: если клиент в фильтре
 * «С долгом» — оператор открывает его карточку и видит детальный
 * остаток с учётом всех событий.
 */
function computeStats(rentals: ApiRental[]): {
  rentsByClient: Map<number, number>;
  debtByClient: Map<number, number>;
} {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const rentsByClient = new Map<number, number>();
  const debtByClient = new Map<number, number>();
  for (const r of rentals) {
    rentsByClient.set(r.clientId, (rentsByClient.get(r.clientId) ?? 0) + 1);
    const isActive = r.status === "active" || r.status === "overdue";
    if (!isActive) continue;
    const endKey = r.endPlannedAt.slice(0, 10);
    if (endKey >= todayKey) continue; // не просрочена
    const endDate = new Date(`${endKey}T00:00:00`);
    const diffDays = Math.max(
      0,
      Math.round(
        (new Date(todayKey + "T00:00:00").getTime() - endDate.getTime()) /
          86_400_000,
      ),
    );
    if (diffDays <= 0) continue;
    // v0.4.25: rateUnit учёт — для weekly tariffs сначала к ₽/сут
    const daily =
      (r as { rateUnit?: string }).rateUnit === "week"
        ? Math.round(r.rate / 7)
        : r.rate;
    const add = diffDays * Math.round(daily * 1.5);
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
