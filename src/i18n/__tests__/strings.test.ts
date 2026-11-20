import { strings } from '../strings';

/**
 * The Arabic map is typed as `Record<StringKey, string>`, so a missing key is a
 * compile error. These tests guard the other direction: no stray or duplicate
 * keys, and no leftover English in the Arabic copy for the visible chrome.
 */
describe('string inventory', () => {
  it('has exactly the same keys in both languages', () => {
    expect(Object.keys(strings.ar).sort()).toEqual(Object.keys(strings.en).sort());
  });

  it('has no empty values', () => {
    for (const [key, value] of Object.entries(strings.en)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(strings.ar[key as keyof typeof strings.en].trim().length).toBeGreaterThan(0);
    }
  });

  it('translates the navigation labels', () => {
    for (const key of ['navChat', 'navTrusted', 'navSchedule', 'navMemory', 'navCall'] as const) {
      expect(strings.ar[key]).not.toBe(strings.en[key]);
    }
  });

  it('keeps the interpolation placeholder in the Arabic welcome', () => {
    expect(strings.ar.welcomeNamed).toContain('{name}');
    expect(strings.en.welcomeNamed).toContain('{name}');
  });

  it('uses the neutral "unknown" badge rather than "stale" for never-active contacts', () => {
    expect(strings.en.unknownBadge).toBe('unknown');
    expect(strings.en.staleBadge).toBe('stale');
    expect(strings.en.unknownBadge).not.toBe(strings.en.staleBadge);
  });
});
