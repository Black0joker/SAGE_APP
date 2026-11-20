import { useColorScheme } from 'react-native';

import { usePrefs } from '@/state/prefs';
import { darkTheme, lightTheme, type AppTheme } from './tokens';

/**
 * Resolves the active theme: an explicit choice wins, otherwise we follow the OS
 * and keep following it (`userInterfaceStyle: automatic` in app.json).
 */
export function useIsDark(): boolean {
  const mode = usePrefs((state) => state.theme);
  const system = useColorScheme();
  return mode === 'dark' || (mode === 'system' && system === 'dark');
}

export function useAppTheme(): AppTheme {
  return useIsDark() ? darkTheme : lightTheme;
}

export function useDirection(): 'ltr' | 'rtl' {
  const language = usePrefs((state) => state.language);
  return language === 'ar' ? 'rtl' : 'ltr';
}
