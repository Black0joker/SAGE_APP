/**
 * A single error type for everything the API can return, so screens can switch on
 * `code` without inspecting response objects.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Present on `X-Request-ID`, for bug reports. Never includes coordinates. */
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Turns any thrown value into something safe to show a user. */
export function errorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function errorCode(error: unknown): string | null {
  return isApiError(error) ? error.code : null;
}
