import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { consents as consentsApi, trusted as trustedApi } from '@/api/endpoints';
import { errorMessage, isApiError } from '@/api/errors';
import { keys } from '@/api/queryKeys';
import type { WatchEntry } from '@/api/types';
import { useT } from '@/i18n/useT';
import { confirmDestructive } from '@/lib/confirm';
import { formatDateTime, relativeFromNow } from '@/lib/time';
import { space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { EmptyState, InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { SectionCard, ListRow } from '@/ui/Card';
import { Field } from '@/ui/Field';
import { Badge, TogglePill } from '@/ui/Pill';

type Notice = { tone: 'error' | 'success'; message: string } | null;

/** Expandable activity card for one accepted contact (DESIGN §5.8). */
function PeekCard({ entry }: { entry: WatchEntry }) {
  const { t, locale } = useT();
  const theme = useAppTheme();
  const [expanded, setExpanded] = useState(false);

  const peekQuery = useQuery({
    queryKey: keys.peek(entry.id),
    queryFn: () => trustedApi.peek(entry.id),
    enabled: expanded && entry.sharing,
    retry: false,
  });

  const forbidden =
    peekQuery.isError && isApiError(peekQuery.error) && peekQuery.error.status === 403;

  return (
    <ListRow
      title={entry.name}
      action={
        <Button
          variant="text"
          label={expanded ? t('hideActivity') : t('viewActivity')}
          onPress={() => setExpanded((value) => !value)}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(2) }}>
        {!entry.sharing ? (
          <Badge label={t('paused')} tone="unknown" />
        ) : (
          <Badge
            label={
              peekQuery.data?.status === 'active'
                ? t('activeBadge')
                : peekQuery.data?.status === 'stale'
                  ? t('staleBadge')
                  : t('unknownBadge')
            }
            tone={
              peekQuery.data?.status === 'active'
                ? 'active'
                : peekQuery.data?.status === 'stale'
                  ? 'stale'
                  : 'unknown'
            }
          />
        )}
      </View>

      {expanded ? (
        <View style={{ gap: space(2), marginTop: space(2) }}>
          {!entry.sharing ? (
            <AppText variant="meta" color={theme.textMeta}>
              {t('notSharing')}
            </AppText>
          ) : forbidden ? (
            // A 403 means the gates closed: surface it, never render an empty card.
            <InlineAlert tone="error" message={t('activityForbidden')} />
          ) : peekQuery.isError ? (
            <InlineAlert tone="error" message={t('activityUnavailable')} />
          ) : peekQuery.isLoading ? (
            <AppText variant="meta" color={theme.textMeta}>
              {t('loading')}
            </AppText>
          ) : peekQuery.data ? (
            <>
              <AppText variant="meta" color={theme.textMeta}>
                {t('lastSeen')}: {peekQuery.data.last_seen ? relativeFromNow(peekQuery.data.last_seen, locale) : t('neverSeen')}
              </AppText>
              <AppText variant="meta" color={theme.textMeta}>
                {t('locationLabel')}:{' '}
                {peekQuery.data.location
                  ? `${peekQuery.data.location.latitude.toFixed(4)}, ${peekQuery.data.location.longitude.toFixed(4)}`
                  : t('locationHidden')}
              </AppText>
              {peekQuery.data.location?.at ? (
                <AppText variant="meta" color={theme.textMeta}>
                  {formatDateTime(peekQuery.data.location.at, locale)}
                </AppText>
              ) : null}
              {peekQuery.data.warning ? (
                <InlineAlert tone="warning" message={t('warning')} />
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </ListRow>
  );
}

/**
 * `/trusted` (DESIGN §5.8).
 *
 * Three gates are re-checked server-side on every cross-user read. Two copy rules
 * matter here: an accepted contact whose owner has sharing off renders as
 * "sharing paused" (never hidden), and a never-active contact is `unknown`, never
 * `stale`.
 */
export default function TrustedScreen() {
  const { t } = useT();
  const theme = useAppTheme();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<Notice>(null);
  const [email, setEmail] = useState('');
  const [allowLastSeen, setAllowLastSeen] = useState(true);
  const [allowLocation, setAllowLocation] = useState(true);

  const trustedQuery = useQuery({ queryKey: keys.trusted, queryFn: () => trustedApi.list() });
  const invitationsQuery = useQuery({
    queryKey: keys.invitations,
    queryFn: () => trustedApi.invitations(),
  });
  const watchingQuery = useQuery({ queryKey: keys.watching, queryFn: () => trustedApi.watching() });
  const consentsQuery = useQuery({ queryKey: keys.consents, queryFn: () => consentsApi.list() });

  const sharingOn = Boolean(consentsQuery.data?.consents.trusted_sharing?.granted);

  const refreshTrusted = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['trusted'] });
  }, [queryClient]);

  const sendInvite = useCallback(() => {
    if (!email.trim()) {
      setNotice({ tone: 'error', message: t('required') });
      return;
    }
    void trustedApi
      .invite({
        email: email.trim().toLowerCase(),
        can_see_last_seen: allowLastSeen,
        can_see_location: allowLocation,
      })
      // Neutral copy: `201` is returned even when no account exists, by design.
      .then(() => {
        setEmail('');
        setNotice({ tone: 'success', message: t('inviteSent') });
        refreshTrusted();
      })
      .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
  }, [allowLastSeen, allowLocation, email, refreshTrusted, t]);

  const revoke = useCallback(
    (id: string, who: string) => {
      confirmDestructive({
        title: t('confirmRevoke'),
        message: who,
        confirmLabel: t('revoke'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void trustedApi
            .revoke(id)
            .then(() => {
              setNotice({ tone: 'success', message: t('revokedMsg') });
              refreshTrusted();
            })
            .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
        },
      });
    },
    [refreshTrusted, t],
  );

  const respond = useCallback(
    (id: string, accept: boolean) => {
      const action = accept
        ? trustedApi.acceptInvitation(id)
        : trustedApi.declineInvitation(id);
      void action
        .then(() => {
          setNotice({ tone: 'success', message: accept ? t('acceptedMsg') : t('declinedMsg') });
          refreshTrusted();
        })
        .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
    },
    [refreshTrusted, t],
  );

  const toggleSharing = useCallback(() => {
    void consentsApi
      .set('trusted_sharing', !sharingOn)
      .then(() => queryClient.invalidateQueries({ queryKey: keys.consents }))
      .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
  }, [queryClient, sharingOn, t]);

  const sent = trustedQuery.data?.trusted ?? [];
  const invitations = invitationsQuery.data?.invitations ?? [];
  const watching = watchingQuery.data?.watching ?? [];

  return (
    <AppShell showBack>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(5) }}>
        {notice ? <InlineAlert tone={notice.tone} message={notice.message} /> : null}

        <SectionCard title={t('sharingTitle')} hint={t('sharingHint')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) }}>
            <AppText variant="hint">{sharingOn ? t('sharingOn') : t('sharingOff')}</AppText>
            <TogglePill
              active={sharingOn}
              onLabel={t('on')}
              offLabel={t('off')}
              onPress={toggleSharing}
            />
          </View>
        </SectionCard>

        <SectionCard title={t('trustedTitle')} hint={t('trustedHint')}>
          {sent.length === 0 ? (
            <EmptyState message={t('trustedEmpty')} />
          ) : (
            sent.map((contact) => (
              <ListRow
                key={contact.id}
                title={contact.email}
                meta={[
                  t(contact.status === 'pending' ? 'pending' : contact.status === 'accepted' ? 'accepted' : 'revoked'),
                  contact.can_see_last_seen ? t('allowLastSeen') : null,
                  contact.can_see_location ? t('allowLocation') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  <Button variant="text" label={t('revoke')} onPress={() => revoke(contact.id, contact.email)} />
                }
              />
            ))
          )}

          <View style={{ gap: space(3), marginTop: space(2) }}>
            <Field
              label={t('inviteEmailLabel')}
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              testID="invite-email"
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) }}>
              <AppText variant="hint">{t('allowLastSeen')}</AppText>
              <TogglePill
                active={allowLastSeen}
                onLabel={t('on')}
                offLabel={t('off')}
                onPress={() => setAllowLastSeen((value) => !value)}
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) }}>
              <AppText variant="hint">{t('allowLocation')}</AppText>
              <TogglePill
                active={allowLocation}
                onLabel={t('on')}
                offLabel={t('off')}
                onPress={() => setAllowLocation((value) => !value)}
              />
            </View>

            <Button label={t('sendInvite')} icon="person-add" onPress={sendInvite} testID="invite-send" />
          </View>
        </SectionCard>

        <SectionCard title={t('invitesTitle')}>
          {invitations.length === 0 ? (
            <EmptyState message={t('invitesEmpty')} />
          ) : (
            invitations.map((invitation) => (
              <ListRow
                key={invitation.id}
                title={invitation.email}
                meta={t('pending')}
                action={
                  <View style={{ flexDirection: 'row', gap: space(1) }}>
                    <Button variant="text" label={t('accept')} onPress={() => respond(invitation.id, true)} />
                    <Button variant="text" label={t('decline')} onPress={() => respond(invitation.id, false)} />
                  </View>
                }
              />
            ))
          )}
        </SectionCard>

        <SectionCard title={t('watchingTitle')}>
          {watching.length === 0 ? (
            <EmptyState message={t('watchingEmpty')} />
          ) : (
            watching.map((entry) => <PeekCard key={entry.id} entry={entry} />)
          )}
          {!sharingOn ? (
            <AppText variant="meta" color={theme.textMeta}>
              {t('sharingOff')}
            </AppText>
          ) : null}
        </SectionCard>
      </ScrollView>
    </AppShell>
  );
}
