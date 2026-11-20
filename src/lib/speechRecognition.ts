import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Speech-recognition wrapper with graceful degradation.
 *
 * `expo-speech-recognition` has native code, so it is absent in Expo Go. The
 * library's entry module calls `requireNativeModule` at *import time*, which
 * throws before any `try/catch` around `require()` can help — Metro surfaces it
 * as a red screen even though the require is wrapped.
 *
 * So we never require the library to ask "is it available?". We ask
 * `requireOptionalNativeModule`, which returns `null` instead of throwing, and
 * only require the library once we know the native side exists.
 */

const NATIVE_MODULE_NAME = 'ExpoSpeechRecognition';

type RecognitionModule = typeof import('expo-speech-recognition');

let loaded: RecognitionModule | null = null;

/** True when the native module is present (i.e. a development build, not Expo Go). */
export function isSpeechRecognitionAvailable(): boolean {
  try {
    return requireOptionalNativeModule(NATIVE_MODULE_NAME) != null;
  } catch {
    return false;
  }
}

function loadModule(): RecognitionModule | null {
  if (loaded) return loaded;
  if (!isSpeechRecognitionAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-speech-recognition') as RecognitionModule;
    return loaded;
  } catch {
    return null;
  }
}

export type RecognitionHandlers = {
  onStart?: () => void;
  onEnd?: () => void;
  onPartial?: (transcript: string) => void;
  onFinal?: (transcript: string) => void;
  onError?: (code: string, message: string) => void;
};

export type RecognitionEventName = 'start' | 'end' | 'result' | 'error' | 'nomatch';

/** Subscribes to recognition events; returns an unsubscribe function. */
export function addRecognitionListeners(handlers: RecognitionHandlers): () => void {
  const module = loadModule();
  if (!module) return () => undefined;

  // The module is an Expo NativeModule, so `addListener` is available on it.
  const emitter = module.ExpoSpeechRecognitionModule as unknown as {
    addListener: (event: string, listener: (payload: unknown) => void) => { remove: () => void };
  };

  const subscriptions = [
    emitter.addListener('start', () => handlers.onStart?.()),
    emitter.addListener('end', () => handlers.onEnd?.()),
    emitter.addListener('result', (payload) => {
      const event = payload as { results?: { transcript?: string }[]; isFinal?: boolean };
      const transcript = event.results?.[0]?.transcript ?? '';
      if (!transcript) return;
      if (event.isFinal) handlers.onFinal?.(transcript);
      else handlers.onPartial?.(transcript);
    }),
    emitter.addListener('error', (payload) => {
      const event = payload as { error?: string; message?: string };
      handlers.onError?.(event.error ?? 'error', event.message ?? '');
    }),
  ];

  return () => subscriptions.forEach((subscription) => subscription.remove());
}

export async function requestRecognitionPermissions(): Promise<boolean> {
  const module = loadModule();
  if (!module) return false;
  try {
    const permissions = await module.ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return Boolean(permissions.granted);
  } catch {
    return false;
  }
}

export function startRecognition(language: 'en' | 'ar'): void {
  const module = loadModule();
  if (!module) return;
  try {
    module.ExpoSpeechRecognitionModule.start({
      // Call-mode Arabic is Egyptian colloquial, matching the persona (§6.2).
      lang: language === 'ar' ? 'ar-EG' : 'en-US',
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: false,
      addsPunctuation: false,
    });
  } catch {
    // A missing native module must never crash the call screen.
  }
}

export function stopRecognition(): void {
  const module = loadModule();
  if (!module) return;
  try {
    module.ExpoSpeechRecognitionModule.stop();
  } catch {
    // not running
  }
}

export function abortRecognition(): void {
  const module = loadModule();
  if (!module) return;
  try {
    module.ExpoSpeechRecognitionModule.abort();
  } catch {
    // not running
  }
}
