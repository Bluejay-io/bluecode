import { useEffect, useState } from "react";

import { useCommandPaletteStore } from "../commandPaletteStore";
import { getThemeSnapshot, refreshTheme, syncBrowserChromeTheme } from "../hooks/useTheme";
import { applyThemePalette, THEME_PREVIEW_ID } from "../themePalette";
import { createThemeBrowsePreview, type ThemePaint } from "./themeBrowsePreview";

// Paints like useTheme's applyTheme but writes nothing, so the saved theme stays the device's.
function paintTheme({ theme, appearance }: ThemePaint): void {
  const root = document.documentElement;
  root.classList.add("no-transitions");
  applyThemePalette(theme, appearance);
  root.classList.toggle("dark", appearance === "dark");
  syncBrowserChromeTheme();
  void root.offsetHeight;
  requestAnimationFrame(() => root.classList.remove("no-transitions"));
}

function createDocumentThemeBrowsePreview() {
  return createThemeBrowsePreview({
    readSaved: getThemeSnapshot,
    // The theme editor paints its unsaved draft under this id.
    canPaint: () => document.documentElement.dataset.themeId !== THEME_PREVIEW_ID,
    paint: paintTheme,
    restore: () => refreshTheme(),
    schedule: (run, delayMs) => {
      const handle = window.setTimeout(run, delayMs);
      return () => window.clearTimeout(handle);
    },
  });
}

/** Previews the highlighted "Change theme" row while the palette shows the theme list. */
export function useThemeBrowsePreview(highlightedValue: string | null, inThemeList: boolean): void {
  const paletteOpen = useCommandPaletteStore((state) => state.open);
  const browsing = paletteOpen && inThemeList;
  const [preview] = useState(createDocumentThemeBrowsePreview);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- paints the document's theme, which lives outside React
  useEffect(() => {
    if (browsing) preview.highlight(highlightedValue);
  }, [browsing, highlightedValue, preview]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- repaints the saved theme when browsing ends, however the list or palette closed
  useEffect(() => {
    if (!browsing) return;
    return () => preview.end();
  }, [browsing, preview]);
}
