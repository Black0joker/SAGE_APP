import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Language = 'en' | 'ar';

type PrefsState = {
  theme: ThemeMode;
  language: Language;
  /** True once persisted values have been read back from storage. */
  hydrated: boolean;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  toggleTheme: (resolvedIsDark: boolean) => void;
  toggleLanguage: () => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      language: 'en',
      hydrated: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleTheme: (resolvedIsDark) => set({ theme: resolvedIsDark ? 'light' : 'dark' }),
      toggleLanguage: () => set({ language: get().language === 'ar' ? 'en' : 'ar' }),
    }),
    {
      name: 'sage_prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ theme: state.theme, language: state.language }),
      onRehydrateStorage: () => (state) => {
        state?.setTheme(state.theme);
        usePrefs.setState({ hydrated: true });
      },
    },
  ),
);

/** The API accepts aliases; normalise anything unknown to `en` (API.md §3.1). */
export function normaliseLanguage(value: unknown): Language {
  if (typeof value !== 'string') return 'en';
  const lower = value.trim().toLowerCase();
  if (lower === 'ar' || lower === 'ara' || lower === 'arabic') return 'ar';
  return 'en';
}
