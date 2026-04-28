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
  honeypot?: string | null;
};

export type FileKind = "passport_main" | "passport_reg" | "license" | "selfie";

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

  submit(id: number, token: string): Promise<{ ok: true }> {
    return jsonFetch<{ ok: true }>(
      "POST",
      `/api/public/applications/${id}/submit`,
      {},
      token,
    );
  },
};

export { ApiError };
