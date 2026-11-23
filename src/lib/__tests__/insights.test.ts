import type { MoodObservation, Mood } from '@/api/types';
import {
  MOOD_LABELS,
  formatPreferenceValue,
  isExpired,
  moodLabel,
  preferenceLine,
  visibleMoods,
} from '../insights';

/**
 * Insights helpers (INSIGHTS.md §9.5).
 *
 * Two rules from the docs are pinned here: mood labels are a **client** concern
 * in both languages, and an expired feeling must not keep colouring the screen.
 */

const ALL_MOODS: Mood[] = [
  'happy',
  'excited',
  'grateful',
  'hopeful',
  'calm',
  'neutral',
  'tired',
  'unwell',
  'stressed',
  'anxious',
  'frustrated',
  'sad',
  'angry',
];

function mood(overrides: Partial<MoodObservation> = {}): MoodObservation {
  return {
    id: 'm1',
    mood: 'anxious',
    valence: -0.6,
    confidence: 1,
    note: 'before the exam',
    source: 'user_stated',
    observed_at: '2026-11-20T09:00:00Z',
    expires_at: '2026-11-27T09:00:00Z',
    created_at: '2026-11-20T09:00:00Z',
    ...overrides,
  };
}

describe('mood labels', () => {
  it('covers all 13 moods the server can return', () => {
    expect(Object.keys(MOOD_LABELS).sort()).toEqual([...ALL_MOODS].sort());
  });

  it('translates every mood into Arabic, with no English left behind', () => {
    for (const entry of ALL_MOODS) {
      const arabic = MOOD_LABELS[entry].ar;
      expect(arabic.trim().length).toBeGreaterThan(0);
      expect(arabic).not.toBe(MOOD_LABELS[entry].en);
      // An Arabic label must actually contain Arabic script.
      expect(arabic).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('returns the right language', () => {
    expect(moodLabel('anxious', 'en')).toBe('anxious');
    expect(moodLabel('anxious', 'ar')).toBe('قلق');
  });

  it('falls back to the raw key rather than blanking an unknown mood', () => {
    expect(moodLabel('bewildered', 'en')).toBe('bewildered');
  });
});

describe('formatPreferenceValue', () => {
  it('renders strings, numbers and booleans', () => {
    expect(formatPreferenceValue('Sam')).toBe('Sam');
    expect(formatPreferenceValue(3)).toBe('3');
    expect(formatPreferenceValue(false)).toBe('false');
  });

  it('joins arrays instead of printing brackets', () => {
    expect(formatPreferenceValue(['short', 'warm'])).toBe('short, warm');
  });

  it('renders objects as JSON rather than [object Object]', () => {
    expect(formatPreferenceValue({ level: 2 })).toBe('{"level":2}');
  });

  it('uses the empty label for null and blank values', () => {
    expect(formatPreferenceValue(null)).toBe('—');
    expect(formatPreferenceValue(undefined)).toBe('—');
    expect(formatPreferenceValue('   ')).toBe('—');
  });
});

describe('preferenceLine', () => {
  it('renders label: value', () => {
    expect(preferenceLine({ label: 'What to call you', value: 'Sam' })).toBe(
      'What to call you: Sam',
    );
  });
});

describe('expiry', () => {
  const now = Date.parse('2026-11-23T00:00:00Z');

  it('treats a past expires_at as expired', () => {
    expect(isExpired(mood({ expires_at: '2026-11-21T00:00:00Z' }), now)).toBe(true);
  });

  it('treats a future expires_at as current', () => {
    expect(isExpired(mood({ expires_at: '2026-11-27T00:00:00Z' }), now)).toBe(false);
  });

  it('does not hide a row with an unparseable date', () => {
    expect(isExpired(mood({ expires_at: 'not a date' }), now)).toBe(false);
  });

  it('hides expired feelings by default', () => {
    const moods = [
      mood({ id: 'current', expires_at: '2026-11-27T00:00:00Z' }),
      mood({ id: 'old', expires_at: '2026-11-21T00:00:00Z' }),
    ];

    expect(visibleMoods(moods, { includeExpired: false, now }).map((entry) => entry.id)).toEqual([
      'current',
    ]);
  });

  it('shows them when the user asks for history', () => {
    const moods = [
      mood({ id: 'current', expires_at: '2026-11-27T00:00:00Z' }),
      mood({ id: 'old', expires_at: '2026-11-21T00:00:00Z' }),
    ];

    expect(visibleMoods(moods, { includeExpired: true, now })).toHaveLength(2);
  });
});
