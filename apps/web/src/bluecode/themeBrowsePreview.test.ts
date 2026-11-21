import { describe, expect, it, vi } from "vite-plus/test";

import {
  getBuiltInThemes,
  getThemeModes,
  installCustomTheme,
  invalidateCustomThemes,
  parseThemeFile,
  THEME_FILE_VERSION,
} from "../themePalette";
import {
  createThemeBrowsePreview,
  isThemeListView,
  resolveThemeRowPaint,
  type SavedThemeState,
  type ThemePaint,
} from "./themeBrowsePreview";

const twoModeTheme = getBuiltInThemes().find((theme) => getThemeModes(theme).length === 2)!;
const otherTwoModeTheme = getBuiltInThemes().find(
  (theme) => theme.id !== twoModeTheme.id && getThemeModes(theme).length === 2,
)!;

function installLightOnlyTheme(): string {
  const stored = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
  invalidateCustomThemes();
  return installCustomTheme(
    parseThemeFile({
      version: THEME_FILE_VERSION,
      id: "paper",
      name: "Paper",
      appearance: "light",
      colors: { canvas: "#fbfaf7", accent: "#5b6cff" },
    }),
  ).id;
}

const darkStandard: SavedThemeState = {
  theme: "dark",
  appearanceMode: "dark",
  systemDark: false,
  themeHalves: null,
};

function harness(initial: SavedThemeState = darkStandard) {
  let saved = initial;
  const painted: ThemePaint[] = [];
  let restores = 0;
  let settle: (() => void) | null = null;
  const preview = createThemeBrowsePreview({
    readSaved: () => saved,
    canPaint: () => true,
    paint: (paint) => painted.push(paint),
    restore: () => {
      restores += 1;
    },
    schedule: (run) => {
      settle = run;
      return () => {
        if (settle === run) settle = null;
      };
    },
  });
  return {
    preview,
    painted,
    restores: () => restores,
    settle: () => settle?.(),
    save: (next: SavedThemeState) => {
      saved = next;
    },
  };
}

describe("resolveThemeRowPaint", () => {
  it("previews a theme in the current appearance without flipping it", () => {
    expect(resolveThemeRowPaint(`theme:palette:${twoModeTheme.id}`, darkStandard)).toEqual({
      theme: twoModeTheme.id,
      appearance: "dark",
    });
    expect(
      resolveThemeRowPaint(`theme:palette:${twoModeTheme.id}`, {
        ...darkStandard,
        theme: "system",
        appearanceMode: "system",
        systemDark: false,
      }),
    ).toEqual({ theme: twoModeTheme.id, appearance: "light" });
  });

  it("paints what saving a single-mode theme would: only its half of the mix", () => {
    const paperId = installLightOnlyTheme();
    const row = `theme:palette:${paperId}`;
    // Saving fills the light half, which dark mode does not show.
    expect(resolveThemeRowPaint(row, darkStandard)).toEqual({ theme: "dark", appearance: "dark" });
    expect(resolveThemeRowPaint(row, { ...darkStandard, appearanceMode: "light" })).toEqual({
      theme: paperId,
      appearance: "light",
    });
  });

  it("previews the standard theme in the saved appearance mode and ignores other rows", () => {
    const saved: SavedThemeState = { ...darkStandard, theme: twoModeTheme.id };
    expect(resolveThemeRowPaint("theme:standard", saved)).toEqual({
      theme: "dark",
      appearance: "dark",
    });
    expect(resolveThemeRowPaint("appearance:light", saved)).toBeNull();
    expect(resolveThemeRowPaint("theme:palette:missing", saved)).toBeNull();
  });

  it("recognizes the theme list by its rows, not its group order", () => {
    const group = (...values: string[]) => ({ items: values.map((value) => ({ value })) });
    expect(isThemeListView({ groups: [group("appearance:light"), group("theme:palette:x")] })).toBe(
      true,
    );
    expect(isThemeListView({ groups: [group("appearance:light", "appearance:dark")] })).toBe(false);
    expect(isThemeListView(null)).toBe(false);
  });
});

describe("createThemeBrowsePreview", () => {
  const rowA = `theme:palette:${twoModeTheme.id}`;
  const rowB = `theme:palette:${otherTwoModeTheme.id}`;

  it("paints the first highlight at once and the last of a rapid run once it settles", () => {
    const { preview, painted, settle } = harness();
    preview.highlight(rowA);
    expect(painted.map((paint) => paint.theme)).toEqual([twoModeTheme.id]);
    preview.highlight(rowB);
    preview.highlight("theme:standard");
    preview.highlight(rowB);
    expect(painted).toHaveLength(1);
    settle();
    expect(painted.map((paint) => paint.theme)).toEqual([twoModeTheme.id, otherTwoModeTheme.id]);
  });

  it("keeps the preview when the highlight clears and restores on returning to the saved theme", () => {
    const { preview, painted, restores, settle } = harness();
    preview.highlight(rowA);
    settle();
    preview.highlight(null);
    expect(restores()).toBe(0);
    preview.highlight("theme:standard");
    settle();
    expect(painted).toHaveLength(1);
    expect(restores()).toBe(1);
  });

  it("does not paint the saved theme's own row", () => {
    const { preview, painted, restores } = harness({ ...darkStandard, theme: twoModeTheme.id });
    preview.highlight(rowA);
    preview.end();
    expect(painted).toEqual([]);
    expect(restores()).toBe(0);
  });

  it("restores the saved theme when browsing is cancelled", () => {
    const { preview, restores, settle, painted } = harness();
    preview.highlight(rowA);
    preview.highlight(rowB);
    preview.end();
    settle();
    expect(painted).toHaveLength(1);
    expect(restores()).toBe(1);
    preview.end();
    expect(restores()).toBe(1);
  });

  it("ends a commit by repainting from storage, which now holds the previewed theme", () => {
    const { preview, painted, restores, save } = harness();
    preview.highlight(rowA);
    save({ ...darkStandard, theme: twoModeTheme.id });
    preview.end();
    expect(restores()).toBe(1);
    preview.highlight(rowA);
    expect(painted).toHaveLength(1);
  });

  it("leaves a theme editor draft alone", () => {
    const painted: ThemePaint[] = [];
    let restores = 0;
    const preview = createThemeBrowsePreview({
      readSaved: () => darkStandard,
      canPaint: () => false,
      paint: (paint) => painted.push(paint),
      restore: () => {
        restores += 1;
      },
      schedule: () => () => {},
    });
    preview.highlight(rowA);
    preview.end();
    expect(painted).toEqual([]);
    expect(restores).toBe(0);
  });
});
