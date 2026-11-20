import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { auth } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { useT } from '@/i18n/useT';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';
import { InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { Button } from '@/ui/Button';
import { SectionCard } from '@/ui/Card';
import { Field } from '@/ui/Field';

type Notice = { tone: 'error' | 'success'; message: string } | null;

/**
 * `/settings` (DESIGN §5.9).
 *
 * Two rules the server enforces and the UI must respect:
 *  - changing the email requires `current_password` and returns a NEW token that
 *    must replace the stored one;
 *  - changing the password does NOT sign other devices out, so the local session
 *    is left alone.
 */
export default function SettingsScreen() {
  const { t } = useT();
  const session = useSession();
  const replaceSession = useSession((state) => state.replaceSession);

  const user = session.user;

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
  const [profileNotice, setProfileNotice] = useState<Notice>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const originalEmail = user?.email ?? '';
  const emailChanged = email.trim().toLowerCase() !== originalEmail.toLowerCase();

  const saveProfile = async () => {
    setProfileNotice(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setProfileNotice({ tone: 'error', message: t('required') });
      return;
    }
    if (emailChanged && !currentPasswordForEmail) {
      setProfileNotice({ tone: 'error', message: t('currentPasswordHint') });
      return;
    }

    setSavingProfile(true);
    try {
      const payload = await auth.updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        ...(emailChanged ? { current_password: currentPasswordForEmail } : {}),
      });
      // A new token comes back because the name and email live in the claims.
      await replaceSession(payload);
      setCurrentPasswordForEmail('');
      setProfileNotice({ tone: 'success', message: t('profileSaved') });
    } catch (caught) {
      setProfileNotice({ tone: 'error', message: errorMessage(caught, t('genericError')) });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    setPasswordNotice(null);

    if (newPassword.length < 8) {
      setPasswordNotice({ tone: 'error', message: t('passwordMin') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ tone: 'error', message: t('passwordMismatch') });
      return;
    }

    setSavingPassword(true);
    try {
      await auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      // Other devices stay signed in; do not clear the local session.
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ tone: 'success', message: t('passwordSaved') });
    } catch (caught) {
      setPasswordNotice({ tone: 'error', message: errorMessage(caught, t('genericError')) });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <AppShell showBack>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(5) }}>
        <SectionCard title={t('profileTitle')} hint={t('profileHint')}>
          {profileNotice ? <InlineAlert tone={profileNotice.tone} message={profileNotice.message} /> : null}

          <View style={{ flexDirection: 'row', gap: space(3) }}>
            <Field label={t('firstNameLabel')} value={firstName} onChangeText={setFirstName} containerStyle={{ flex: 1 }} />
            <Field label={t('lastNameLabel')} value={lastName} onChangeText={setLastName} containerStyle={{ flex: 1 }} />
          </View>

          <Field
            label={t('emailLabel')}
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {emailChanged ? (
            <Field
              label={t('currentPassword')}
              icon="lock-outline"
              hint={t('currentPasswordHint')}
              value={currentPasswordForEmail}
              onChangeText={setCurrentPasswordForEmail}
              secureTextEntry
              revealable
              autoCapitalize="none"
            />
          ) : null}

          <Button
            label={savingProfile ? t('busy') : t('saveProfile')}
            onPress={() => void saveProfile()}
            busy={savingProfile}
          />
        </SectionCard>

        <SectionCard title={t('passwordTitle')} hint={t('passwordSectionHint')}>
          {passwordNotice ? <InlineAlert tone={passwordNotice.tone} message={passwordNotice.message} /> : null}

          <Field
            label={t('currentPassword')}
            icon="lock-outline"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            revealable
            autoCapitalize="none"
          />
          <Field
            label={t('newPassword')}
            icon="lock-reset"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            revealable
            autoCapitalize="none"
          />
          <Field
            label={t('confirmPasswordNew')}
            icon="lock-reset"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            revealable
            autoCapitalize="none"
          />

          <Button
            label={savingPassword ? t('busy') : t('savePassword')}
            onPress={() => void savePassword()}
            busy={savingPassword}
          />
        </SectionCard>
      </ScrollView>
    </AppShell>
  );
}
