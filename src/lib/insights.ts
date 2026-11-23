import type { Mood, MoodObservation, Preference } from '@/api/types';

/**
 * Insights helpers (INSIGHTS.md §9.5).
 *
 * Mood labels are a **client concern**: the server returns the stable `mood` key
 * and the app localises it. Nothing here invents or interprets a feeling.
 */

/** The 13 fixed labels, in both languages. Typed so a missing one is a compile error. */
export const MOOD_LABELS: Record<Mood, { en: string; ar: string }> = {
  happy: { en: 'happy', ar: 'سعيد' },
  excited: { en: 'excited', ar: 'متحمس' },
  grateful: { en: 'grateful', ar: 'ممتن' },
  hopeful: { en: 'hopeful', ar: 'متفائل' },
  calm: { en: 'calm', ar: 'هادئ' },
  neutral: { en: 'neutral', ar: 'محايد' },
  tired: { en: 'tired', ar: 'متعب' },
  unwell: { en: 'unwell', ar: 'متوعك' },
  stressed: { en: 'stressed', ar: 'متوتر' },
  anxious: { en: 'anxious', ar: 'قلق' },
  frustrated: { en: 'frustrated', ar: 'محبط' },
  sad: { en: 'sad', ar: 'حزين' },
  angry: { en: 'angry', ar: 'غاضب' },
};

/** Falls back to the raw key rather than blanking a row on an unknown mood. */
export function moodLabel(mood: string, language: 'en' | 'ar'): string {
  const entry = MOOD_LABELS[mood as Mood];
  return entry ? entry[language] : mood;
}

/**
 * Renders a preference `value`, which the server JSON-decodes and may return as
 * any JSON type. Arrays and objects are joined rather than shown as `[object
 * Object]`.
 */
export function formatPreferenceValue(value: unknown, emptyLabel = '—'): string {
  if (value === null || value === undefined) return emptyLabel;
  if (typeof value === 'string') return value.trim() || emptyLabel;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((entry) => formatPreferenceValue(entry, '')).filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : emptyLabel;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return emptyLabel;
    }
  }
  return emptyLabel;
}

/**
 * A feeling stops being current at `expires_at`; expired rows are hidden unless
 * the user explicitly asks for history (INSIGHTS.md §9.5).
 */
export function isExpired(observation: Pick<MoodObservation, 'expires_at'>, now = Date.now()): boolean {
  const at = Date.parse(observation.expires_at);
  if (Number.isNaN(at)) return false;
  return at <= now;
}

/** Hidden-by-default filter, matching what the server sends with `include_expired` off. */
export function visibleMoods(
  moods: MoodObservation[],
  options: { includeExpired: boolean; now?: number },
): MoodObservation[] {
  if (options.includeExpired) return moods;
  const now = options.now ?? Date.now();
  return moods.filter((mood) => !isExpired(mood, now));
}

/** `label: value` for a preference row, per DESIGN §5.11. */
export function preferenceLine(
  preference: Pick<Preference, 'label' | 'value'>,
  emptyLabel = '—',
): string {
  return `${preference.label}: ${formatPreferenceValue(preference.value, emptyLabel)}`;
}
