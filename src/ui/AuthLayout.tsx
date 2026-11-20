import type { ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/i18n/useT';
import { usePrefs } from '@/state/prefs';
import { radius, space } from '@/theme/tokens';
import { useAppTheme, useIsDark } from '@/theme/useAppTheme';
import { AppText } from './AppText';
import { IconButton } from './Button';
import { Icon } from './Icon';

/**
 * Auth page frame (DESIGN §3.4). Below `md` the brand panel is dropped and a
 * compact logo row appears above the title, so the form owns the screen.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  bullets,
  heroTitle,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  bullets: string[];
  heroTitle: string;
}) {
  const theme = useAppTheme();
  const isDark = useIsDark();
  const { t } = useT();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const setTheme = usePrefs((state) => state.setTheme);

  const wide = width >= 768;

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: space(4),
          paddingTop: insets.top + space(6),
          paddingBottom: insets.bottom + space(6),
        }}
      >
        <View style={{ width: '100%', maxWidth: 1080, alignSelf: 'center' }}>
          <View
            style={{
              flexDirection: wide ? 'row' : 'column',
              backgroundColor: isDark ? '#111b17' : '#ffffff',
              borderRadius: radius.authCard,
              borderWidth: 1,
              borderColor: theme.cardBorder,
              overflow: 'hidden',
            }}
          >
            {wide ? (
              <View style={{ flex: 1, backgroundColor: '#0f3d33', padding: space(10), justifyContent: 'space-between' }}>
                <View style={{ gap: space(4) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                    <Icon name="spa" size={22} color="#b9ede0" />
                    <AppText variant="wordmark" color="#ffffff">
                      {t('appName')}
                    </AppText>
                  </View>
                  <AppText variant="hero" color="#ffffff">
                    {heroTitle}
                  </AppText>
                  <AppText variant="body" color="#b9ede0">
                    {t('brandTagline')}
                  </AppText>
                  <AppText variant="hint" color="#9ed1c4">
                    {t('brandDescription')}
                  </AppText>
                </View>

                <View style={{ gap: space(3), marginTop: space(8) }}>
                  {bullets.map((bullet) => (
                    <View key={bullet} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                      <Icon name="check-circle" size={18} color="#9ed1c4" />
                      <AppText variant="hint" color="#dbe5e0">
                        {bullet}
                      </AppText>
                    </View>
                  ))}
                  <AppText variant="meta" color="#7ca89b" style={{ marginTop: space(4) }}>
                    {t('brandFooter')}
                  </AppText>
                </View>
              </View>
            ) : null}

            <View style={{ flex: 1, padding: space(6), gap: space(5) }}>
              {!wide ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: '#0f3d33',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="spa" size={18} color="#b9ede0" />
                  </View>
                  <AppText variant="wordmark">{t('appName')}</AppText>
                </View>
              ) : null}

              <View style={{ gap: space(1.5) }}>
                <AppText variant="pageTitle">{title}</AppText>
                <AppText variant="hint" color={theme.textMuted}>
                  {subtitle}
                </AppText>
              </View>

              {children}
            </View>
          </View>

          <View style={{ alignItems: 'center', marginTop: space(5), flexDirection: 'row', justifyContent: 'center', gap: space(3) }}>
            <AppText variant="meta" color={theme.textMeta}>
              {t('appName')} • AI Assistant
            </AppText>
            <IconButton
              name={isDark ? 'light-mode' : 'dark-mode'}
              size={36}
              accessibilityLabel={isDark ? t('switchToLight') : t('switchToDark')}
              onPress={() => setTheme(isDark ? 'light' : 'dark')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
