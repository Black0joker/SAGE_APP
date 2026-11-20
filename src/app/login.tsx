import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { auth } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useT } from '@/i18n/useT';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { InlineAlert } from '@/ui/Alert';
import { AppText } from '@/ui/AppText';
import { AuthLayout } from '@/ui/AuthLayout';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';

/**
 * `/login` (DESIGN §5.2).
 *
 * Client-side validation mirrors the web: at least 8 characters before the
 * request goes out. The screen itself does not navigate on success — flipping the
 * session to `signedIn` makes `Stack.Protected` swap the whole group.
 */
export default function LoginScreen() {
  const { t } = useT();
  const theme = useAppTheme();
  const signIn = useSession((state) => state.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError(null);

    if (password.length < 8) {
      setError(t('passwordMin'));
      return;
    }

    setBusy(true);
    try {
      const payload = await auth.login({ email: email.trim().toLowerCase(), password });
      await signIn(payload);
    } catch (caught) {
      setError(errorMessage(caught, t('requestFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      heroTitle={t('brandTagline')}
      bullets={[t('bulletMemory'), t('bulletLanguages'), t('bulletPrivate')]}
    >
      {error ? <InlineAlert tone="error" message={error} /> : null}

      <View style={{ gap: space(4) }}>
        <Field
          label={t('emailLabel')}
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="you@example.com"
          testID="login-email"
        />

        <Field
          label={t('passwordLabel')}
          icon="lock-outline"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          placeholder="••••••••"
          onSubmitEditing={() => void submit()}
          testID="login-password"
        />

        <Button
          label={busy ? t('pleaseWait') : t('loginAction')}
          trailingIcon="arrow-forward"
          onPress={() => void submit()}
          busy={busy}
          disabled={busy || email.length === 0 || password.length === 0}
          fullWidth
          testID="login-submit"
        />

        <View style={{ alignItems: 'center' }}>
          <Link href="/register" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="hint" color={theme.textMuted}>
                {t('newToSage')}
              </AppText>
            </Pressable>
          </Link>
        </View>
      </View>
    </AuthLayout>
  );
}
