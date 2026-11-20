import { QueryClient } from '@tanstack/react-query';

import { isApiError } from './errors';

/**
 * One QueryClient for the app. Cleared on sign-out so nothing from the previous
 * account can be rendered as current (API.md §9: the client must never present a
 * cached response as fresh, and data is per-account).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry a client error — it will fail the same way.
        if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
