export type Rgb = readonly [red: number, green: number, blue: number];

/** CSS pixels per dither cell at 1x; the backdrop rounds it to whole device pixels. */
export const DITHER_CELL_PX = 2;

// 8x8 Bayer matrix, the ordered-dither thresholds that give the cross and checker texture.
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((rank) => (rank + 0.5) / 64);

const mix = (from: Rgb, to: Rgb, amount: number): Rgb => [
  Math.round(from[0] + (to[0] - from[0]) * amount),
  Math.round(from[1] + (to[1] - from[1]) * amount),
  Math.round(from[2] + (to[2] - from[2]) * amount),
];

const RAMP_STEPS = 8;

/**
 * Eight tones from the page colour into the accent, in both modes, so a photo reads the same in
 * light and dark: dark themes light up bright sky and go past the accent toward the text colour;
 * light themes ink shadows and stop at the accent so a pale page stays calm.
 */
export function wallpaperRamp(background: Rgb, primary: Rgb, foreground: Rgb, dark: boolean) {
  const peak = dark ? mix(primary, foreground, 0.45) : primary;
  // Dark themes reach the accent three quarters of the way, then brighten toward the text.
  const accentAt = dark ? 0.75 : 1;
  return Array.from({ length: RAMP_STEPS }, (_, step): Rgb => {
    const at = step / (RAMP_STEPS - 1);
    return at <= accentAt
      ? mix(background, primary, at / accentAt)
      : mix(primary, peak, (at - accentAt) / (1 - accentAt));
  });
}

/** Ramp position of a luminance in [0, 1]: brightness for dark themes, shadow for light. */
function rampValue(luminance: number, dark: boolean): number {
  return dark ? luminance : 1 - luminance;
}

/** The ramp step a cell takes, given its value along the ramp and its Bayer threshold. */
export function rampStep(value: number, steps: number, threshold: number): number {
  const position = Math.min(1, Math.max(0, value)) * steps;
  const lower = Math.min(Math.floor(position), steps - 1);
  return position - lower > threshold ? lower + 1 : lower;
}

/** Stretches luminance so `cutoff` of the cells on each end clip to black and white. */
export function autocontrast(luminance: Uint8Array, cutoff = 0.02): Uint8Array {
  const histogram = new Uint32Array(256);
  for (const value of luminance) histogram[value]! += 1;
  const clip = Math.floor(luminance.length * cutoff);
  let low = 0;
  for (let seen = 0; low < 255 && seen + histogram[low]! <= clip; low++) seen += histogram[low]!;
  let high = 255;
  for (let seen = 0; high > low && seen + histogram[high]! <= clip; high--) {
    seen += histogram[high]!;
  }
  if (high <= low) return luminance;
  const scale = 255 / (high - low);
  return luminance.map((value) => Math.min(255, Math.max(0, Math.round((value - low) * scale))));
}

/** Dithers grayscale cells into RGBA pixels from the theme's ramp; its first step stays clear. */
export function ditherWallpaper(
  luminance: Uint8Array,
  columns: number,
  ramp: ReadonlyArray<Rgb>,
  dark: boolean,
): Uint8ClampedArray<ArrayBuffer> {
  const stretched = autocontrast(luminance);
  const steps = ramp.length - 1;
  const pixels = new Uint8ClampedArray(stretched.length * 4);
  for (let cell = 0; cell < stretched.length; cell++) {
    const column = cell % columns;
    const row = (cell - column) / columns;
    const threshold = BAYER_8[(row % 8) * 8 + (column % 8)]!;
    const step = rampStep(rampValue(stretched[cell]! / 255, dark), steps, threshold);
    if (step === 0) continue;
    const color = ramp[step]!;
    const at = cell * 4;
    pixels[at] = color[0];
    pixels[at + 1] = color[1];
    pixels[at + 2] = color[2];
    pixels[at + 3] = 255;
  }
  return pixels;
}
