import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import {
  appointments as appointmentsApi,
  consents as consentsApi,
  places as placesApi,
  routines as routinesApi,
} from '@/api/endpoints';
import { errorMessage } from '@/api/errors';
import { keys } from '@/api/queryKeys';
import type { Appointment } from '@/api/types';
import { useT } from '@/i18n/useT';
import { confirmDestructive } from '@/lib/confirm';
import { getCurrentCoordinates } from '@/lib/location';
import { formatDateTime, tzOffsetMinutes } from '@/lib/time';
import { space } from '@/theme/tokens';
import { useAppTheme } from '@/theme/useAppTheme';
import { EmptyState, InlineAlert } from '@/ui/Alert';
import { AppShell } from '@/ui/AppShell';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { SectionCard, ListRow } from '@/ui/Card';
import { Field } from '@/ui/Field';

type Notice = { tone: 'error' | 'success' | 'warning'; message: string } | null;

const DEFAULT_RADIUS = 150;

/**
 * `/schedule` (DESIGN §5.7).
 *
 * Timestamps are UTC on the wire and local on screen. `tz_offset` is minutes east
 * of UTC, which is what the API expects for "today".
 */
export default function ScheduleScreen() {
  const { t, locale } = useT();
  const theme = useAppTheme();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<Notice>(null);

  // Add-appointment form
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(() => {
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  });
  const [place, setPlace] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // Add-routine form
  const [routineLabel, setRoutineLabel] = useState('');
  const [routineCadence, setRoutineCadence] = useState('daily');
  const [routineWindow, setRoutineWindow] = useState('07:30');

  // Add-place form
  const [placeName, setPlaceName] = useState('');
  const [radius, setRadius] = useState(String(DEFAULT_RADIUS));

  const tzOffset = tzOffsetMinutes();

  const todayQuery = useQuery({
    queryKey: keys.today(tzOffset),
    queryFn: () => appointmentsApi.today(tzOffset),
  });
  const upcomingQuery = useQuery({
    queryKey: keys.appointments('upcoming'),
    queryFn: () => appointmentsApi.list({ limit: 50 }),
  });
  const routinesQuery = useQuery({
    queryKey: keys.routines(false),
    queryFn: () => routinesApi.list(false),
  });
  const placesQuery = useQuery({ queryKey: keys.places, queryFn: () => placesApi.list() });
  const consentsQuery = useQuery({ queryKey: keys.consents, queryFn: () => consentsApi.list() });

  const locationGranted = consentsQuery.data?.consents.location?.granted ?? true;

  const invalidateAppointments = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
  }, [queryClient]);

  const createAppointment = useMutation({
    mutationFn: () =>
      appointmentsApi.create({
        title: title.trim(),
        starts_at: when.toISOString(),
        ...(place.trim() ? { place: place.trim() } : {}),
      }),
    onSuccess: () => {
      setTitle('');
      setPlace('');
      setNotice({ tone: 'success', message: t('added') });
      invalidateAppointments();
    },
    onError: (error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
  });

  const markDone = useCallback(
    (appointment: Appointment) => {
      void appointmentsApi
        .updateStatus(appointment.id, 'done')
        .then(invalidateAppointments)
        .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
    },
    [invalidateAppointments, t],
  );

  const removeAppointment = useCallback(
    (appointment: Appointment) => {
      confirmDestructive({
        title: t('confirmRemove'),
        message: appointment.title,
        confirmLabel: t('remove'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void appointmentsApi
            .remove(appointment.id)
            .then(invalidateAppointments)
            .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
        },
      });
    },
    [invalidateAppointments, t],
  );

  const createRoutine = useMutation({
    mutationFn: () =>
      routinesApi.create({
        label: routineLabel.trim(),
        cadence: routineCadence.trim(),
        window: routineWindow.trim(),
      }),
    onSuccess: () => {
      setRoutineLabel('');
      setNotice({ tone: 'success', message: t('added') });
      void queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
    onError: (error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }),
  });

  const removeRoutine = useCallback(
    (id: string, label: string) => {
      confirmDestructive({
        title: t('confirmRemoveRoutine'),
        message: label,
        confirmLabel: t('remove'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void routinesApi
            .remove(id)
            .then(() => queryClient.invalidateQueries({ queryKey: ['routines'] }))
            .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
        },
      });
    },
    [queryClient, t],
  );

  const saveCurrentPlace = useCallback(() => {
    if (!placeName.trim()) {
      setNotice({ tone: 'error', message: t('required') });
      return;
    }
    if (!locationGranted) {
      setNotice({ tone: 'warning', message: t('locationOff') });
      return;
    }

    void getCurrentCoordinates()
      .then(async (coordinates) => {
        if (!coordinates.ok) {
          setNotice({ tone: 'warning', message: t('locationDenied') });
          return;
        }
        const parsedRadius = Number.parseInt(radius, 10);
        await placesApi.create({
          name: placeName.trim(),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          radius_m: Number.isFinite(parsedRadius) ? parsedRadius : DEFAULT_RADIUS,
        });
        setPlaceName('');
        setNotice({ tone: 'success', message: t('placeSaved') });
        void queryClient.invalidateQueries({ queryKey: keys.places });
      })
      .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
  }, [locationGranted, placeName, queryClient, radius, t]);

  const removePlace = useCallback(
    (id: string, name: string) => {
      confirmDestructive({
        title: t('confirmRemovePlace'),
        message: name,
        confirmLabel: t('remove'),
        cancelLabel: t('cancel'),
        onConfirm: () => {
          void placesApi
            .remove(id)
            .then(() => queryClient.invalidateQueries({ queryKey: keys.places }))
            .catch((error) => setNotice({ tone: 'error', message: errorMessage(error, t('genericError')) }));
        },
      });
    },
    [queryClient, t],
  );

  const todayList = todayQuery.data?.appointments ?? [];
  const upcoming = upcomingQuery.data?.appointments ?? [];
  const routineList = routinesQuery.data?.routines ?? [];
  const placeList = placesQuery.data?.places ?? [];

  return (
    <AppShell showBack>
      <ScrollView contentContainerStyle={{ padding: space(4), gap: space(5) }}>
        {notice ? <InlineAlert tone={notice.tone} message={notice.message} /> : null}

        <SectionCard title={t('todayTitle')} hint={t('todayHint')}>
          {todayList.length === 0 ? (
            <EmptyState message={t('todayEmpty')} />
          ) : (
            todayList.map((appointment) => (
              <ListRow
                key={appointment.id}
                title={appointment.title}
                meta={[formatDateTime(appointment.starts_at, locale), appointment.place]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))
          )}
        </SectionCard>

        <SectionCard title={t('upcomingTitle')} hint={t('upcomingHint')}>
          {upcoming.length === 0 ? (
            <EmptyState message={t('upcomingEmpty')} />
          ) : (
            upcoming.map((appointment) => (
              <ListRow
                key={appointment.id}
                title={appointment.title}
                meta={[formatDateTime(appointment.starts_at, locale), appointment.place]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  <View style={{ flexDirection: 'row', gap: space(1) }}>
                    <Button variant="text" label={t('done')} onPress={() => markDone(appointment)} />
                    <Button variant="text" label={t('remove')} onPress={() => removeAppointment(appointment)} />
                  </View>
                }
              />
            ))
          )}

          <View style={{ gap: space(3), marginTop: space(2) }}>
            <Field label={t('titleLabel')} value={title} onChangeText={setTitle} testID="appointment-title" />
            <Field label={t('placeLabel')} value={place} onChangeText={setPlace} testID="appointment-place" />

            <View style={{ gap: space(1.5) }}>
              <AppText variant="label" color={theme.label}>
                {t('whenLabel')}
              </AppText>
              <Button
                variant="secondary"
                label={formatDateTime(when.toISOString(), locale)}
                icon="event"
                onPress={() => setShowPicker(true)}
              />
              {showPicker ? (
                <DateTimePicker
                  value={when}
                  mode="datetime"
                  onChange={(event, date) => {
                    if (Platform.OS !== 'ios') setShowPicker(false);
                    if (event.type === 'dismissed') return;
                    if (date) setWhen(date);
                  }}
                />
              ) : null}
              {showPicker && Platform.OS === 'ios' ? (
                <Button variant="tonal" label={t('ok')} onPress={() => setShowPicker(false)} />
              ) : null}
            </View>

            <Button
              label={t('add')}
              icon="add"
              onPress={() => {
                if (!title.trim()) {
                  setNotice({ tone: 'error', message: t('required') });
                  return;
                }
                createAppointment.mutate();
              }}
              busy={createAppointment.isPending}
              testID="appointment-add"
            />
          </View>
        </SectionCard>

        <SectionCard title={t('routinesTitle')} hint={t('routinesHint')}>
          {routineList.length === 0 ? (
            <EmptyState message={t('routinesEmpty')} />
          ) : (
            routineList.map((routine) => (
              <ListRow
                key={routine.id}
                title={routine.label}
                meta={[routine.cadence, routine.window].filter(Boolean).join(' · ')}
                action={
                  <Button
                    variant="text"
                    label={t('remove')}
                    onPress={() => removeRoutine(routine.id, routine.label)}
                  />
                }
              />
            ))
          )}

          <View style={{ gap: space(3), marginTop: space(2) }}>
            <Field label={t('routineLabel')} value={routineLabel} onChangeText={setRoutineLabel} />
            <Field label={t('routineCadence')} value={routineCadence} onChangeText={setRoutineCadence} />
            <Field label={t('routineWindow')} value={routineWindow} onChangeText={setRoutineWindow} />
            <Button
              variant="secondary"
              label={t('addRoutine')}
              icon="add"
              onPress={() => {
                if (!routineLabel.trim()) {
                  setNotice({ tone: 'error', message: t('required') });
                  return;
                }
                createRoutine.mutate();
              }}
              busy={createRoutine.isPending}
            />
          </View>
        </SectionCard>

        <SectionCard title={t('placesTitle')} hint={t('placesHint')}>
          {placeList.length === 0 ? (
            <EmptyState message={t('placesEmpty')} />
          ) : (
            placeList.map((saved) => (
              <ListRow
                key={saved.id}
                title={saved.name}
                meta={`${saved.radius_m} m`}
                action={<Button variant="text" label={t('remove')} onPress={() => removePlace(saved.id, saved.name)} />}
              />
            ))
          )}

          <View style={{ gap: space(3), marginTop: space(2) }}>
            <Field label={t('placeNameLabel')} value={placeName} onChangeText={setPlaceName} />
            <Field
              label={t('radiusLabel')}
              value={radius}
              onChangeText={setRadius}
              keyboardType="number-pad"
            />
            <Button label={t('saveHere')} icon="place" onPress={saveCurrentPlace} />
          </View>
        </SectionCard>

        {!locationGranted ? <InlineAlert tone="warning" message={t('locationOff')} /> : null}
      </ScrollView>
    </AppShell>
  );
}
