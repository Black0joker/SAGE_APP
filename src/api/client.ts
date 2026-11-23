import { getApiBaseUrl } from './config';
import { getAuthToken, isSessionExpired, notifyUnauthorized } from './authBridge';
import { ApiError } from './errors';
import type { ErrorEnvelope } from './types';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type RequestOptions = {
  method?: HttpMethod;
  /** Serialised as JSON. Omitted for GET/DELETE without a payload. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Skip the bearer token (register/login). */
  anonymous?: boolean;
};

/** Bodies and paths we must never echo to a log. */
const REDACTED_PATHS = [
  /^\/api\/auth\//,
  /^\/api\/location/,
  /^\/api\/voice\//,
  // A document id is a handle to personal data; never print it (API.md §13.9).
  /^\/api\/documents/,
];

function isRedacted(path: string): boolean {
  return REDACTED_PATHS.some((pattern) => pattern.test(path));
}

function devLog(message: string, detail?: unknown): void {
  if (!__DEV__) return;
  if (detail === undefined) {
    console.log(`[sage-api] ${message}`);
  } else {
    console.log(`[sage-api] ${message}`, detail);
  }
}

export function buildUrl(
  path: string,
  query?: RequestOptions['query'],
): string {
  const base = getApiBaseUrl();
  const url = new URL(`${base}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseError(response: Response, path: string): Promise<ApiError> {
  const requestId = response.headers.get('X-Request-ID') ?? undefined;
  let code = 'error';
  let message = `Request failed (${response.status})`;
  try {
    const payload = (await response.json()) as Partial<ErrorEnvelope>;
    if (payload?.error?.code) code = payload.error.code;
    if (payload?.error?.message) message = payload.error.message;
  } catch {
    // A non-JSON error body (proxy, HTML page) keeps the generic message.
  }
  return new ApiError(response.status, code, message, requestId);
}

/**
 * Core request. Returns `undefined` for 204, throws `ApiError` for anything else
 * that is not 2xx, and signs the user out on 401 before throwing.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiRequestRaw(path, options);

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    throw await parseError(response, path);
  }

  // A few endpoints answer 200 with an empty body; treat that as undefined too.
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, 'invalid_response', 'The server sent an unexpected response.');
  }
}

/**
 * Like `apiRequest`, but hands back the raw `Response` — used for `audio/mpeg`
 * (voice) and the `Content-Disposition` export.
 */
export async function apiRequestRaw(
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const { method = 'GET', body, query, signal, headers, anonymous } = options;

  if (!anonymous && isSessionExpired()) {
    notifyUnauthorized();
    throw new ApiError(401, 'token_expired', 'Your session has expired. Please log in again.');
  }

  const token = anonymous ? null : getAuthToken();

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  const url = buildUrl(path, query);
  devLog(`${method} ${path}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', 'Could not reach SAGE. Check your connection.');
  }

  if (response.status === 401 && !anonymous) {
    notifyUnauthorized();
    throw await parseError(response, path);
  }

  if (__DEV__ && !response.ok) {
    devLog(`${method} ${path} -> ${response.status}`, isRedacted(path) ? '(redacted)' : undefined);
  }

  return response;
}

/** Binary response reader, used by `POST /api/voice/speak` (audio/mpeg). */
export async function apiRequestArrayBuffer(
  path: string,
  options: RequestOptions = {},
): Promise<ArrayBuffer> {
  const response = await apiRequestRaw(path, options);
  if (!response.ok) throw await parseError(response, path);
  return response.arrayBuffer();
}

/** Convenience wrappers so endpoint definitions stay short. */
export const http = {  get: <T>(path: string, options?: RequestOptions) => apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
