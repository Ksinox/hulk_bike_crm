/**
 * Базовый API-клиент. Один адрес сервера — VITE_API_URL из .env.
 *
 * Почему не axios/ky: fetch-а нам пока хватает. Если обрастём перехватчиками
 * (auth-токен, retry, мониторинг) — переедем. Сейчас цель: минимум слоёв.
 */

const BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4000";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    // Если сервер вернул { message: "..." } — используем его текстом
    // ошибки, чтобы тосты показывали человеческое сообщение, а не «API 400».
    const b = body as { message?: string; error?: string } | null;
    const msg =
      (b && typeof b.message === "string" && b.message) ||
      (b && typeof b.error === "string" && b.error) ||
      `API ${status}`;
    super(msg);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Content-Type ставим только когда реально шлём тело. Иначе Fastify
  // ругается FST_ERR_CTP_EMPTY_JSON_BODY на DELETE без body, и мы
  // получаем 400 вместо нормального ответа.
  const hasBody = init?.body != null;
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (hasBody && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
