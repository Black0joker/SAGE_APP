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
 * `/register` (DESIGN §5.3). Success signs the user in immediately, because the
 * register response carries a token.
 */
export default function RegisterScreen() {
  const { t } = useT();
  const theme = useAppTheme();
  const signIn = useSession((state) => state.signIn);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError(t('required'));
      return;
    }
    if (password.length < 8) {
      setError(t('passwordMin'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setBusy(true);
    try {
      const payload = await auth.register({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirm_password: confirmPassword,
      });
      await signIn(payload);
    } catch (caught) {
      setError(errorMessage(caught, t('requestFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
      heroTitle={t('registerTitle')}
      bullets={[t('bulletChoose'), t('bulletDelete'), t('bulletSideBySide')]}
    >
      {error ? <InlineAlert tone="error" message={error} /> : null}

      <View style={{ gap: space(4) }}>
        <View style={{ flexDirection: 'row', gap: space(3) }}>
          <Field
            label={t('firstNameLabel')}
            value={firstName}
            onChangeText={setFirstName}
            autoComplete="given-name"
            maxLength={60}
            containerStyle={{ flex: 1 }}
            testID="register-first-name"
          />
          <Field
            label={t('lastNameLabel')}
            value={lastName}
            onChangeText={setLastName}
            autoComplete="family-name"
            maxLength={60}
            containerStyle={{ flex: 1 }}
            testID="register-last-name"
          />
        </View>

        <Field
          label={t('emailLabel')}
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          maxLength={254}
          placeholder="you@example.com"
          testID="register-email"
        />

        <Field
          label={t('passwordLabel')}
          icon="lock-outline"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoComplete="new-password"
          hint={t('passwordHint')}
          testID="register-password"
        />

        <Field
          label={t('confirmPasswordLabel')}
          icon="lock-reset"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoComplete="new-password"
          onSubmitEditing={() => void submit()}
          testID="register-confirm"
        />

        <Button
          label={busy ? t('pleaseWait') : t('registerAction')}
          onPress={() => void submit()}
          busy={busy}
          disabled={busy}
          fullWidth
          testID="register-submit"
        />

        <View style={{ alignItems: 'center' }}>
          <Link href="/login" asChild>
            <Pressable accessibilityRole="link" hitSlop={8}>
              <AppText variant="hint" color={theme.textMuted}>
                {t('haveAccount')}
              </AppText>
            </Pressable>
          </Link>
        </View>
      </View>
    </AuthLayout>
  );
}
