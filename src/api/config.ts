import { Platform } from 'react-native';

/**
 * Base URL resolution.
 *
 * `.env` sets `EXPO_PUBLIC_API_URL` (Expo inlines it at build time). The web app
 * defaults to `http://127.0.0.1:5000` in local dev, but a loopback address is
 * meaningless to an Android emulator, which reaches the host as `10.0.2.2`.
 *
 * So: if the configured URL is still the loopback default and we are on Android,
 * swap in `10.0.2.2`. A physical device must set the machine's LAN IP in `.env`,
 * which we never rewrite.
 */
const LOOPBACK_DEFAULT = 'http://127.0.0.1:5000';
const ANDROID_EMULATOR_HOST = 'http://10.0.2.2:5000';

function readConfiguredUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  return configured && configured.length > 0 ? configured : LOOPBACK_DEFAULT;
}

function isLoopback(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(url);
}

export function getApiBaseUrl(): string {
  const url = readConfiguredUrl();
  if (Platform.OS === 'android' && isLoopback(url)) {
    return ANDROID_EMULATOR_HOST;
  }
  return url.replace(/\/+$/, '');
}

/** Considered "local dev" when the API is not on https. */
export function isLocalDev(): boolean {
  return getApiBaseUrl().startsWith('http://');
}
