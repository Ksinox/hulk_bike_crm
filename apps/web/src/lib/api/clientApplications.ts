import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ListResponse } from "./types";
import { clientsKeys } from "./clients";

/**
 * Хуки для работы с публичными заявками клиентов в CRM.
 * Polling каждые 10 сек — обновление в «реальном времени» без WebSocket.
 */

export type ApplicationFileKind =
  | "passport_main"
  | "passport_reg"
  | "license"
  | "selfie";

export type ApplicationFile = {
  id: number;
  kind: ApplicationFileKind;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type ApplicationStatus =
  | "draft"
  | "new"
  | "viewed"
  | "accepted"
  | "rejected"
  | "spam"
  | "cancelled";

export type ApiApplication = {
  id: number;
  status: ApplicationStatus;
  /** Если status='accepted' — id созданного клиента (FK). */
  clientId: number | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  spamAt: string | null;
  rejectionReason: string | null;
  rejectionReasonCode: string | null;
  name: string | null;
  phone: string | null;
  extraPhone: string | null;
  isForeigner: boolean;
  passportRaw: string | null;
  birthDate: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
  passportIssuedOn: string | null;
  passportIssuer: string | null;
  passportDivisionCode: string | null;
  passportRegistration: string | null;
  liveAddress: string | null;
  sameAddress: boolean;
  /** Откуда клиент о нас узнал (выбрал на отдельном шаге анкеты).
   *  Может быть null, если заявка создана до релиза с шагом source. */
  source: "avito" | "repeat" | "ref" | "maps" | "other" | null;
  /** Текст-уточнение, если выбран source='other'. */
  sourceCustom: string | null;
  /** G3: предзаявка на аренду — модель скутера (enum scooter_model) и срок. */
  requestedModel: string | null;
  /** Точное имя выбранной модели из каталога («Yamaha Jog»…) — для показа. */
  requestedModelName: string | null;
  requestedDays: number | null;
  /** G3: id выбранной экипировки (equipment_items). */
  requestedEquipmentIds: number[] | null;
  /** G3: желаемая дата начала аренды (ISO YYYY-MM-DD). */
  requestedStartDate: string | null;
  viewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files: ApplicationFile[];
};

export const applicationsKeys = {
  all: ["client-applications"] as const,
  list: (status?: string, q?: string) =>
    [
      ...applicationsKeys.all,
      "list",
      status ?? "active",
      q ?? "",
    ] as const,
  byId: (id: number) => [...applicationsKeys.all, "detail", id] as const,
};

export type ApplicationListParams = {
  /** csv статусов или 'all' / 'active' (default). */
  status?: string;
  /** Поиск по ФИО/телефону/паспорту. */
  q?: string;
  /** Polling — ставить false на архивной странице, чтобы не дёргать API. */
  poll?: boolean;
  /** Если false — запрос не выполняется (для условного auto-search). */
  enabled?: boolean;
};

/** Список заявок с фильтром. По умолчанию — active (new + viewed),
 *  polling включён для виджета на дашборде. */
export function useApplications(params?: ApplicationListParams) {
  const status = params?.status ?? "active";
  const q = params?.q ?? "";
  const poll = params?.poll ?? true;
  const enabled = params?.enabled ?? true;
  const search = new URLSearchParams();
  search.set("status", status);
  if (q) search.set("q", q);
  return useQuery({
    queryKey: applicationsKeys.list(status, q),
    queryFn: () =>
      api
        .get<ListResponse<ApiApplication>>(
          `/api/client-applications?${search.toString()}`,
        )
        .then((r) => r.items),
    refetchInterval: poll ? 10_000 : false,
    refetchIntervalInBackground: false,
    enabled,
  });
}

/**
 * Дашборд-метрика «заявки → аренда» (накопительно): сколько заявок с нашей
 * формы оформлено в аренду (клиент из заявки имеет хотя бы одну неудалённую
 * аренду). Ключ — потомок applicationsKeys.all, поэтому инвалидируется вместе
 * с заявками (convert/delete). refetchInterval страхует случай удаления аренды
 * (оно инвалидирует rentals, не заявки) — счётчик подтянется в течение минуты.
 */
export function useConvertedApplicationsCount() {
  return useQuery({
    queryKey: [...applicationsKeys.all, "converted-count"] as const,
    queryFn: () =>
      api
        .get<{ count: number }>("/api/client-applications/converted-count")
        .then((r) => r.count),
    refetchInterval: 60_000,
  });
}

export function useApplication(id: number | null) {
  return useQuery({
    queryKey: id == null ? applicationsKeys.all : applicationsKeys.byId(id),
    queryFn: () => api.get<ApiApplication>(`/api/client-applications/${id}`),
    enabled: id != null,
  });
}

/** Заявки, привязанные к конкретному клиенту (после оформления). */
export function useApplicationsByClient(clientId: number | null) {
  return useQuery({
    queryKey: [...applicationsKeys.all, "byClient", clientId] as const,
    queryFn: () =>
      api
        .get<ListResponse<ApiApplication>>(
          `/api/client-applications?status=all&clientId=${clientId}`,
        )
        .then((r) => r.items),
    enabled: clientId != null,
  });
}

export function useMarkApplicationViewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ ok: true }>(`/api/client-applications/${id}/mark-viewed`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
    },
  });
}

