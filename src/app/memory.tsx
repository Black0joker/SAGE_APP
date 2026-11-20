import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { consents as consentsApi, forgetEverythingConfirmed, memory as memoryApi } from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { keys } from '@/api/queryKeys';
import type { ConsentKind, MemoryFact } from '@/api/types';
import { useMemory } from '@/hooks/useThread';
import { useT } from '@/i18n/useT';
import { confirmDestructive } from '@/lib/confirm';
import { saveJsonToFile } from '@/lib/exportFile';
import { space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { EmptyState, InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { SectionCard, ListRow } from '@/ui/Card';
import { TogglePill } from '@/ui/Pill';

type Notice = { tone: 'error' | 'success'; message: string } | null;

const CONSENT_ORDER: { kind: ConsentKind; labelKey: string }[] = [
  { kind: 'location', labelKey: 'consentLocation' },
  { kind: 'voice', labelKey: 'consentVoice' },
  { kind: 'memory_sharing', labelKey: 'consentMemorySharing' },
  { kind: 'familiar_voice', labelKey: 'consentFamiliarVoice' },
  { kind: 'trusted_sharing', labelKey: 'consentTrustedSharing' },
];

function factValue(value: unknown, emptyLabel: string): string {
  if (value === null || value === undefined) return emptyLabel;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return emptyLabel;
  }
}

/**
 * `/memory` (DESIGN §5.6).
 *
 * Three lists plus the consent switches. Deleting is a hard delete and the copy
 * says so — there is deliberately no client-side "undo".
 */
export default function MemoryScreen() {
  const { t } = useT();
  const theme = useAppTheme();
  const queryClient = useQueryClient();

  const [includeExpired, setIncludeExpired] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const memoryQuery = useMemory(includeExpired);
  const consentsQuery = useQuery({ queryKey: keys.consents, queryFn: () => consentsApi.list() });

  const entities = memoryQuery.data?.entities ?? [];
  const facts = memoryQuery.data?.facts ?? [];
  const relationships = memoryQuery.data?.relationships ?? [];
  const consentMap = consentsQuery.data?.consents ?? {};

  const invalidateMemory = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['memory'] });
  }, [queryClient]);

  const runRowDelete = useCallback(
    (action: () => Promise<void>) => {
      confirmDestructive({
        title: t('confirmDelete'),
        message: t('confirmDelete'),
        confirmLabel: t('remove'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void action()
            .then(() => {
              setNotice({ tone: 'success', message: t('deletedOne') });
              invalidateMemory();
            })
            .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
        },
      });
    },
    [invalidateMemory, t],
  );

  const handleForgetAll = useCallback(() => {
    confirmDestructive({
      title: t('confirmDeleteAllTitle'),
      message: t('confirmDeleteAllMessage'),
      confirmLabel: t('deleteAll'),
      cancelLabel: t('cancel'),
      onConfirm: () => {
        void forgetEverythingConfirmed()
          .then(() => {
            setNotice({ tone: 'success', message: t('deletedAll') });
            invalidateMemory();
          })
          .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
      },
    });
  }, [invalidateMemory, t]);

  const handleExport = useCallback(() => {
    void memoryApi
      .exportAll()
      .then((payload) => saveJsonToFile('sage-memory-export.json', payload))
      .then(() => setNotice({ tone: 'success', message: t('exported') }))
      .catch(() => setNotice({ tone: 'error', message: t('exportFailed') }));
  }, [t]);

  const handleConsent = useCallback(
    (kind: ConsentKind, granted: boolean) => {
      void consentsApi
        .set(kind, granted)
        .then(() => queryClient.invalidateQueries({ queryKey: keys.consents }))
        .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
    },
    [queryClient, t],
  );

  return (
    <AppShell showBack>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(5) }}>
        {notice ? <InlineAlert tone={notice.tone} message={notice.message} /> : null}

        <SectionCard
          title={t('memoryTitle')}
          hint={t('memoryHint')}
          actions={
            <>
              <Button variant="secondary" label={t('export')} icon="file-download" onPress={handleExport} />
              <Button variant="danger" label={t('deleteAll')} onPress={handleForgetAll} />
            </>
          }
        >
          <Button
            variant="tonal"
            label={t('includeExpired')}
            onPress={() => setIncludeExpired((value) => !value)}
          />

          {memoryQuery.isError ? (
            <InlineAlert tone="error" message={errorMessage(memoryQuery.error, t('loadFailed'))} />
          ) : null}

          {entities.length === 0 && facts.length === 0 && relationships.length === 0 ? (
            <EmptyState message={t('empty')} />
          ) : null}

          {entities.length > 0 ? (
            <View style={{ gap: space(2) }}>
              <AppText variant="label" color={theme.label}>
                {t('entitiesTitle')}
              </AppText>
              {entities.map((entity) => (
                <ListRow
                  key={entity.id}
                  title={entity.name}
                  meta={entity.entity_type}
                  action={
                    <Button
                      variant="text"
                      label={t('remove')}
                      onPress={() => runRowDelete(() => memoryApi.deleteEntity(entity.id))}
                    />
                  }
                />
              ))}
            </View>
          ) : null}

          {facts.length > 0 ? (
            <View style={{ gap: space(2) }}>
              <AppText variant="label" color={theme.label}>
                {t('factsTitle')}
              </AppText>
              {facts.map((fact: MemoryFact) => (
                <ListRow
                  key={fact.id}
                  title={`${fact.predicate}: ${factValue(fact.value, t('emptyValue'))}`}
                  meta={`${fact.entity}${fact.valid_until ? ` · ${t('expired')}` : ''}`}
                  action={
                    <Button
                      variant="text"
                      label={t('remove')}
                      onPress={() => runRowDelete(() => memoryApi.deleteFact(fact.id))}
                    />
                  }
                />
              ))}
            </View>
          ) : null}

          {relationships.length > 0 ? (
            <View style={{ gap: space(2) }}>
              <AppText variant="label" color={theme.label}>
                {t('relationshipsTitle')}
              </AppText>
              {relationships.map((relationship) => (
                <ListRow
                  key={relationship.id}
                  title={`${relationship.source} → ${relationship.target}`}
                  meta={relationship.relationship_type}
                  action={
                    <Button
                      variant="text"
                      label={t('remove')}
                      onPress={() => runRowDelete(() => memoryApi.deleteRelationship(relationship.id))}
                    />
                  }
                />
              ))}
            </View>
          ) : null}
        </SectionCard>

        <SectionCard title={t('consentTitle')} hint={t('consentHint')}>
          {CONSENT_ORDER.map(({ kind, labelKey }) => {
            const granted = Boolean(consentMap[kind]?.granted);
            return (
              <View
                key={kind}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: space(3),
                }}
              >
                <AppText variant="hint" style={{ flex: 1 }}>
                  {t(labelKey as never)}
                </AppText>
                <TogglePill
                  active={granted}
                  onLabel={t('on')}
                  offLabel={t('off')}
                  onPress={() => handleConsent(kind, !granted)}
                />
              </View>
            );
          })}
        </SectionCard>
      </ScrollView>
    </AppShell>
  );
}
