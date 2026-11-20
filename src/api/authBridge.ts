/**
 * The bridge between the API layer and the session store.
 *
 * `client.ts` needs the bearer token and a way to report a 401, but the session
 * store imports the API layer. Keeping those two values in a tiny leaf module
 * avoids a circular import and keeps the client free of React.
 */

let token: string | null = null;
let expiresAt: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(next: string | null): void {
  token = next;
}

export function getAuthToken(): string | null {
  return token;
}

export function setAuthExpiry(next: string | null): void {
  expiresAt = next;
}

/** True when we can already tell the token is dead, so no request is sent. */
export function isSessionExpired(now: number = Date.now()): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return false;
  return parsed <= now;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function notifyUnauthorized(): void {
  onUnauthorized?.();
}
