import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { location as locationApi } from '@/api/endpoints';
import { isApiError } from '@/api/errors';
import type { LocationContext } from '@/api/types';
import { getCurrentCoordinates } from '@/lib/location';

/**
 * The periodic location ping (API.md §7.4, §11.4).
 *
 * Rules taken straight from the docs:
 *  - every 5 s, only while Chat or Call is foregrounded
 *  - skip a tick while a request is in flight
 *  - pause in the background, resume on return
 *  - stop permanently on a denied permission or a `403 consent_required`
 *  - `204` means "stored, no familiar place" and must render as no banner
 */

export type PingStatus = 'idle' | 'running' | 'denied' | 'consent_off' | 'error';

export type LocationPingState = {
  context: LocationContext | null;
  status: PingStatus;
};

const INTERVAL_MS = 5000;

export function useLocationPing(enabled: boolean): LocationPingState {
  const [context, setContext] = useState<LocationContext | null>(null);
  const [status, setStatus] = useState<PingStatus>('idle');

  const stoppedRef = useRef(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Disabled: nothing to run. The caller renders `context` as null anyway.
    if (!enabled) return;

    stoppedRef.current = false;
    inFlightRef.current = false;

    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const tick = async () => {
      if (stoppedRef.current || inFlightRef.current) return;
      if (AppState.currentState !== 'active') return;

      inFlightRef.current = true;
      try {
        const coordinates = await getCurrentCoordinates();
        if (stoppedRef.current) return;

        if (!coordinates.ok) {
          if (coordinates.reason === 'denied') {
            stoppedRef.current = true;
            stopTimer();
            setStatus('denied');
            setContext(null);
          }
          // 'error' is transient; the next tick retries.
          return;
        }

        const result = await locationApi.ping(coordinates.latitude, coordinates.longitude);
        if (stoppedRef.current) return;

        setContext(result?.context ?? null);
        setStatus('running');
      } catch (error) {
        if (isApiError(error) && error.code === 'consent_required') {
          // The user revoked the location consent: stop pinging and hide the banner.
          stoppedRef.current = true;
          stopTimer();
          setStatus('consent_off');
          setContext(null);
          return;
        }
        setStatus('error');
      } finally {
        inFlightRef.current = false;
      }
    };

    const start = () => {
      if (stoppedRef.current || timerRef.current) return;
      void tick();
      timerRef.current = setInterval(() => void tick(), INTERVAL_MS);
    };

    start();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stopTimer();
    });

    return () => {
      stoppedRef.current = true;
      stopTimer();
      subscription.remove();
    };
  }, [enabled]);

  return { context: enabled ? context : null, status };
}
