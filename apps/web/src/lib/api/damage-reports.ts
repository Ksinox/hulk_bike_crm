import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export type ApiDamageMedia = {
  id: number;
  reportId: number;
  kind: "photo" | "video";
  fileKey: string;
  /** Кадр-обложка видео (JPEG-ключ). NULL для фото. */
  posterKey: string | null;
  /** 'processing' — видео ещё перекодируется на сервере; 'ready' — готово/фото. */
  status: "processing" | "ready" | string;
  fileName: string;
  mimeType: string;
  size: number;
  durationSec: number | null;
  uploadedByUserId: number | null;
  uploadedAt: string;
};

/** Есть ли среди отчётов видео в обработке — чтобы поллить до готовности. */
function damageHasProcessing(items?: ApiDamageReport[]): boolean {
  return !!items?.some((r) =>
    (r.media ?? []).some((m) => m.status === "processing"),
  );
}

export type ApiDamageReportItem = {
  id: number;
  reportId: number;
  priceItemId: number | null;
  name: string;
  originalPrice: number;
  finalPrice: number;
  quantity: number;
  comment: string | null;
  sortOrder: number;
  createdAt: string;
};

export type ApiDamagePayment = {
  id: number;
  rentalId: number;
  type: "damage";
  amount: number;
  method: "cash" | "card" | "transfer" | "deposit";
  paid: boolean;
  paidAt: string | null;
  note: string | null;
  receivedByUserId: number | null;
  receivedByName: string | null;
  damageReportId: number | null;
  createdAt: string;
};

export type DamageClientAgreement = "pending" | "agreed" | "disputed";

export type ApiDamageReport = {
  id: number;
  rentalId: number;
  createdByUserId: number | null;
  total: number;
  depositCovered: number;
  note: string | null;
  /** v0.2.75: реакция клиента на акт после печати. */
  clientAgreement: DamageClientAgreement;
  createdAt: string;
  updatedAt: string;
  items: ApiDamageReportItem[];
  media: ApiDamageMedia[];
  payments: ApiDamagePayment[];
  paidSum: number;
  debt: number;
};

export type CreateDamageItem = {
  priceItemId?: number | null;
  name: string;
  originalPrice: number;
  finalPrice: number;
  quantity: number;
  comment?: string | null;
};

export type CreateDamageReportInput = {
  rentalId: number;
  items: CreateDamageItem[];
  depositCovered?: number;
  note?: string | null;
  sendScooterToRepair?: boolean;
  /** Part B: токен черновика — привязать загруженные заранее медиа к акту. */
  draftToken?: string | null;
};

export type DamagePaymentInput = {
  amount: number;
  note?: string | null;
  method?: "cash" | "card" | "transfer" | "deposit";
};

export const damageReportsKeys = {
  all: ["damage-reports"] as const,
  byRental: (rentalId: number) =>
    [...damageReportsKeys.all, "rental", rentalId] as const,
  byId: (id: number) => [...damageReportsKeys.all, "id", id] as const,
};

export function useDamageReports(rentalId: number | null) {
  return useQuery({
    enabled: rentalId != null,
    queryKey: damageReportsKeys.byRental(rentalId ?? 0),
    queryFn: () =>
      api
        .get<{ items: ApiDamageReport[] }>(
          `/api/damage-reports?rentalId=${rentalId}`,
        )
        .then((r) => r.items),
    // Пока видео перекодируется на сервере — обновляем чаще, чтобы обложка
    // и воспроизведение появились без ручного рефреша.
    refetchInterval: (q) => (damageHasProcessing(q.state.data) ? 5000 : false),
  });
}

/**
 * Все damage_reports в системе. Используется на дашборде, чтобы быстро
 * вычислить какие аренды имеют долг по ущербу и подсветить их плитки
 * красным в Парке.
 */
export function useAllDamageReports() {
  return useQuery({
    queryKey: [...damageReportsKeys.all, "list-all"] as const,
    queryFn: () =>
      api
        .get<{ items: ApiDamageReport[] }>(`/api/damage-reports`)
        .then((r) => r.items),
    staleTime: 30_000,
  });
}

/**
 * Все акты ущерба по ВСЕЙ цепочке аренд (root + продления + замены, в т.ч.
 * вручную удалённые сегменты). Нужно для расчёта долга, который должен
 * сохраняться даже если связку, на которой создавался акт, удалили
 * (заказчик: «если мы передумали учитывать продление — это не значит что
 *  мы откатились назад по долгу»).
 *
 * Возвращает плоский массив reports + флаги загрузки.
 */
