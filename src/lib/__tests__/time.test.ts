import {
  formatDateTime,
  formatTime,
  isPast,
  localDayKey,
  parseIso,
  relativeFromNow,
  toLocalInputValue,
  tzOffsetMinutes,
} from '../time';

describe('tzOffsetMinutes', () => {
  it('is minutes east of UTC, matching the API tz_offset contract', () => {
    // `getTimezoneOffset()` returns minutes to SUBTRACT from local to reach UTC,
    // so the API value is its negation.
    const date = new Date('2026-11-20T12:00:00Z');
    expect(tzOffsetMinutes(date)).toBe(-date.getTimezoneOffset());
  });

  it('stays within the API clamp of ±14 hours', () => {
    const offset = tzOffsetMinutes();
    expect(offset).toBeGreaterThanOrEqual(-840);
    expect(offset).toBeLessThanOrEqual(840);
  });
});

describe('parseIso', () => {
  it('parses an ISO-8601 UTC timestamp with a Z suffix', () => {
    const date = parseIso('2026-11-20T09:41:07Z');
    expect(date?.toISOString()).toBe('2026-11-20T09:41:07.000Z');
  });

  it('returns null for nullish and unparseable values', () => {
    expect(parseIso(null)).toBeNull();
    expect(parseIso(undefined)).toBeNull();
    expect(parseIso('not a date')).toBeNull();
  });
});

describe('isPast', () => {
  it('is true for a past timestamp', () => {
    expect(isPast(new Date(Date.now() - 60_000).toISOString())).toBe(true);
  });

  it('is false for a future timestamp and for nullish input', () => {
    expect(isPast(new Date(Date.now() + 60_000).toISOString())).toBe(false);
    expect(isPast(null)).toBe(false);
  });
});

describe('localDayKey', () => {
  it('formats the local calendar day', () => {
    const date = new Date(2026, 10, 20, 13, 30);
    expect(localDayKey(date.toISOString())).toBe('2026-11-20');
  });

  it('returns an empty string for nullish input', () => {
    expect(localDayKey(null)).toBe('');
  });
});

describe('formatting', () => {
  it('renders nothing for nullish input', () => {
    expect(formatTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
  });

  it('produces a non-empty local string for a real timestamp', () => {
    const iso = new Date(2026, 10, 20, 15, 0).toISOString();
    expect(formatTime(iso, 'en-US').length).toBeGreaterThan(0);
    expect(formatDateTime(iso, 'en-US').length).toBeGreaterThan(0);
  });
});

describe('toLocalInputValue', () => {
  it('produces a datetime-local shaped value', () => {
    const date = new Date(2026, 10, 20, 9, 5);
    expect(toLocalInputValue(date)).toBe('2026-11-20T09:05');
  });
});

describe('relativeFromNow', () => {
  it('describes a past moment', () => {
    const iso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeFromNow(iso, 'en')).toMatch(/2 hours ago/);
  });

  it('returns an empty string for nullish input', () => {
    expect(relativeFromNow(null)).toBe('');
  });
});
