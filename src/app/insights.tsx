import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { consents as consentsApi, forgetInsightsConfirmed, insights as insightsApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { keys } from '@/api/queryKeys';
import type { ConsentKind, MoodObservation, Preference } from '@/api/types';
import { useT } from '@/i18n/useT';
import { confirmDestructive } from '@/lib/confirm';
import { saveJsonToFile } from '@/lib/exportFile';
import { moodLabel, preferenceLine, visibleMoods } from '@/lib/insights';
import { formatDateTime } from '@/lib/time';
import { space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { EmptyState, InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListRow, SectionCard } from '@/ui/Card';
import { TogglePill } from '@/ui/Pill';

type Notice = { tone: 'error' | 'success'; message: string } | null;

/**
 * `/insights` (DESIGN §5.11, INSIGHTS.md).
 *
 * Shows what SAGE saved and lets the user remove it. Nothing is recorded until
 * the `insights` consent is granted — the server does not even offer the tools
 * before that, and this screen does not imply otherwise.
 */
export default function InsightsScreen() {
  const { t, language, locale } = useT();
  const theme = useAppTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<Notice>(null);
  const [includeExpired, setIncludeExpired] = useState(false);

  const insightsQuery = useQuery({
    queryKey: keys.insights(includeExpired),
    queryFn: () => insightsApi.list({ includeExpired }),
  });

  const preferences = insightsQuery.data?.preferences ?? [];
  const moods = visibleMoods(insightsQuery.data?.moods ?? [], { includeExpired });
  const granted = Boolean(insightsQuery.data?.consent?.granted);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['insights'] });
    // The consent switch also appears on /memory, so refresh that view too.
    void queryClient.invalidateQueries({ queryKey: keys.consents });
  }, [queryClient]);

  const runDelete = useCallback(
    (title: string, successMessage: string, action: () => Promise<void>) => {
      confirmDestructive({
        title,
        message: '',
        confirmLabel: t('remove'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void action()
            .then(() => {
              setNotice({ tone: 'success', message: successMessage });
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

  const removePreference = useCallback(
    (preference: Preference) => {
      runDelete(t('confirmRemovePreference'), t('preferenceRemoved'), () =>
        insightsApi.deletePreference(preference.id),
      );
    },
    [runDelete, t],
  );

  const removeMood = useCallback(
    (mood: MoodObservation) => {
      runDelete(t('confirmRemoveMood'), t('moodRemoved'), () => insightsApi.deleteMood(mood.id));
    },
    [runDelete, t],
  );

  const forgetAll = useCallback(() => {
    confirmDestructive({
      title: t('confirmForgetInsightsTitle'),
      message: t('confirmForgetInsightsMessage'),
      confirmLabel: t('forgetInsights'),
      cancelLabel: t('cancel'),
      onConfirm: () => {
        void forgetInsightsConfirmed()
          .then(() => {
            setNotice({ tone: 'success', message: t('insightsDeletedAll') });
            invalidate();
          })
          .catch((error) =>
            setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
          );
      },
    });
  }, [invalidate, t]);

  const handleExport = useCallback(() => {
    void insightsApi
      .exportAll()
      .then((payload) => saveJsonToFile('sage-insights-export.json', payload))
      .then(() => setNotice({ tone: 'success', message: t('insightsExported') }))
      .catch(() => setNotice({ tone: 'error', message: t('insightsExportFailed') }));
  }, [t]);

  const toggleConsent = useCallback(() => {
    const kind: ConsentKind = 'insights';
    void consentsApi
      .set(kind, !granted)
      .then(() => invalidate())
      .catch((error) =>
        setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
      );
  }, [granted, invalidate, t]);

  return (
    <AppShell showBack badge={t('navInsights')}>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(5) }}>
        {notice ? <InlineAlert tone={notice.tone} message={notice.message} /> : null}

        <SectionCard
          title={t('insightsTitle')}
          hint={t('insightsHint')}
          actions={
            <>
              <Button variant="secondary" label={t('export')} icon="file-download" onPress={handleExport} />
              <Button variant="danger" label={t('forgetInsights')} onPress={forgetAll} />
            </>
          }
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            <Button
              variant="tonal"
              label={t('showExpiredMoods')}
              onPress={() => setIncludeExpired((value) => !value)}
            />
            <Button
              variant="secondary"
              label={t('navCare')}
              icon="health-and-safety"
              onPress={() => router.push('/care')}
            />
          </View>

          {insightsQuery.isError ? (
            <InlineAlert
              tone="error"
              message={errorMessage(insightsQuery.error, t('loadFailed'))}
            />
          ) : null}

          {preferences.length === 0 && !insightsQuery.isError ? (
            <EmptyState message={t('insightsEmpty')} />
          ) : (
            preferences.map((preference) => (
              <ListRow
                key={preference.id}
                title={preferenceLine(preference, t('emptyValue'))}
                meta={preference.category}
                action={
                  <Button
                    variant="text"
                    label={t('remove')}
                    onPress={() => removePreference(preference)}
                  />
                }
              />
            ))
          )}
        </SectionCard>

        <SectionCard title={t('feelingsTitle')} hint={t('feelingsHint')}>
          {moods.length === 0 ? (
            <EmptyState message={t('feelingsEmpty')} />
          ) : (
            moods.map((mood) => {
              const label = moodLabel(mood.mood, language);
              const when = formatDateTime(mood.observed_at, locale);
              return (
                <ListRow
                  key={mood.id}
                  title={mood.note ? `${label} — ${mood.note}` : label}
                  meta={when}
                  action={
                    <Button variant="text" label={t('remove')} onPress={() => removeMood(mood)} />
                  }
                />
              );
            })
          )}
        </SectionCard>

        <SectionCard title={t('insightsPermissionTitle')} hint={t('insightsPermissionHint')}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space(3),
            }}
          >
            <AppText variant="hint" color={theme.textMuted} style={{ flex: 1 }}>
              {t('consentInsights')}
            </AppText>
            <TogglePill
              active={granted}
              onLabel={t('on')}
              offLabel={t('off')}
              onPress={toggleConsent}
              testID="insights-consent"
            />
          </View>
        </SectionCard>
      </ScrollView>
    </AppShell>
  );
}