export function useChainDamageReports(rentalIds: number[]) {
  const queries = useQueries({
    queries: rentalIds.map((id) => ({
      queryKey: damageReportsKeys.byRental(id),
      queryFn: () =>
        api
          .get<{ items: ApiDamageReport[] }>(
            `/api/damage-reports?rentalId=${id}`,
          )
          .then((r) => r.items),
      // Кэш по id живёт независимо от цепочки — react-query уже умеет
      // дедуплицировать через queryKey.
      staleTime: 30_000,
      refetchInterval: (q: { state: { data?: ApiDamageReport[] } }) =>
        damageHasProcessing(q.state.data) ? 5000 : false,
    })),
  });
  const data: ApiDamageReport[] = queries.flatMap((q) => q.data ?? []);
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  return { data, isLoading, isError };
}

export function useCreateDamageReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDamageReportInput) =>
      api.post<ApiDamageReport>("/api/damage-reports", input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({
        queryKey: damageReportsKeys.byRental(vars.rentalId),
      });
    },
  });
}

export function usePatchDamageReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      patch: {
        depositCovered?: number;
        note?: string | null;
        items?: CreateDamageItem[];
      };
    }) =>
      api.patch<ApiDamageReport>(`/api/damage-reports/${args.id}`, args.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
    },
  });
}

export function useDeleteDamageReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/damage-reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: damageReportsKeys.all }),
  });
}

/** Установить реакцию клиента на акт (agreed/disputed). v0.2.75. */
export function useDamageAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      reportId: number;
      agreement: "agreed" | "disputed";
    }) =>
      api.post<ApiDamageReport>(
        `/api/damage-reports/${args.reportId}/agreement`,
        { agreement: args.agreement },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/** Внести платёж по акту. receivedByUserId сервер ставит сам. */
export function useDamagePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { reportId: number; input: DamagePaymentInput }) =>
      api.post<ApiDamageReport>(
        `/api/damage-reports/${args.reportId}/payment`,
        args.input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      // v0.5.4: критично инвалидировать сводку долга и aggregate —
      // KPI «Долг» в карточке аренды читает из rental-debt, KPI на
      // дашборде из debt-aggregate. Без этого damage payment делался,
      // damage_report.paidSum рос (видно в баннере), но KPI «Долг»
      // оставался стейл и пользователь думал что оплата не учлась.
      qc.invalidateQueries({ queryKey: ["rental-debt"] });
      qc.invalidateQueries({ queryKey: ["debt-aggregate"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/**
 * Загрузить фото/видео повреждения к акту. multipart — через raw fetch
 * (api.post обернул бы в JSON). durationSec — длительность видео в секундах
 * (опционально, считаем на клиенте до загрузки).
 */
export function useUploadDamageMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      reportId: number;
      file: File;
      durationSec?: number | null;
    }) => {
      const fd = new FormData();
      fd.append("file", args.file);
      if (args.durationSec != null && args.durationSec > 0) {
        fd.append("durationSec", String(Math.round(args.durationSec)));
      }
      const res = await fetch(
        `${API_BASE}/api/damage-reports/${args.reportId}/media`,
        { method: "POST", credentials: "include", body: fd },
      );
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* ignore */
        }
        const msg =
          (body as { message?: string; error?: string })?.message ??
          (body as { message?: string; error?: string })?.error ??
          `upload ${res.status}`;
        throw new Error(msg);
      }
      return (await res.json()) as ApiDamageMedia;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
    },
  });
}

/**
 * Part B: загрузить медиа НОВОГО (ещё не сохранённого) акта по draft-токену.
 * Медиа уходит на сервер сразу при выборе (eager upload) → переживает refresh.
 * Привязка к акту произойдёт при создании (передаём draftToken в create).
 */
export function useUploadDraftDamageMedia() {
  return useMutation({
    mutationFn: async (args: {
      draftToken: string;
      file: File;
      durationSec?: number | null;
    }) => {
      const fd = new FormData();
      fd.append("file", args.file);
      fd.append("draftToken", args.draftToken);
      if (args.durationSec != null && args.durationSec > 0) {
        fd.append("durationSec", String(Math.round(args.durationSec)));
      }
      const res = await fetch(
        `${API_BASE}/api/damage-reports/draft-media`,
        { method: "POST", credentials: "include", body: fd },
      );
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* ignore */
        }
        const msg =
          (body as { message?: string; error?: string })?.message ??
          (body as { message?: string; error?: string })?.error ??
          `upload ${res.status}`;
        throw new Error(msg);
      }
      return (await res.json()) as ApiDamageMedia;
    },
  });
}

/** Part B: список draft-медиа по токену (восстановление формы после F5). */
export async function fetchDraftDamageMedia(
  token: string,
): Promise<ApiDamageMedia[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/damage-reports/draft-media?token=${encodeURIComponent(token)}`,
      { credentials: "include" },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: ApiDamageMedia[] };
    return body.items ?? [];
  } catch {
    return [];
  }
}

/** Удалить медиа повреждения. */
export function useDeleteDamageMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: number) =>
      api.delete<void>(`/api/damage-reports/media/${mediaId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
    },
  });
}
