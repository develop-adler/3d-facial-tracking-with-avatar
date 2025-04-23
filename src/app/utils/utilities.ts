import type { Array3D } from "@/global";

export const hasGetUserMedia = (): boolean => {
  // Check if the browser has webcam access
  return !!(navigator.mediaDevices?.getUserMedia);
}

export const getDistance = (a: Array3D, b: Array3D): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const getCenterPoint = (a: Array3D, b: Array3D): Array3D => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
  (a[2] + b[2]) / 2,
];

/**
 * Normalizes a value to a range of 0 to 1
 * @param value Value to normalize
 * @param min Minimum value
 * @param max Maximum value
 * @returns Normalized value
 */
export const normalize = (value: number, min: number, max: number): number =>
  Math.max(0, Math.min(1, (value - min) / (max - min)));

// get center index of array
export const getCenterIndex = (arrLength: number) => Math.floor(arrLength / 2);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
