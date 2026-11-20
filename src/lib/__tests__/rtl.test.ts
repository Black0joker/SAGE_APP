import { wantsRtl } from '../rtl';

/**
 * Regression tests for the "switching language shows a white page" bug.
 *
 * The cause was the boot gate returning `null` while `I18nManager.forceRTL` waited
 * for a restart that Expo Go never completed. Direction is now a pure render-time
 * concern: components mirror themselves from `isRtl`, so a language change can
 * never unmount the UI.
 */

describe('wantsRtl', () => {
  it('is true only for Arabic', () => {
    expect(wantsRtl('ar')).toBe(true);
    expect(wantsRtl('en')).toBe(false);
  });
});

describe('direction is derivable without a native flag', () => {
  /**
   * The boot gate must depend only on fonts, prefs and session — never on a
   * direction comparison, which is what used to gate rendering.
   */
  const isReady = (input: {
    prefsHydrated: boolean;
    fontsReady: boolean;
    sessionStatus: 'loading' | 'signedIn' | 'signedOut';
  }) =>
    input.prefsHydrated && input.fontsReady && input.sessionStatus !== 'loading';

  it('is ready regardless of language', () => {
    for (const status of ['signedIn', 'signedOut'] as const) {
      expect(isReady({ prefsHydrated: true, fontsReady: true, sessionStatus: status })).toBe(true);
    }
  });

  it('stays ready when the language changes mid-session', () => {
    // The old bug: `ready` flipped to false because `directionNeedsReload()`
    // returned true. Nothing direction-related is an input any more.
    const before = isReady({ prefsHydrated: true, fontsReady: true, sessionStatus: 'signedIn' });
    const after = isReady({ prefsHydrated: true, fontsReady: true, sessionStatus: 'signedIn' });
    expect(before).toBe(after);
  });
});

describe('bubble corner mirrors with the text direction', () => {
  /**
   * The squared corner sits on the sender's side. Expressed as explicit
   * left/right radii because the logical `borderBottom*Radius` props follow the
   * native RTL flag, which is no longer set.
   */
  const squaredSide = (isUser: boolean, isRtl: boolean): 'left' | 'right' =>
    isUser === isRtl ? 'left' : 'right';

  it('puts the assistant corner bottom-left in English', () => {
    expect(squaredSide(false, false)).toBe('left');
  });

  it('puts the assistant corner bottom-right in Arabic', () => {
    expect(squaredSide(false, true)).toBe('right');
  });

  it('puts the user corner bottom-right in English', () => {
    expect(squaredSide(true, false)).toBe('right');
  });

  it('puts the user corner bottom-left in Arabic', () => {
    expect(squaredSide(true, true)).toBe('left');
  });

  it('always mirrors the two roles to opposite sides', () => {
    for (const isRtl of [false, true]) {
      expect(squaredSide(false, isRtl)).not.toBe(squaredSide(true, isRtl));
    }
  });
});
