import { CARE_MODE_LABELS, careModeLabel, dialableNumber, isConsentRequired, parseSeverity, telUrl } from '../care';

/**
 * Care helpers (CARE.md).
 *
 * The safety-critical rule is pinned first: the app never holds an emergency
 * number of its own. It formats and dials whatever the server returned, so a new
 * region never needs an app release.
 */

describe('dialableNumber', () => {
  it('keeps a plain number', () => {
    expect(dialableNumber('123')).toBe('123');
    expect(dialableNumber('911')).toBe('911');
  });

  it('strips the punctuation a dialer rejects', () => {
    expect(dialableNumber('(02) 123-4567')).toBe('021234567');
    expect(dialableNumber('1 800 555 0199')).toBe('18005550199');
  });

  it('keeps a leading plus for international numbers', () => {
    expect(dialableNumber('+20 123 456 7890')).toBe('+201234567890');
  });

  it('returns null when there is nothing to dial', () => {
    expect(dialableNumber('')).toBeNull();
    expect(dialableNumber(null)).toBeNull();
    expect(dialableNumber(undefined)).toBeNull();
    expect(dialableNumber('call us')).toBeNull();
  });
});

describe('telUrl', () => {
  it('builds a tel: URL from the server value', () => {
    expect(telUrl('123')).toBe('tel:123');
    expect(telUrl('+20 123')).toBe('tel:+20123');
  });

  it('returns null instead of a dead link', () => {
    expect(telUrl(null)).toBeNull();
    expect(telUrl('n/a')).toBeNull();
  });
});

describe('mode labels', () => {
  it('covers all three modes in both languages', () => {
    for (const mode of ['doctor', 'therapist', 'emergency'] as const) {
      const entry = CARE_MODE_LABELS[mode];
      expect(entry.en.trim().length).toBeGreaterThan(0);
      expect(entry.ar).toMatch(/[\u0600-\u06FF]/);
      expect(entry.ar).not.toBe(entry.en);
    }
  });

  it('falls back to the raw key for an unknown mode', () => {
    expect(careModeLabel('dentist', 'en')).toBe('dentist');
  });
});

describe('parseSeverity', () => {
  it('accepts the 1-5 range', () => {
    expect(parseSeverity('1')).toBe(1);
    expect(parseSeverity('5')).toBe(5);
    expect(parseSeverity(' 3 ')).toBe(3);
  });

  it('returns null for blanks and out-of-range values', () => {
    expect(parseSeverity('')).toBeNull();
    expect(parseSeverity('0')).toBeNull();
    expect(parseSeverity('6')).toBeNull();
    expect(parseSeverity('abc')).toBeNull();
  });
});

describe('isConsentRequired', () => {
  it('recognises the 403 the symptoms endpoint returns', () => {
    expect(isConsentRequired({ code: 'consent_required' })).toBe(true);
    expect(isConsentRequired({ status: 403 })).toBe(true);
  });

  it('does not treat other failures as a consent problem', () => {
    expect(isConsentRequired({ code: 'invalid_request', status: 400 })).toBe(false);
    expect(isConsentRequired(null)).toBe(false);
  });
});

describe('no hard-coded emergency numbers', () => {
  /**
   * CARE.md §9: "The region list is safety-critical and curated." A number baked
   * into the client would silently shadow a corrected one on the server, so this
   * asserts the helpers never invent a value.
   */
  it('produces nothing from nothing', () => {
    expect(dialableNumber(undefined)).toBeNull();
    expect(telUrl(undefined)).toBeNull();
    expect(dialableNumber('')).toBeNull();
  });
});
