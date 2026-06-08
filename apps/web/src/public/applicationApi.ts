/**
 * Fetch-обёртки для публичной формы анкеты клиента.
 *
 * Ходим в /api/public/applications/* без cookie (credentials: 'omit'),
 * передаём X-Upload-Token в headers — он привязывает запросы к конкретному
 * черновику заявки.
 *
 * Базовый URL берётся:
 *  - из VITE_API_URL (для Electron, где origin = file://);
 *  - иначе из window.location.origin (web — обычно тот же домен что и API).
 */

// В production (crm.hulk-bike.ru/apply) API живёт на том же домене —
// относительные URL «/api/...» работают как есть. В dev/Electron
// задаётся VITE_API_URL, остальной код CRM использует тот же дефолт.
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:4000";

function url(path: string): string {
  return `${API_BASE}${path}`;
}

export type ClientSource = "avito" | "repeat" | "ref" | "maps" | "other";

export type ApplicationFields = {
  name?: string | null;
  phone?: string | null;
  extraPhone?: string | null;
  isForeigner?: boolean;
  passportRaw?: string | null;
  birthDate?: string | null;
  passportSeries?: string | null;
  passportNumber?: string | null;
  passportIssuedOn?: string | null;
  passportIssuer?: string | null;
  passportDivisionCode?: string | null;
  passportRegistration?: string | null;
  liveAddress?: string | null;
  sameAddress?: boolean;
  /** Откуда клиент о нас узнал. Выбирается клиентом на отдельном
   *  шаге анкеты, потом переносится в карточку клиента при оформлении. */
  source?: ClientSource | null;
  /** Текст-уточнение, если выбран source='other'. */
  sourceCustom?: string | null;
  /** G3: предзаявка на аренду — что клиент хочет арендовать. */
  requestedModel?: string | null;
  /** Точное имя выбранной модели из каталога («Yamaha Jog»…) — для показа
   *  в заявке. requestedModel остаётся грубым enum для префилла-фильтра. */
  requestedModelName?: string | null;
  requestedDays?: number | null;
  requestedEquipmentIds?: number[] | null;
  requestedStartDate?: string | null;
  honeypot?: string | null;
};

/** G3: экипировка для шага «Что хотите арендовать». */
export type RentalEquipment = {
  id: number;
  name: string;
  price: number;
  isFree: boolean;
  avatarUrl: string | null;
};

export type FileKind = "passport_main" | "passport_reg" | "license" | "selfie";

/** G3: модель для шага «Что хотите арендовать» (из каталога, только активные). */
export type RentalModel = {
  id: number;
  name: string;
  dayRate: number;
  shortRate: number;
  weekRate: number;
  monthRate: number;
  avatarUrl: string | null;
};

export type CreateResponse = {
  applicationId: number;
  uploadToken: string;
  expiresAt: string;
};

export type UploadFileResponse = {
  id: number;
  kind: FileKind;
  fileName: string;
  size: number;
};

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function jsonFetch<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["X-Upload-Token"] = token;
  const res = await fetch(url(path), {
    method,
    credentials: "omit",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* пустой body — норм для DELETE */
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed as T;
}

export const applicationApi = {
  create(fields: ApplicationFields): Promise<CreateResponse> {
    return jsonFetch<CreateResponse>("POST", "/api/public/applications", fields);
  },

  patch(id: number, token: string, fields: ApplicationFields): Promise<{ ok: true }> {
    return jsonFetch<{ ok: true }>(
      "PATCH",
      `/api/public/applications/${id}`,
      fields,
      token,
    );
  },

  async uploadFile(
    id: number,
    token: string,
    kind: FileKind,
    file: File,
  ): Promise<UploadFileResponse> {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    const res = await fetch(url(`/api/public/applications/${id}/files`), {
      method: "POST",
      credentials: "omit",
      headers: { "X-Upload-Token": token },
      body: fd,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* */
    }
    if (!res.ok) throw new ApiError(res.status, parsed);
    return parsed as UploadFileResponse;
  },

  deleteFile(id: number, token: string, kind: FileKind): Promise<{ ok: true }> {
    return jsonFetch<{ ok: true }>(
      "DELETE",
      `/api/public/applications/${id}/files/${kind}`,
      undefined,
      token,
    );
  },

  /** #84/#85: URL ранее загруженного фото (для <img src>). Токен — в query,
   *  т.к. тег img не умеет слать заголовки. variant=thumb|view — уменьшенные. */
  fileUrl(
    id: number,
    token: string,
    kind: FileKind,
    variant?: "thumb" | "view",
  ): string {
    const v = variant ? `&variant=${variant}` : "";
    return url(
      `/api/public/applications/${id}/files/${kind}?token=${encodeURIComponent(token)}${v}`,
    );
  },

  submit(id: number, token: string): Promise<{ ok: true }> {
    return jsonFetch<{ ok: true }>(
      "POST",
      `/api/public/applications/${id}/submit`,
      {},
      token,
    );
  },

  /** G3: активные модели каталога для шага «Что хотите арендовать». */
  rentalModels(): Promise<{ items: RentalModel[] }> {
    return jsonFetch<{ items: RentalModel[] }>("GET", "/api/public/rental-models");
  },

  /** G3: экипировка каталога для шага «Что хотите арендовать». */
  equipment(): Promise<{ items: RentalEquipment[] }> {
    return jsonFetch<{ items: RentalEquipment[] }>("GET", "/api/public/equipment");
  },

  /** Абсолютный URL аватарки модели (на публичном API-домене). */
  modelAvatarUrl(path: string): string {
    return url(path);
  },
};

export { ApiError };
