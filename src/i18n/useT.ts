import { useCallback } from 'react';

import { usePrefs } from '@/state/prefs';
import { strings, type StringKey } from './strings';

export type TFn = (key: StringKey, vars?: Record<string, string | number>) => string;

/**
 * Translation helper. `t('key')` returns the string for the active language, and
 * `t('key', { name: 'Youssef' })` interpolates `{name}` placeholders.
 */
export function useT(): { t: TFn; language: 'en' | 'ar'; isRtl: boolean; locale: string } {
  const language = usePrefs((state) => state.language);

  const t = useCallback<TFn>(
    (key, vars) => {
      let value: string = strings[language][key];
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.split(`{${name}}`).join(String(replacement));
        }
      }
      return value;
    },
    [language],
  );

  return {
    t,
    language,
    isRtl: language === 'ar',
    locale: language === 'ar' ? 'ar-EG' : 'en-US',
  };
}

export type { StringKey };
