export const hasGetUserMedia = (): boolean => {
  // Check if the browser has device access
  return !!navigator.mediaDevices?.getUserMedia;
};

/**
 * Normalizes a value to a range of 0 to 1
 * @param value Value to normalize
 * @param min Minimum value
 * @param max Maximum value
 * @returns Normalized value
 */
export const normalize = (value: number, min: number, max: number): number =>
  Math.max(0, Math.min(1, (value - min) / (max - min)));

export const normalizeToRange = (
  value: number,
  min: number,
  max: number,
  newMin: number,
  newMax: number
): number => {
  const normalizedValue = normalize(value, min, max);
  return newMin + normalizedValue * (newMax - newMin);
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const isValidRPMAvatarId = (id: string): boolean => {
  const objectIdRegex = /^[\da-f]{24}$/;
  return objectIdRegex.test(id);
};
