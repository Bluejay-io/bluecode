// The app icon's moon (assets/bluecode/generate-moon-icons.py, prod) redrawn for a 28px mark: the
// same light, Bayer thresholds, tones and light-centred placement, on a grid of 1.5px cells with
// 1px dots, so every dot lands on whole device pixels at 2x like the icon's gapped dots.
export const MOON_MARK_SIZE = 28;
const CELL = 1.5;
const DOT = 1;
const SCALE = MOON_MARK_SIZE / 780; // the icon frames its moon in a 780-unit square
const CENTER_X = MOON_MARK_SIZE / 2 + (464 - 512) * SCALE;
const CENTER_Y = MOON_MARK_SIZE / 2 + (576 - 512) * SCALE;
const RADIUS = 318 * SCALE;
const EARTHSHINE = 0.1;
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];
// Each tone lights a cell when (intensity - floor) * gain clears the cell's threshold.
const TONES = [
  { floor: 0, gain: 1 },
  { floor: 0.18, gain: 1.25 },
  { floor: 0.62, gain: 2.6 },
] as const;

export interface MoonLayers {
  readonly shadow: string;
  readonly mid: string;
  readonly lit: string;
}

let cached: MoonLayers | null = null;

/** SVG path data for the moon's three tones in a 28-unit box, computed once. */
export function moonLayers(): MoonLayers {
  if (cached) return cached;
  const length = Math.hypot(0.42, -0.5, 0.76);
  const light = [0.42 / length, -0.5 / length, 0.76 / length] as const;
  const cells = Math.ceil(MOON_MARK_SIZE / CELL);
  const paths = ["", "", ""];
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const dx = (column * CELL + CELL / 2 - CENTER_X) / RADIUS;
      const dy = (row * CELL + CELL / 2 - CENTER_Y) / RADIUS;
      const distance = dx * dx + dy * dy;
      if (distance > 1) continue;
      const nz = Math.sqrt(1 - distance);
      const lit = Math.max(0, dx * light[0] + dy * light[1] + nz * light[2]);
      const intensity = Math.max(lit, EARTHSHINE * (0.55 + 0.45 * nz));
      const threshold = (BAYER_8[(row % 8) * 8 + (column % 8)]! + 0.5) / 64;
      let tone = -1;
      TONES.forEach(({ floor, gain }, index) => {
        if ((intensity - floor) * gain > threshold) tone = index;
      });
      if (tone >= 0) paths[tone] += `M${column * CELL} ${row * CELL}h${DOT}v${DOT}h-${DOT}z`;
    }
  }
  cached = { shadow: paths[0]!, mid: paths[1]!, lit: paths[2]! };
  return cached;
}
