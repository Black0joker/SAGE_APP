import * as Location from 'expo-location';

export type Coordinates = { latitude: number; longitude: number };

export type CoordinatesResult =
  | ({ ok: true } & Coordinates)
  | { ok: false; reason: 'denied' | 'error' };

/**
 * One-shot foreground position, with the permission prompt handled in one place.
 *
 * Used by the location ping and by "Save where I am now" on the schedule screen.
 * Coordinates are personal data: they are never logged and never persisted on the
 * device (API.md §12.3).
 */
export async function getCurrentCoordinates(): Promise<CoordinatesResult> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (!existing.granted) {
      if (existing.status === 'denied' && !existing.canAskAgain) {
        return { ok: false, reason: 'denied' };
      }
      const requested = await Location.requestForegroundPermissionsAsync();
      if (!requested.granted) return { ok: false, reason: 'denied' };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      ok: true,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
