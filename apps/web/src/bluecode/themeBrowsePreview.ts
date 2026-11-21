import {
  getThemeDefinition,
  getThemeModes,
  resolveThemeAppearance,
  resolveThemeHalf,
  type ThemeAppearance,
  type ThemeHalves,
  type ThemePreference,
  type ThemePreferenceMode,
} from "../themePalette";

export interface SavedThemeState {
  readonly theme: ThemePreference;
  readonly appearanceMode: ThemePreferenceMode;
  readonly systemDark: boolean;
  readonly themeHalves: ThemeHalves | null;
}

export interface ThemePaint {
  readonly theme: ThemePreference;
  readonly appearance: ThemeAppearance;
}

const STANDARD_ROW = "theme:standard";
const PALETTE_ROW_PREFIX = "theme:palette:";
/** Rapid highlight changes (held arrow keys, a pointer sweeping rows) paint once they settle. */
const THEME_BROWSE_SETTLE_MS = 80;

function paintFor(
  theme: ThemePreference,
  halves: ThemeHalves | null,
  saved: SavedThemeState,
): ThemePaint {
  const appearance = resolveThemeAppearance(
    theme,
    saved.systemDark,
    saved.appearanceMode === "system",
    saved.appearanceMode,
    halves,
  );
  return { theme: resolveThemeHalf(theme, halves, appearance), appearance };
}

function resolveSavedThemePaint(saved: SavedThemeState): ThemePaint {
  return paintFor(saved.theme, saved.themeHalves, saved);
}

/**
 * What committing a "Change theme" row would paint, mirroring its run(): a single-mode theme
 * fills that half of the mix, anything else replaces the theme and keeps the appearance mode.
 */
export function resolveThemeRowPaint(itemValue: string, saved: SavedThemeState): ThemePaint | null {
  if (itemValue === STANDARD_ROW) return paintFor(saved.appearanceMode, null, saved);
  if (!itemValue.startsWith(PALETTE_ROW_PREFIX)) return null;
  const definition = getThemeDefinition(itemValue.slice(PALETTE_ROW_PREFIX.length));
  if (!definition) return null;
  const modes = getThemeModes(definition);
  if (modes.length === 1) {
    return paintFor(saved.theme, { ...saved.themeHalves, [modes[0]!]: definition.id }, saved);
  }
  return paintFor(definition.id, null, saved);
}

const isThemeRowValue = (value: string) =>
  value === STANDARD_ROW || value.startsWith(PALETTE_ROW_PREFIX);

interface PaletteViewShape {
  readonly groups: ReadonlyArray<{ readonly items: ReadonlyArray<{ readonly value: string }> }>;
}

/** Whether a command palette view lists "Change theme" rows, wherever its groups sit. */
export function isThemeListView(view: PaletteViewShape | null): boolean {
  return (
    view?.groups.some((group) => group.items.some((item) => isThemeRowValue(item.value))) ?? false
  );
}

export interface ThemeBrowsePreviewDeps {
  readonly readSaved: () => SavedThemeState;
  /** False while something else owns the painted theme, such as a theme editor draft. */
  readonly canPaint: () => boolean;
  readonly paint: (paint: ThemePaint) => void;
  /** Repaints the saved theme from storage. */
  readonly restore: () => void;
  readonly schedule: (run: () => void, delayMs: number) => () => void;
}

const paintKey = (paint: ThemePaint) => `${paint.appearance}|${paint.theme}`;

export function createThemeBrowsePreview(deps: ThemeBrowsePreviewDeps) {
  let paintedKey: string | null = null;
  let pendingValue: string | null = null;
  let cancelSettle: (() => void) | null = null;

  function apply(itemValue: string): void {
    const saved = deps.readSaved();
    const target = resolveThemeRowPaint(itemValue, saved);
    if (!target) return;
    const key = paintKey(target);
    if (key === paintedKey) return;
    if (key === paintKey(resolveSavedThemePaint(saved))) {
      if (paintedKey !== null) {
        paintedKey = null;
        deps.restore();
      }
      return;
    }
    if (paintedKey === null && !deps.canPaint()) return;
    paintedKey = key;
    deps.paint(target);
  }

  function settle(): void {
    cancelSettle = null;
    if (pendingValue === null) return;
    const value = pendingValue;
    pendingValue = null;
    apply(value);
  }

  return {
    /** A null highlight (pointer left the rows, query cleared it) keeps the last preview. */
    highlight(itemValue: string | null): void {
      if (itemValue === null) return;
      if (cancelSettle === null) {
        apply(itemValue);
      } else {
        cancelSettle();
        pendingValue = itemValue;
      }
      cancelSettle = deps.schedule(settle, THEME_BROWSE_SETTLE_MS);
    },
    /** Leaving the list, closing, or committing: show whatever is saved now. */
    end(): void {
      cancelSettle?.();
      cancelSettle = null;
      pendingValue = null;
      if (paintedKey === null) return;
      paintedKey = null;
      deps.restore();
    },
  };
}
