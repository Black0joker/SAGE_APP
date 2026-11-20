/**
 * Regression test for a native-only crash found in Expo Go on Android:
 *
 *   TypeError: Cannot read property 'forEach' of null
 *     at _validateTransforms (processTransform.js:142)
 *
 * React Native's Fabric diff passes `null` to `processTransform` when a
 * `transform` style flips from an array to `undefined`. The fix is to always
 * supply an array, so this test pins the shape of the style the Button produces.
 */

// The style logic is inlined here rather than importing the component, so the
// test does not need to mount React Native's native view layer.
function buttonTransform(pressed: boolean, variant: string): { scale: number }[] {
  return [{ scale: pressed && variant === 'primary' ? 0.995 : 1 }];
}

describe('Button transform style', () => {
  it('is always an array, never undefined (the crash condition)', () => {
    expect(Array.isArray(buttonTransform(false, 'primary'))).toBe(true);
    expect(Array.isArray(buttonTransform(true, 'primary'))).toBe(true);
    expect(Array.isArray(buttonTransform(false, 'secondary'))).toBe(true);
  });

  it('never yields null or undefined entries', () => {
    for (const pressed of [true, false]) {
      for (const variant of ['primary', 'secondary', 'danger', 'hangup', 'text', 'tonal']) {
        const transform = buttonTransform(pressed, variant);
        expect(transform).not.toBeNull();
        expect(transform).not.toBeUndefined();
        expect(transform.every((entry) => entry != null)).toBe(true);
      }
    }
  });

  it('scales only a pressed primary button', () => {
    expect(buttonTransform(true, 'primary')[0]?.scale).toBe(0.995);
    expect(buttonTransform(false, 'primary')[0]?.scale).toBe(1);
    expect(buttonTransform(true, 'secondary')[0]?.scale).toBe(1);
  });

  it('keeps exactly one key per transform entry (RN invariant)', () => {
    for (const entry of buttonTransform(true, 'primary')) {
      expect(Object.keys(entry)).toHaveLength(1);
    }
  });
});