export function useDeleteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/client-applications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
    },
  });
}

/**
 * Очистить «предзаявку на аренду» (requestedModel/Days/EquipmentIds/
 * StartDate). Зовём после создания аренды из префилла (чтобы черновик не
 * висел в карточке клиента) или по кнопке «Удалить» в карточке клиента.
 */
export function useClearRentalDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ ok: true }>(
        `/api/client-applications/${id}/clear-rental-draft`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
    },
  });
}

export type RejectionReasonCode =
  | "empty_photos"
  | "unreadable"
  | "repeat_fake"
  | "bot"
  | "other";

export const REJECTION_REASON_LABEL: Record<RejectionReasonCode, string> = {
  empty_photos: "Пустые / нечитаемые фото",
  unreadable: "Нечитаемые данные",
  repeat_fake: "Повторная подделка",
  bot: "Явный бот",
  other: "Другое",
};

export type RejectInput = {
  reasonCode?: RejectionReasonCode | null;
  reason?: string | null;
};

export function useRejectApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: RejectInput }) =>
      api.post<{ ok: true }>(
        `/api/client-applications/${args.id}/reject`,
        args.input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
    },
  });
}

export function useSpamApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: RejectInput }) =>
      api.post<{ ok: true }>(
        `/api/client-applications/${args.id}/spam`,
        args.input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
    },
  });
}

export function useRestoreApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ ok: true }>(
        `/api/client-applications/${id}/restore`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
    },
  });
}

export type ConvertApplicationInput = {
  name: string;
  phone: string;
  extraPhone?: string | null;
  source?: "avito" | "repeat" | "ref" | "maps" | "other";
  sourceCustom?: string | null;
  isForeigner?: boolean;
  passportRaw?: string | null;
  comment?: string | null;
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
  keepFiles?: Partial<Record<ApplicationFileKind, boolean>>;
};

export function useConvertApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: ConvertApplicationInput }) =>
      api.post<{ id: number }>(
        `/api/client-applications/${args.id}/convert`,
        args.input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
      qc.invalidateQueries({ queryKey: clientsKeys.all });
    },
  });
}

/**
 * URL для img src — фото загружается с cookie-сессией менеджера.
 *
 * v0.4.62: variant — серверная генерация уменьшенных версий (sharp).
 *   "thumb" — миниатюра ≤400px (~30 КБ) для гридов в карточке заявки
 *   "view"  — превью ≤2000px (~300 КБ) для попапов
 *   undefined — оригинал (для скачивания)
 *
 * Если у файла нет нужного варианта (legacy-загрузка до v0.4.62) —
 * сервер silently fallback'ает на оригинал.
 */
export function applicationFileUrl(
  id: number,
  kind: ApplicationFileKind,
  opts: { variant?: "thumb" | "view" } = {},
): string {
  const base =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  // v0.4.63: cache-buster v=webp — после смены формата вариантов с
  // JPEG на WebP нужно инвалидировать 7-дневный кеш браузера.
  const qs = opts.variant ? `?variant=${opts.variant}&v=webp` : "";
  return `${base}/api/client-applications/${id}/files/${kind}${qs}`;
}
