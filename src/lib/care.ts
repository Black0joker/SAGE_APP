import type { CareMode } from '@/api/types';

/**
 * Care helpers (CARE.md).
 *
 * The rule that shapes this file: **numbers come from the server**. Nothing here
 * holds an emergency number — the curated set lives in `care.REGIONS` on the
 * server, and the app only formats and dials what it was given.
 */

/** Mode labels for the picker. The server also sends `label`/`hint`; these are fallbacks. */
export const CARE_MODE_LABELS: Record<CareMode, { en: string; ar: string }> = {
  doctor: { en: 'Doctor', ar: 'طبيب' },
  therapist: { en: 'Support', ar: 'دعم' },
  emergency: { en: 'Urgent', ar: 'طارئ' },
};

export function careModeLabel(mode: string, language: 'en' | 'ar'): string {
  const entry = CARE_MODE_LABELS[mode as CareMode];
  return entry ? entry[language] : mode;
}

/**
 * Strips the punctuation a dialer rejects, so `tel:` works on both platforms.
 *
 * Keeps a leading `+` and the digits; drops spaces, dashes, parentheses and dots.
 * Returns `null` when there is nothing dialable, so the caller renders plain text
 * instead of a dead link.
 */
export function dialableNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const leadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return `${leadingPlus ? '+' : ''}${digits}`;
}

/** A `tel:` URL for `Linking.openURL`, or `null` when the number is not dialable. */
export function telUrl(value: string | null | undefined): string | null {
  const number = dialableNumber(value);
  return number ? `tel:${number}` : null;
}

/** The range the API validates for a reported symptom (CARE.md §9). */
export const SEVERITY_MIN = 1;
export const SEVERITY_MAX = 5;

/** Parses a severity field; returns `null` for blank/invalid so it is simply omitted. */
export function parseSeverity(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < SEVERITY_MIN || parsed > SEVERITY_MAX) return null;
  return parsed;
}

/**
 * A `403 consent_required` on `POST /api/care/symptoms` means the permission is
 * off — the screen must prompt for it rather than show a generic error (§10.5).
 */
export function isConsentRequired(error: { code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'consent_required' || error.status === 403;
}

/** The crisis band's body copy, built only from what the server returned. */
export function crisisBody(emergency: string | null, fallback: string): string {
  const number = dialableNumber(emergency);
  return number ? fallback.replace('{number}', emergency ?? number) : fallback.replace('{number}', '').trim();
}
