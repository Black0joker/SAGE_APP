/* eslint-disable @typescript-eslint/no-require-imports -- the test deliberately
   re-requires the module under different native-module states. */

/**
 * Regression test for:
 *
 *   ERROR [Error: Cannot find native module 'ExpoSpeechRecognition']
 *
 * The library's entry module calls `requireNativeModule` at import time, so
 * merely requiring it to ask "is it available?" threw before any try/catch could
 * help. Availability is now decided by `requireOptionalNativeModule`, which
 * returns null instead of throwing, and the library is only required once the
 * native side is known to exist.
 */

// Jest hoists `jest.mock` factories above imports, so they may not close over
// local variables. Stash the mocks on `globalThis` instead.
declare global {
  var __probe: jest.Mock;
  var __throwMissing: () => never;
}

globalThis.__probe = jest.fn();
globalThis.__throwMissing = () => {
  throw new Error("Cannot find native module 'ExpoSpeechRecognition'");
};

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: (name: string) => globalThis.__probe(name),
}));

jest.mock('expo-speech-recognition', () => ({
  // Mirror the real failure: the module evaluates fine, but touching its native
  // export throws, because `requireNativeModule` runs at import time.
  get ExpoSpeechRecognitionModule() {
    return globalThis.__throwMissing();
  },
  ExpoWebSpeechRecognition: class {},
}));

describe('speech recognition availability', () => {
  beforeEach(() => {
    jest.resetModules();
    globalThis.__probe.mockReset();
  });

  it('reports unavailable without throwing when the native module is missing', () => {
    globalThis.__probe.mockReturnValue(null);

    const { isSpeechRecognitionAvailable } = require('../speechRecognition');
    expect(() => isSpeechRecognitionAvailable()).not.toThrow();
    expect(isSpeechRecognitionAvailable()).toBe(false);
  });

  it('never requires the library when the native module is absent', () => {
    globalThis.__probe.mockReturnValue(null);

    const mod = require('../speechRecognition');
    // Every entry point must be safe in Expo Go, where the library cannot load.
    expect(() => mod.startRecognition('en')).not.toThrow();
    expect(() => mod.stopRecognition()).not.toThrow();
    expect(() => mod.abortRecognition()).not.toThrow();
    expect(() => mod.addRecognitionListeners({})()).not.toThrow();
    return expect(mod.requestRecognitionPermissions()).resolves.toBe(false);
  });

  it('reports available when the native module is present', () => {
    globalThis.__probe.mockReturnValue({ name: 'ExpoSpeechRecognition' });

    const { isSpeechRecognitionAvailable } = require('../speechRecognition');
    expect(isSpeechRecognitionAvailable()).toBe(true);
  });

  it('treats a throwing probe as unavailable', () => {
    globalThis.__probe.mockImplementation(() => {
      throw new Error('boom');
    });

    const { isSpeechRecognitionAvailable } = require('../speechRecognition');
    expect(isSpeechRecognitionAvailable()).toBe(false);
  });

  it('queries the documented native module name', () => {
    globalThis.__probe.mockReturnValue(null);

    const { isSpeechRecognitionAvailable } = require('../speechRecognition');
    isSpeechRecognitionAvailable();
    expect(globalThis.__probe).toHaveBeenCalledWith('ExpoSpeechRecognition');
  });
});
