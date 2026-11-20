import { I18nManager, Platform } from 'react-native';

import type { Language } from '@/state/prefs';

/**
 * Text direction.
 *
 * The app mirrors itself **manually** through `isRtl` from `useT()` — every
 * component that needs it switches `flexDirection`, `textAlign`, the Arabic font
 * and the line height. That means a language switch is instant, with no reload.
 *
 * We deliberately do NOT use `I18nManager.forceRTL`. It only takes effect after a
 * genuine native restart, so switching language at runtime either did nothing or
 * (worse) left the app rendering nothing while waiting for a reload that Expo Go
 * never completed. Because the layout is already mirrored by hand, forcing native
 * RTL bought nothing and cost a restart.
 *
 * `resetNativeDirection()` exists only to undo the flag left behind by earlier
 * builds that did call `forceRTL(true)`; without it the native engine would stay
 * RTL even after switching back to English.
 */

export const wantsRtl = (language: Language) => language === 'ar';

/**
 * Clears a persisted native RTL flag. Call once at boot, before the first paint.
 *
 * Only relevant for installs that ran an older build; a fresh install is already
 * LTR. It takes effect on the *next* native start, which is why it must never be
 * called in response to a language change.
 */
export function resetNativeDirection(): void {
  if (Platform.OS === 'web') return;
  try {
    if (I18nManager.isRTL) {
      I18nManager.allowRTL(false);
      I18nManager.forceRTL(false);
    }
  } catch {
    // Not fatal: the manual mirroring is what actually drives the layout.
  }
}

/** Web only: keep the document in sync so screen readers report the right lang. */
export function applyWebDirection(language: Language): void {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  document.documentElement.dir = wantsRtl(language) ? 'rtl' : 'ltr';
  document.documentElement.lang = language;
}

/** Explicit start/end insets, since `marginStart` depends on the native RTL flag. */
export function startInset(language: Language, value: number) {
  return wantsRtl(language) ? { marginRight: value } : { marginLeft: value };
}

export function endInset(language: Language, value: number) {
  return wantsRtl(language) ? { marginLeft: value } : { marginRight: value };
}
