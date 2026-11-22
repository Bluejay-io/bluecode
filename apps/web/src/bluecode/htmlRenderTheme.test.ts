import { describe, expect, it } from "vite-plus/test";

import { SEDULA_THEME_COLORS } from "./defaultPalette";
import { themeColorToHex } from "../themePalette";
import { resolveActiveThemeColors } from "../hooks/useHtmlRenderTheme";

const asHex = (colors: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(colors).map(([role, color]) => [role, themeColorToHex(color)]));

describe("HTML render theme colors", () => {
  it.each(["light", "dark"] as const)(
    "with no theme picked are the %s palette the page paints",
    (appearance) => {
      expect(asHex(resolveActiveThemeColors("system", null, appearance))).toEqual(
        asHex(SEDULA_THEME_COLORS[appearance]),
      );
    },
  );
});
