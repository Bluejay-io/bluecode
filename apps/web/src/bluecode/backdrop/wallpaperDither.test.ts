import { describe, expect, it } from "vite-plus/test";

import {
  type Rgb,
  autocontrast,
  ditherWallpaper,
  rampStep,
  wallpaperRamp,
} from "./wallpaperDither";

const BG: Rgb = [16, 16, 16];
const PRIMARY: Rgb = [0, 100, 200];
const FG: Rgb = [250, 250, 250];

describe("wallpaperRamp", () => {
  it("runs dark themes from the page through the accent toward the text", () => {
    const ramp = wallpaperRamp(BG, PRIMARY, FG, true);
    expect(ramp).toHaveLength(8);
    expect(ramp[0]).toEqual(BG);
    expect(ramp.at(-1)).toEqual([113, 168, 223]);
  });

  it("stops light themes at the accent", () => {
    const ramp = wallpaperRamp(BG, PRIMARY, FG, false);
    expect(ramp).toHaveLength(8);
    expect(ramp[0]).toEqual(BG);
    expect(ramp.at(-1)).toEqual(PRIMARY);
  });
});

describe("rampStep", () => {
  it("rounds up past the cell's threshold", () => {
    expect(rampStep(0.5, 4, 0.1)).toBe(2);
    expect(rampStep(0.6, 4, 0.3)).toBe(3);
    expect(rampStep(0.6, 4, 0.5)).toBe(2);
  });

  it("keeps the ends on the first and last steps", () => {
    expect(rampStep(0, 4, 0.01)).toBe(0);
    expect(rampStep(1, 4, 0.99)).toBe(4);
  });
});

describe("ditherWallpaper", () => {
  const lit = (pixels: Uint8ClampedArray) =>
    pixels.filter((_, index) => index % 4 === 3 && pixels[index]! > 0).length;
  const gradient = Uint8Array.from({ length: 64 }, (_, cell) => (cell % 8 < 4 ? 0 : 255));

  it("lights the bright half for dark themes", () => {
    const pixels = ditherWallpaper(gradient, 8, wallpaperRamp(BG, PRIMARY, FG, true), true);
    expect(pixels[3]).toBe(0);
    expect(pixels[7 * 4 + 3]).toBe(255);
    expect(lit(pixels)).toBe(32);
  });

  it("inks the shadows for light themes and leaves highlights clear", () => {
    const pixels = ditherWallpaper(gradient, 8, wallpaperRamp(BG, PRIMARY, FG, false), false);
    expect(pixels[3]).toBe(255);
    expect(pixels[7 * 4 + 3]).toBe(0);
    expect(lit(pixels)).toBe(32);
  });
});

describe("autocontrast", () => {
  it("stretches the used range to full black and white", () => {
    const stretched = autocontrast(Uint8Array.from([100, 120, 140, 160]), 0);
    expect(Array.from(stretched)).toEqual([0, 85, 170, 255]);
  });
});
