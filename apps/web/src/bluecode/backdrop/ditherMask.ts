/** Device pixels per dither cell at 1x; the backdrop rounds it to whole device pixels. */
export const DITHER_CELL_PX = 3;

// 8x8 Bayer matrix, the ordered-dither thresholds that give the cross and checker texture.
const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((rank) => (rank + 0.5) / 64);

const PEAK_DENSITY = 0.9;
const CLOUD_CELLS = 28;
const NOISE_STEP = 4;
// How far left the cloud reaches, fixed so a width change never reshapes it.
export const REACH_COLUMNS = 320;

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263);
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * sx;
  const bottom = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * sx;
  return top + (bottom - top) * sy;
}

// Two layers drifting at different speeds, so the clouds change shape as well as slide.
function clouds(x: number, y: number, seconds: number): number {
  const broad = valueNoise(x + seconds * 0.12, y - seconds * 0.04);
  const fine = valueNoise(x * 2.1 - seconds * 0.2, y * 2.1 + seconds * 0.09);
  return (broad * 2 + fine) / 3;
}

/**
 * Lit cells (1) of a pixel cloud that is densest in the top-right corner and thins out toward the
 * left and bottom edges, at `seconds` into its drift. Cells count from that corner, so a resize
 * only crops or extends the cloud. Pass `into` to reuse a buffer between frames.
 */
export function ditherMask(
  columns: number,
  rows: number,
  seconds = 0,
  into?: Uint8Array,
): Uint8Array {
  const mask = into?.length === columns * rows ? into : new Uint8Array(columns * rows);
  mask.fill(0);
  // The clouds are smooth, so sample them every few cells and blend between samples.
  const gridColumns = Math.ceil(columns / NOISE_STEP) + 1;
  const gridRows = Math.ceil(rows / NOISE_STEP) + 1;
  const grid = new Float32Array(gridColumns * gridRows);
  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridColumns; gx++) {
      const noise = clouds(
        (gx * NOISE_STEP) / CLOUD_CELLS,
        (gy * NOISE_STEP) / CLOUD_CELLS,
        seconds,
      );
      grid[gy * gridColumns + gx] = Math.min(1, Math.max(0, (noise - 0.2) / 0.6));
    }
  }
  const reachX = REACH_COLUMNS;
  const reachY = Math.max(1, rows);
  for (let row = 0; row < rows; row++) {
    const dy = row / reachY;
    const gy = Math.floor(row / NOISE_STEP);
    const ty = (row % NOISE_STEP) / NOISE_STEP;
    for (let fromRight = 0; fromRight < columns; fromRight++) {
      const dx = fromRight / reachX;
      const falloff = 1 - Math.sqrt(dx * dx + dy * dy);
      if (falloff <= 0) continue;
      const gx = Math.floor(fromRight / NOISE_STEP);
      const tx = (fromRight % NOISE_STEP) / NOISE_STEP;
      const at = gy * gridColumns + gx;
      const top = grid[at]! + (grid[at + 1]! - grid[at]!) * tx;
      const bottom =
        grid[at + gridColumns]! + (grid[at + gridColumns + 1]! - grid[at + gridColumns]!) * tx;
      const cloud = top + (bottom - top) * ty;
      const density = PEAK_DENSITY * falloff ** 1.2 * (0.25 + 0.75 * cloud);
      if (density > BAYER_8[(row % 8) * 8 + (fromRight % 8)]!) {
        mask[row * columns + (columns - 1 - fromRight)] = 1;
      }
    }
  }
  return mask;
}

/**
 * Splits the change between two masks into RGBA alpha layers: cells lit in both, cells that
 * appear, and cells that vanish. Fading only the last two moves the pattern with no dip in the
 * cells that stay.
 */
export function crossfadeLayers(
  from: Uint8Array,
  to: Uint8Array,
  stay: Uint8ClampedArray,
  appear: Uint8ClampedArray,
  vanish: Uint8ClampedArray,
): void {
  for (let cell = 0; cell < to.length; cell++) {
    const was = from[cell] === 1;
    const is = to[cell] === 1;
    const alpha = cell * 4 + 3;
    stay[alpha] = was && is ? 255 : 0;
    appear[alpha] = !was && is ? 255 : 0;
    vanish[alpha] = was && !is ? 255 : 0;
  }
}
