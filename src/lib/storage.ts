import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Storage wrappers.
 *
 * Secrets (the SAGE JWT and its expiry) go in the platform keystore on native.
 * Everything else (theme, language, the cached public user) is non-secret and
 * lives in AsyncStorage.
 *
 * `expo-secure-store` is native-only, so web falls back to AsyncStorage. That is
 * acceptable for the web target only; the shipped app is native.
 */

const isWeb = Platform.OS === 'web';

/** SecureStore rejects values over ~2048 bytes on Android; chunk defensively. */
const CHUNK = 1800;

async function webStorageGet(key: string): Promise<string | null> {
  const value = await AsyncStorage.getItem(`secure:${key}`);
  return value;
}

async function secureGet(key: string): Promise<string | null> {
  if (isWeb) return webStorageGet(key);
  try {
    const chunks = await SecureStore.getItemAsync(`${key}__chunks`);
    if (chunks) {
      const count = Number.parseInt(chunks, 10);
      let out = '';
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(`${key}__part${i}`);
        if (part == null) return null;
        out += part;
      }
      return out;
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.setItem(`secure:${key}`, value);
    return;
  }
  try {
    if (value.length <= CHUNK) {
      // Clear any stale chunked layout before writing the flat value.
      await secureDelete(key);
      await SecureStore.setItemAsync(key, value);
      return;
    }
    await SecureStore.deleteItemAsync(key);
    const count = Math.ceil(value.length / CHUNK);
    await SecureStore.setItemAsync(`${key}__chunks`, String(count));
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(`${key}__part${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
  } catch {
    // A keystore failure must not crash the app; fall back to AsyncStorage.
    await AsyncStorage.setItem(`secure:${key}`, value);
  }
}

async function secureDelete(key: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(`secure:${key}`);
    return;
  }
  try {
    const chunks = await SecureStore.getItemAsync(`${key}__chunks`);
    if (chunks) {
      const count = Number.parseInt(chunks, 10);
      for (let i = 0; i < count; i += 1) {
        await SecureStore.deleteItemAsync(`${key}__part${i}`);
      }
      await SecureStore.deleteItemAsync(`${key}__chunks`);
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(`secure:${key}`);
}

export const secureStore = {
  get: secureGet,
  set: secureSet,
  delete: secureDelete,
};

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are best-effort; never block the UI on a failed write.
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Storage keys, kept in one place so sign-out can clear exactly the right set. */
export const StorageKeys = {
  token: 'sage_token',
  expiresAt: 'sage_expires_at',
  user: 'sage_user',
  prefs: 'sage_prefs',
} as const;
