/**
 * Time helpers.
 *
 * The API is ISO-8601 UTC with a `Z` suffix. Everything the user sees is local.
 * `tzOffsetMinutes()` is minutes east of UTC — exactly what the API's
 * `tz_offset` query parameter expects (API.md §6.2).
 */

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function tzOffsetMinutes(date: Date = new Date()): number {
  return -date.getTimezoneOffset();
}

export function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isPast(value: string | null | undefined): boolean {
  const date = parseIso(value);
  return date ? date.getTime() < Date.now() : false;
}

export function formatTime(value: string | null | undefined, locale?: string): string {
  const date = parseIso(value);
  if (!date) return '';
  return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(value: string | null | undefined, locale?: string): string {
  const date = parseIso(value);
  if (!date) return '';
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value: string | null | undefined, locale?: string): string {
  const date = parseIso(value);
  if (!date) return '';
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Local calendar day of an ISO timestamp, as `YYYY-MM-DD`. */
export function localDayKey(value: string | null | undefined): string {
  const date = parseIso(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** `datetime-local` style value for the picker, e.g. `2026-11-20T13:00`. */
export function toLocalInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Human "in 3 hours" / "2 days ago", used by the trusted-activity cards.
 *
 * `Intl.RelativeTimeFormat` is absent from older Hermes builds, so this falls
 * back to a plain English phrasing instead of throwing on a device where the
 * web target worked fine.
 */
export function relativeFromNow(value: string | null | undefined, locale?: string): string {
  const date = parseIso(value);
  if (!date) return '';
  const diffMs = date.getTime() - Date.now();
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ];

  let amount = Math.round(diffMs / 1000);
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  for (const [candidateUnit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      amount = Math.round(diffMs / ms);
      unit = candidateUnit;
      break;
    }
  }

  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit);
  } catch {
    const plural = Math.abs(amount) === 1 ? unit : `${unit}s`;
    return amount < 0 ? `${Math.abs(amount)} ${plural} ago` : `in ${amount} ${plural}`;
  }
}
