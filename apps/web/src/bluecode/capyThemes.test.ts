import { wcagContrast } from "culori/fn";
import { describe, expect, it } from "vite-plus/test";

import { getBuiltInThemes, getThemeColorsForMode, getThemeModes } from "../themePalette";

// The default palette's frame against its content card (Capy's own default) is the floor:
// 1.070 in light and 1.063 in dark.
const MIN_CARD_CONTRAST = { light: 1.07, dark: 1.06 } as const;
const MIN_HAIRLINE_CONTRAST = 1.14;

describe("BlueCode built-in themes", () => {
  it("keep the content card visibly apart from the sidebar", () => {
    for (const theme of getBuiltInThemes()) {
      for (const mode of getThemeModes(theme)) {
        const colors = getThemeColorsForMode(theme, mode)!;
        const label = `${theme.id} ${mode}`;
        expect(wcagContrast(colors.canvas, colors.sidebar), label).toBeGreaterThanOrEqual(
          MIN_CARD_CONTRAST[mode],
        );
        expect(wcagContrast(colors.border, colors.canvas), label).toBeGreaterThanOrEqual(
          MIN_HAIRLINE_CONTRAST,
        );
      }
    }
  });
});
