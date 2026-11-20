import { create } from 'zustand';

import {
  setAuthExpiry,
  setAuthToken,
  setUnauthorizedHandler,
} from '@/api/authBridge';
import { auth } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import type { AuthPayload, PublicUser } from '@/api/types';
import { StorageKeys, readJson, removeKey, secureStore, writeJson } from '@/lib/storage';
import { useChatStream } from './chatStream';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

type SessionState = {
  status: SessionStatus;
  token: string | null;
  expiresAt: string | null;
  user: PublicUser | null;
  /** Reads the stored session and validates the expiry. Run once at boot. */
  hydrate: () => Promise<void>;
  signIn: (payload: AuthPayload) => Promise<void>;
  /** Used after a profile update, which returns a replacement token. */
  replaceSession: (payload: AuthPayload) => Promise<void>;
  setUser: (user: PublicUser) => void;
  signOut: (options?: { callApi?: boolean }) => Promise<void>;
};

async function persist(payload: AuthPayload): Promise<void> {
  setAuthToken(payload.token);
  setAuthExpiry(payload.expires_at);
  await secureStore.set(StorageKeys.token, payload.token);
  await secureStore.set(StorageKeys.expiresAt, payload.expires_at);
  await writeJson(StorageKeys.user, payload.user);
}

async function clearPersisted(): Promise<void> {
  setAuthToken(null);
  setAuthExpiry(null);
  await secureStore.delete(StorageKeys.token);
  await secureStore.delete(StorageKeys.expiresAt);
  await removeKey(StorageKeys.user);
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  token: null,
  expiresAt: null,
  user: null,

  hydrate: async () => {
    const [token, expiresAt, user] = await Promise.all([
      secureStore.get(StorageKeys.token),
      secureStore.get(StorageKeys.expiresAt),
      readJson<PublicUser>(StorageKeys.user),
    ]);

    if (!token) {
      set({ status: 'signedOut', token: null, expiresAt: null, user: null });
      return;
    }

    const expiryMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    if (!Number.isNaN(expiryMs) && expiryMs <= Date.now()) {
      // Pre-empt the 401 rather than making the user hit it.
      await clearPersisted();
      set({ status: 'signedOut', token: null, expiresAt: null, user: null });
      return;
    }

    setAuthToken(token);
    setAuthExpiry(expiresAt ?? null);
    set({ status: 'signedIn', token, expiresAt: expiresAt ?? null, user: user ?? null });
  },

  signIn: async (payload) => {
    await persist(payload);
    set({
      status: 'signedIn',
      token: payload.token,
      expiresAt: payload.expires_at,
      user: payload.user,
    });
  },

  replaceSession: async (payload) => {
    await persist(payload);
    set({
      status: 'signedIn',
      token: payload.token,
      expiresAt: payload.expires_at,
      user: payload.user,
    });
  },

  setUser: (user) => {
    set({ user });
    void writeJson(StorageKeys.user, user);
  },

  signOut: async ({ callApi = true } = {}) => {
    if (callApi && get().token) {
      // Best effort: a stateless logout just tells the client to forget the token.
      await auth.logout().catch(() => undefined);
    }
    await clearPersisted();
    // Drop the streaming turn and every cached query for this account.
    useChatStream.getState().reset();
    queryClient.clear();
    set({ status: 'signedOut', token: null, expiresAt: null, user: null });
  },
}));

// A 401 from anywhere in the API layer signs the user out.
setUnauthorizedHandler(() => {
  const { status, signOut } = useSession.getState();
  if (status === 'signedOut') return;
  void signOut({ callApi: false });
});
