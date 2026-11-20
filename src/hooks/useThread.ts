import { useQuery } from '@tanstack/react-query';

import { appointments, conversations, memory } from '@/api/endpoints';
import { keys } from '@/api/queryKeys';
import { tzOffsetMinutes } from '@/lib/time';

export function useCurrentThread() {
  return useQuery({
    queryKey: keys.currentThread,
    queryFn: () => conversations.current(),
  });
}

/**
 * Today's appointments in the device's local day. `tz_offset` is minutes east of
 * UTC — exactly `-new Date().getTimezoneOffset()` (API.md §6.2).
 */
export function useTodayAppointments(enabled = true) {
  const tzOffset = tzOffsetMinutes();
  return useQuery({
    queryKey: keys.today(tzOffset),
    queryFn: () => appointments.today(tzOffset),
    enabled,
    staleTime: 60_000,
  });
}

export function useMemory(includeExpired: boolean) {
  return useQuery({
    queryKey: keys.memory(includeExpired),
    queryFn: () => memory.list({ includeExpired }),
  });
}
