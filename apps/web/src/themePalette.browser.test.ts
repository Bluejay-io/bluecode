import { converter } from "culori/fn";
import { describe, expect, it } from "vite-plus/test";

import "~/index.css";
// BlueCode: the stock palette is Sedula's, painted over index.css by this file.
import "~/bluecode/default-palette.css";
import {
  getSedulaThemeColors,
  getStandardPaintedThemeColors,
  type ThemeColorRole,
} from "./themePalette";

const toRgb = converter("rgb");

function paintedChannels(variable: string, canvas: readonly number[] = [0, 0, 0]): number[] {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(${variable})`;
  document.body.append(probe);
  try {
    const color = toRgb(getComputedStyle(probe).backgroundColor)!;
    const alpha = color.alpha ?? 1;
    return [color.r, color.g, color.b].map(
      (channel, index) => (channel * alpha + (canvas[index]! / 255) * (1 - alpha)) * 255,
    );
  } finally {
    probe.remove();
  }
}

// BlueCode: each role's token as index.css and default-palette.css resolve it with no theme.
const STOCK_ROLE_TOKENS: ReadonlyArray<readonly [ThemeColorRole, string]> = [
  ["canvas", "--background"],
  ["chrome", "--app-chrome-background"],
  ["toolbar", "--toolbar-background"],
  ["toolbarForeground", "--toolbar-foreground"],
  ["toolbarBorder", "--toolbar-border"],
  ["toolbarControl", "--toolbar-control"],
  ["toolbarControlForeground", "--toolbar-control-foreground"],
  ["toolbarControlHover", "--toolbar-control-hover"],
  ["surface", "--card"],
  ["surfaceRaised", "--surface-raised"],
  ["surfaceOverlay", "--popover"],
  ["text", "--foreground"],
  ["textMuted", "--muted-foreground"],
  ["border", "--border"],
  ["input", "--input"],
  ["focus", "--ring"],
  ["accent", "--primary"],
  ["accentForeground", "--primary-foreground"],
  ["secondary", "--secondary"],
  ["secondaryForeground", "--secondary-foreground"],
  ["muted", "--muted"],
  ["mutedForeground", "--muted-foreground"],
  ["placeholder", "--placeholder"],
  ["secondaryLabel", "--secondary-label"],
  ["iconMuted", "--icon-muted"],
  ["error", "--error"],
  ["errorForeground", "--error-foreground"],
  ["errorSurface", "--error-surface"],
  ["warning", "--warning"],
  ["warningForeground", "--warning-foreground"],
  ["warningSurface", "--warning-surface"],
  ["update", "--update"],
  ["updateForeground", "--update-foreground"],
  ["accentSurface", "--accent"],
  ["accentSurfaceForeground", "--accent-foreground"],
  ["messageSurface", "--message-surface"],
  ["messageForeground", "--message-foreground"],
  ["messageAction", "--message-action"],
  ["messageActionForeground", "--message-action-foreground"],
  ["messageActionHover", "--message-action-hover"],
  ["codeBackground", "--code-background"],
  ["codeForeground", "--code-foreground"],
  ["sidebar", "--sidebar"],
  ["sidebarForeground", "--sidebar-foreground"],
  ["sidebarMutedForeground", "--sidebar-muted-foreground"],
  ["sidebarControlSurface", "--sidebar-control-surface"],
  ["sidebarRowHover", "--sidebar-row-hover"],
  ["sidebarRowActive", "--sidebar-row-active"],
  ["sidebarRowSelected", "--sidebar-row-selected"],
  ["sidebarBorder", "--sidebar-border"],
  ["terminalBackground", "--terminal-background"],
  ["terminalForeground", "--terminal-foreground"],
  ["terminalCursor", "--terminal-cursor"],
  ["terminalSelection", "--terminal-selection-background"],
];

function expectPainted(
  expectedColor: string,
  variable: string,
  canvas: readonly number[],
  label: string,
) {
  const expected = toRgb(expectedColor)!;
  const alpha = expected.alpha ?? 1;
  const painted = paintedChannels(variable, canvas);
  [expected.r, expected.g, expected.b].forEach((channel, index) => {
    const flattened = (channel * alpha + (canvas[index]! / 255) * (1 - alpha)) * 255;
    expect(Math.abs(flattened - painted[index]!), label).toBeLessThan(1.5);
  });
}

describe("standard painted theme colors", () => {
  it("match every role default-palette.css paints with no theme", () => {
    const root = document.documentElement;
    try {
      for (const appearance of ["light", "dark"] as const) {
        root.classList.toggle("dark", appearance === "dark");
        const colors = getSedulaThemeColors(appearance);
        const canvas = paintedChannels("--background");
        for (const [role, variable] of STOCK_ROLE_TOKENS) {
          expectPainted(colors[role], variable, canvas, `${appearance} ${role}`);
        }
      }
    } finally {
      root.classList.remove("dark");
    }
  });

  it("match the chip surfaces index.css paints", () => {
    const root = document.documentElement;
    try {
      for (const appearance of ["light", "dark"] as const) {
        root.classList.toggle("dark", appearance === "dark");
        const colors = getStandardPaintedThemeColors(appearance);
        const canvas = paintedChannels("--background");
        for (const [variable, role] of [
          ["--background", "canvas"],
          ["--card", "surface"],
          ["--surface-raised", "surfaceRaised"],
          ["--message-surface", "messageSurface"],
        ] as const) {
          expectPainted(colors[role], variable, canvas, `${appearance} ${role}`);
        }
      }
    } finally {
      root.classList.remove("dark");
    }
  });
});
