import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  NotoSansArabic_400Regular,
  NotoSansArabic_500Medium,
  NotoSansArabic_600SemiBold,
  NotoSansArabic_700Bold,
} from '@expo-google-fonts/noto-sans-arabic';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/api/queryClient';
import { applyWebDirection, resetNativeDirection } from '@/lib/rtl';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';
import { useAppTheme } from '@/theme/useAppTheme';

/**
 * Boot sequence (DESIGN §6.1, §8.2, §8.4):
 *   1. keep the splash up
 *   2. read the stored theme + language and the stored session
 *   3. clear any native RTL flag left by an older build
 *   4. only then decide Login vs Chat from the token
 *
 * Direction is applied by manual mirroring at render time, so switching language
 * never restarts the app (see `src/lib/rtl.ts`).
 */

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    NotoSansArabic_400Regular,
    NotoSansArabic_500Medium,
    NotoSansArabic_600SemiBold,
    NotoSansArabic_700Bold,
  });

  const prefsHydrated = usePrefs((state) => state.hydrated);
  const language = usePrefs((state) => state.language);
  const status = useSession((state) => state.status);
  const hydrate = useSession((state) => state.hydrate);
  const theme = useAppTheme();

  useEffect(() => {
    void hydrate();
    resetNativeDirection();
  }, [hydrate]);

  /**
   * Direction is a render-time concern now: the components mirror themselves via
   * `isRtl`. Nothing here can block rendering, which is what used to turn a
   * language switch into a white page.
   */
  useEffect(() => {
    if (!prefsHydrated) return;
    applyWebDirection(language);
  }, [prefsHydrated, language]);

  // Derived, not stored: readiness is a pure function of the boot inputs.
  const ready =
    prefsHydrated && (fontsLoaded || Boolean(fontError)) && status !== 'loading';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) {
    // The splash screen is still covering this. Render a matching surface rather
    // than `null`, so a boot problem can never present as a blank white page.
    return <View style={{ flex: 1, backgroundColor: theme.page }} />;
  }

  const signedIn = status === 'signedIn';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.page },
            }}
          >
            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="login" />
              <Stack.Screen name="register" />
            </Stack.Protected>

            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="index" />
              <Stack.Screen name="memory" />
              <Stack.Screen name="schedule" />
              <Stack.Screen name="trusted" />
              <Stack.Screen name="documents" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="call" options={{ presentation: 'modal' }} />
            </Stack.Protected>
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
