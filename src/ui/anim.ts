import { Platform } from 'react-native';

/**
 * The native animated module does not exist on web, where passing
 * `useNativeDriver: true` logs a warning and silently falls back to JS.
 */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';
