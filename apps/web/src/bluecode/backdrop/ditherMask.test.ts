import { describe, expect, it } from "vite-plus/test";

import { crossfadeLayers, ditherMask } from "./ditherMask";

const litAt = (mask: Uint8Array, columns: number, row: number, column: number) =>
  mask[row * columns + column] === 1;

describe("ditherMask", () => {
  it("keeps the same cells against the right edge when the area widens", () => {
    const narrow = ditherMask(120, 40);
    const wide = ditherMask(200, 40);
    for (let row = 0; row < 12; row++) {
      for (let fromRight = 0; fromRight < 12; fromRight++) {
        expect(litAt(wide, 200, row, 199 - fromRight)).toBe(
          litAt(narrow, 120, row, 119 - fromRight),
        );
      }
    }
  });

  it("is densest in the top-right corner and empty at the bottom-left", () => {
    const columns = 300;
    const rows = 100;
    const mask = ditherMask(columns, rows);
    let corner = 0;
    let far = 0;
    for (let row = 0; row < 16; row++) {
      for (let column = 0; column < 16; column++) {
        corner += litAt(mask, columns, row, columns - 1 - column) ? 1 : 0;
        far += litAt(mask, columns, rows - 1 - row, column) ? 1 : 0;
      }
    }
    expect(corner).toBeGreaterThan(32);
    expect(far).toBe(0);
  });

  it("splits a keyframe change so the start and end frames are both exact", () => {
    const columns = 160;
    const rows = 60;
    const from = ditherMask(columns, rows, 3);
    const to = ditherMask(columns, rows, 4);
    const layer = () => new Uint8ClampedArray(columns * rows * 4);
    const [stay, appear, vanish] = [layer(), layer(), layer()];
    crossfadeLayers(from, to, stay, appear, vanish);
    for (let cell = 0; cell < from.length; cell++) {
      const alpha = cell * 4 + 3;
      // Start of the fade shows stay and vanish; the end shows stay and appear.
      expect(stay[alpha]! > 0 || vanish[alpha]! > 0).toBe(from[cell] === 1);
      expect(stay[alpha]! > 0 || appear[alpha]! > 0).toBe(to[cell] === 1);
    }
  });
});
