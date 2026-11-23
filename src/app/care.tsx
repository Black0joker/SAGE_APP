import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { care as careApi, consents as consentsApi, forgetCareConfirmed } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { keys } from '@/api/queryKeys';
import type { CareMode, Symptom } from '@/api/types';
import { useT } from '@/i18n/useT';
import { careModeLabel, isConsentRequired, parseSeverity, telUrl } from '@/lib/care';
import { confirmDestructive } from '@/lib/confirm';
import { formatDateTime } from '@/lib/time';
import { space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { EmptyState, InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListRow, SectionCard } from '@/ui/Card';
import { Field } from '@/ui/Field';
import { TogglePill } from '@/ui/Pill';

type Notice = { tone: 'error' | 'success' | 'warning'; message: string } | null;

/**
 * `/care` (DESIGN §5.12, CARE.md).
 *
 * The disclaimer comes first and is not dismissible: SAGE is not a clinician and
 * cannot send help. Every number rendered here comes from the server's curated
 * `resources` — nothing is hard-coded, so a new region never needs an app update.
 */
export default function CareScreen() {
  const { t, language, locale } = useT();
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<Notice>(null);
  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState('');
  const [duration, setDuration] = useState('');

  const careQuery = useQuery({ queryKey: keys.care, queryFn: () => careApi.get() });
  const symptomsQuery = useQuery({
    queryKey: keys.careSymptoms,
    queryFn: () => careApi.listSymptoms(),
  });

  const state = careQuery.data;
  const symptoms = symptomsQuery.data?.symptoms ?? [];
  const resources = state?.resources;
  const granted = Boolean(state?.consent?.granted);
  const region = state?.preferences.region ?? '';
  const preferredMode = state?.preferences.preferred_mode ?? null;

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: keys.care });
    void queryClient.invalidateQueries({ queryKey: keys.careSymptoms });
    void queryClient.invalidateQueries({ queryKey: keys.consents });
  }, [queryClient]);

  const savePreferences = useCallback(
    (next: { region?: string; preferred_mode?: CareMode | null }) => {
      void careApi
        .savePreferences(next)
        .then(() => {
          setNotice({ tone: 'success', message: t('careSaved') });
          invalidate();
        })
        .catch((error) =>
          setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
        );
    },
    [invalidate, t],
  );

  const addSymptom = useCallback(() => {
    const text = symptom.trim();
    if (!text) {
      setNotice({ tone: 'error', message: t('required') });
      return;
    }

    const parsedSeverity = parseSeverity(severity);

    void careApi
      .addSymptom({
        symptom: text,
        ...(parsedSeverity !== null ? { severity: parsedSeverity } : {}),
        ...(duration.trim() ? { duration: duration.trim() } : {}),
      })
      .then(() => {
        setSymptom('');
        setSeverity('');
        setDuration('');
        setNotice({ tone: 'success', message: t('symptomAdded') });
        invalidate();
      })
      .catch((error) => {
        // A 403 is the permission being off, not a failure: say what to do.
        const code = (error as { code?: string; status?: number }) ?? {};
        setNotice({
          tone: isConsentRequired(code) ? 'warning' : 'error',
          message: isConsentRequired(code)
            ? t('healthDataRequired')
            : errorMessage(error, t('genericError')),
        });
      });
  }, [duration, invalidate, severity, symptom, t]);

  const removeSymptom = useCallback(
    (entry: Symptom) => {
      confirmDestructive({
        title: t('confirmRemoveSymptom'),
        message: entry.symptom,
        confirmLabel: t('remove'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void careApi
            .deleteSymptom(entry.id)
            .then(() => {
              setNotice({ tone: 'success', message: t('symptomRemoved') });
              invalidate();
            })
            .catch((error) =>
              setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
            );
        },
      });
    },
    [invalidate, t],
  );

  const forgetAll = useCallback(() => {
    confirmDestructive({
      title: t('confirmForgetCareTitle'),
      message: t('confirmForgetCareMessage'),
      confirmLabel: t('forgetCare'),
      cancelLabel: t('cancel'),
      onConfirm: () => {
        void forgetCareConfirmed()
          .then(() => {
            setNotice({ tone: 'success', message: t('careDeletedAll') });
            invalidate();
          })
          .catch((error) =>
            setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
          );
      },
    });
  }, [invalidate, t]);

  const toggleConsent = useCallback(() => {
    void consentsApi
      .set('health_data', !granted)
      .then(() => invalidate())
      .catch((error) =>
        setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
      );
  }, [granted, invalidate, t]);

  const emergencyTel = telUrl(resources?.emergency);

  return (
    <AppShell showBack badge={t('navCare')}>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(5) }}>
        {/* Always first, never dismissible. */}
        <InlineAlert tone="warning" message={t('careDisclaimer')} />

        {notice ? <InlineAlert tone={notice.tone} message={notice.message} /> : null}

        <SectionCard title={t('careTitle')}>
          <View style={{ gap: space(3) }}>
            <View style={{ gap: space(1.5) }}>
              <AppText variant="label" color={theme.label}>
                {t('careRegionLabel')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
                {(state?.regions ?? []).map((entry) => (
                  <Button
                    key={entry.region}
                    variant={entry.region === region ? 'primary' : 'secondary'}
                    label={entry.label}
                    onPress={() => savePreferences({ region: entry.region })}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: space(1.5) }}>
              <AppText variant="label" color={theme.label}>
                {t('careDefaultModeLabel')}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
                {(state?.modes ?? []).map((entry) => (
                  <Button
                    key={entry.mode}
                    variant={entry.mode === preferredMode ? 'primary' : 'secondary'}
                    label={entry.label || careModeLabel(entry.mode, language)}
                    onPress={() => savePreferences({ preferred_mode: entry.mode })}
                  />
                ))}
              </View>
            </View>
          </View>
        </SectionCard>

        <SectionCard title={t('careNumbersTitle')} hint={t('careNumbersHint')}>
          {resources ? (
            <View style={{ gap: space(2) }}>
              <AppText variant="hint">{resources.message}</AppText>

              {emergencyTel ? (
                <Button
                  label={t('careCall', { number: resources.emergency ?? '' })}
                  icon="call"
                  onPress={() => void Linking.openURL(emergencyTel)}
                  testID="care-emergency-call"
                />
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
                {telUrl(resources.police) ? (
                  <Button
                    variant="secondary"
                    label={`${t('carePolice')} · ${resources.police}`}
                    onPress={() => void Linking.openURL(telUrl(resources.police) as string)}
                  />
                ) : null}
                {telUrl(resources.ambulance) ? (
                  <Button
                    variant="secondary"
                    label={`${t('careAmbulance')} · ${resources.ambulance}`}
                    onPress={() => void Linking.openURL(telUrl(resources.ambulance) as string)}
                  />
                ) : null}
              </View>

              {resources.crisis_lines.length > 0 ? (
                <View style={{ gap: space(1.5) }}>
                  <AppText variant="label" color={theme.label}>
                    {t('careCrisisLines')}
                  </AppText>
                  {resources.crisis_lines.map((line) => {
                    const tel = telUrl(line.number);
                    return (
                      <ListRow
                        key={`${line.name}-${line.number}`}
                        title={line.name}
                        meta={line.number}
                        action={
                          tel ? (
                            <Button
                              variant="text"
                              label={t('careCall', { number: line.number })}
                              onPress={() => void Linking.openURL(tel)}
                            />
                          ) : undefined
                        }
                      />
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : (
            <EmptyState message={t('loading')} />
          )}
        </SectionCard>

        <SectionCard
          title={t('symptomsTitle')}
          hint={t('symptomsHint')}
          actions={<Button variant="danger" label={t('forgetCare')} onPress={forgetAll} />}
        >
          {symptoms.length === 0 ? (
            <EmptyState message={t('symptomsEmpty')} />
          ) : (
            symptoms.map((entry) => (
              <ListRow
                key={entry.id}
                title={entry.symptom}
                meta={[
                  entry.severity !== null ? `${entry.severity}/5` : '',
                  formatDateTime(entry.observed_at, locale),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  <Button variant="text" label={t('remove')} onPress={() => removeSymptom(entry)} />
                }
              />
            ))
          )}

          <View style={{ gap: space(3), marginTop: space(2) }}>
            <Field label={t('symptomLabel')} value={symptom} onChangeText={setSymptom} testID="care-symptom" />
            <Field
              label={t('symptomSeverity')}
              value={severity}
              onChangeText={setSeverity}
              keyboardType="number-pad"
            />
            <Field label={t('symptomDuration')} value={duration} onChangeText={setDuration} />
            <Button
              variant="secondary"
              label={t('addSymptom')}
              icon="add"
              onPress={addSymptom}
              testID="care-add-symptom"
            />
          </View>
        </SectionCard>

        <SectionCard title={t('carePermissionTitle')} hint={t('carePermissionHint')}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space(3),
            }}
          >
            <AppText variant="hint" color={theme.textMuted} style={{ flex: 1 }}>
              {t('consentHealthData')}
            </AppText>
            <TogglePill
              active={granted}
              onLabel={t('on')}
              offLabel={t('off')}
              onPress={toggleConsent}
              testID="care-consent"
            />
          </View>
        </SectionCard>

        <Button
          variant="secondary"
          label={t('navInsights')}
          icon="insights"
          onPress={() => router.push('/insights')}
        />
      </ScrollView>
    </AppShell>
  );
}
