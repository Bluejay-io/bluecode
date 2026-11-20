/* oxlint-disable t3code/no-untranslated-copy -- theme names are proper nouns, like the shared built-ins */
import "culori/css";
import { converter, formatCss, parse } from "culori/fn";
import type { ThemeAppearance, ThemeColors } from "@t3tools/shared/themePalettes";

// BlueCode's built-in themes, ported from Capy. Each mode is a few anchor colors; the rest
// follows Capy's mixing rules so every theme keeps the same surface and text hierarchy.
type CapyAnchors = Readonly<{
  bg: string;
  fg: string;
  primary: string;
  primaryText: string;
  panel?: string;
  card?: string;
  cardHover?: string;
  popover?: string;
  muted?: string;
  mutedForeground1?: string;
  mutedForeground2?: string;
  mutedForeground3?: string;
  iconMuted?: string;
  textLink?: string;
  /** Everforest's light mode reads its first text step a little stronger. */
  mutedForeground1Weight?: number;
}>;

export type CapyThemeSpec = Readonly<{
  id: string;
  label: string;
  light: CapyAnchors;
  dark: CapyAnchors;
}>;

export const CAPY_THEME_SPECS: ReadonlyArray<CapyThemeSpec> = [
  {
    id: "absolutely",
    label: "Absolutely",
    light: { bg: "#f3f3f1", fg: "#2d2d2b", primary: "#c65b3a", primaryText: "#ffffff" },
    dark: { bg: "#252523", fg: "#f9f9f7", primary: "#e07a5f", primaryText: "#ffffff" },
  },
  {
    id: "bearded-oled",
    label: "Bearded OLED",
    light: { bg: "#efeff0", fg: "#1b1b1d", primary: "#688eff", primaryText: "#000000" },
    dark: {
      bg: "#000000",
      fg: "#b3b3b3",
      primary: "#688eff",
      primaryText: "#000000",
      panel: "#060606",
      card: "#0d0d0d",
      cardHover: "#121212",
      popover: "#151515",
      muted: "#373737",
    },
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    light: {
      bg: "#eff1f5",
      fg: "#4c4f69",
      primary: "#8839ef",
      primaryText: "#ffffff",
      mutedForeground1: "#5c5f77",
      mutedForeground2: "#6c6f85",
      mutedForeground3: "#8c8fa1",
      iconMuted: "#8c8fa1",
    },
    dark: {
      bg: "#11111b",
      fg: "#cdd6f4",
      primary: "#cba6f7",
      primaryText: "#1e1e2e",
      panel: "#181825",
      card: "#1e1e2e",
      cardHover: "#252536",
      popover: "#313244",
      muted: "#45475a",
      mutedForeground1: "#bac2de",
      mutedForeground2: "#a6adc8",
      mutedForeground3: "#7f849c",
      iconMuted: "#7f849c",
    },
  },
  {
    id: "codex",
    label: "Codex",
    light: { bg: "#f3f3f3", fg: "#0d0d0d", primary: "#0169cc", primaryText: "#ffffff" },
    dark: { bg: "#111111", fg: "#fcfcfc", primary: "#0169cc", primaryText: "#ffffff" },
  },
  {
    id: "crimson-evernight",
    label: "Crimson Evernight",
    light: { bg: "#f4ebed", fg: "#2a1e22", primary: "#aa194f", primaryText: "#fff7f8" },
    dark: {
      bg: "#000000",
      fg: "#ede3e6",
      primary: "#e27284",
      primaryText: "#270c11",
      panel: "#0c0709",
      card: "#170d12",
      cardHover: "#1e1318",
      popover: "#24161d",
      muted: "#442f38",
      mutedForeground1: "#a2989c",
      mutedForeground2: "#7b7074",
      mutedForeground3: "#5a5154",
      iconMuted: "#5f5659",
    },
  },
  {
    id: "everforest",
    label: "Everforest",
    light: {
      bg: "#f4f0d9",
      fg: "#5c6a72",
      primary: "#8da101",
      primaryText: "#101412",
      mutedForeground1Weight: 0.7,
    },
    dark: { bg: "#252c30", fg: "#d3c6aa", primary: "#a7c080", primaryText: "#2d353b" },
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    light: { bg: "#f9f9f9", fg: "#262626", primary: "#fa5d19", primaryText: "#f9f9f9" },
    dark: { bg: "#161616", fg: "#f9f9f9", primary: "#fa5d19", primaryText: "#f9f9f9" },
  },
  {
    id: "github",
    label: "GitHub",
    light: { bg: "#f6f8fa", fg: "#1f2328", primary: "#0969da", primaryText: "#ffffff" },
    dark: { bg: "#0d1117", fg: "#e6edf3", primary: "#58a6ff", primaryText: "#0d1117" },
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    light: { bg: "#f2e5bc", fg: "#3c3836", primary: "#458588", primaryText: "#080808" },
    dark: {
      bg: "#282828",
      fg: "#ebdbb2",
      primary: "#458588",
      primaryText: "#080808",
      panel: "#302e2e",
      card: "#32302f",
      cardHover: "#393634",
      popover: "#3c3836",
      muted: "#504945",
      mutedForeground1: "#d5c4a1",
      mutedForeground2: "#bdae93",
      mutedForeground3: "#a89984",
      iconMuted: "#a89984",
      textLink: "#83a598",
    },
  },
  {
    id: "hub",
    label: "Hub",
    light: { bg: "#efeff0", fg: "#1b1b1d", primary: "#d97b00", primaryText: "#170d00" },
    dark: {
      bg: "#000000",
      fg: "#ffffff",
      primary: "#ff9000",
      primaryText: "#000000",
    },
  },
  {
    id: "linear",
    label: "Linear",
    light: { bg: "#f2f4f8", fg: "#2a3140", primary: "#5e6ad2", primaryText: "#ffffff" },
    dark: { bg: "#080a0f", fg: "#e6e9ef", primary: "#606acc", primaryText: "#ffffff" },
  },
  {
    id: "notion",
    label: "Notion",
    light: { bg: "#f7f6f3", fg: "#37352f", primary: "#3183d8", primaryText: "#ffffff" },
    dark: { bg: "#151515", fg: "#d9d9d8", primary: "#3183d8", primaryText: "#ffffff" },
  },
  {
    id: "one",
    label: "One",
    light: { bg: "#eaeaeb", fg: "#383a42", primary: "#5871ef", primaryText: "#ffffff" },
    dark: { bg: "#21252b", fg: "#abb2bf", primary: "#70757f", primaryText: "#ffffff" },
  },
];

const toOklab = converter("oklab");
const toRgb = converter("rgb");

function oklabOf(value: string) {
  const color = toOklab(parse(value));
  if (!color) throw new Error(`Invalid theme color: ${value}`);
  return color;
}

/** CSS `color-mix(in oklab, first weight, second)`. Kept unquantized: hex rounds near-black steps away. */
function mix(first: string, second: string, weight: number): string {
  const a = oklabOf(first);
  const b = oklabOf(second);
  return formatCss({
    mode: "oklab",
    l: a.l * weight + b.l * (1 - weight),
    a: a.a * weight + b.a * (1 - weight),
    b: a.b * weight + b.b * (1 - weight),
  });
}

/** `color` at `alpha` painted over an opaque `backdrop`, as the browser composites it. */
function over(color: string, alpha: number, backdrop: string): string {
  const top = toRgb(parse(color));
  const base = toRgb(parse(backdrop));
  if (!top || !base) throw new Error(`Invalid theme color: ${color} over ${backdrop}`);
  return formatCss({
    mode: "rgb",
    r: top.r * alpha + base.r * (1 - alpha),
    g: top.g * alpha + base.g * (1 - alpha),
    b: top.b * alpha + base.b * (1 - alpha),
  });
}

/** Expands one mode's anchors into every app color role; `base` supplies status and search colors. */
export function capyThemeColors(
  anchors: CapyAnchors,
  appearance: ThemeAppearance,
  base: ThemeColors,
): ThemeColors {
  const dark = appearance === "dark";
  const { bg, fg, primary, primaryText } = anchors;
  const ink = dark ? "#ffffff" : "#000000";

  const panel = anchors.panel ?? (dark ? mix("#ffffff", bg, 0.05) : mix("#ffffff", bg, 0.66));
  const card = anchors.card ?? (dark ? mix("#ffffff", bg, 0.07) : mix("#ffffff", bg, 0.9));
  const cardHover = anchors.cardHover ?? (dark ? mix("#ffffff", bg, 0.1) : panel);
  const popover = anchors.popover ?? (dark ? mix("#ffffff", bg, 0.11) : card);
  const textStep = (darkWeight: number, lightWeight: number) =>
    mix(fg, bg, dark ? darkWeight : lightWeight);
  const mutedForeground1 =
    anchors.mutedForeground1 ??
    (anchors.mutedForeground1Weight
      ? mix(fg, bg, anchors.mutedForeground1Weight)
      : textStep(0.68, 0.62));
  const mutedForeground2 = anchors.mutedForeground2 ?? textStep(0.52, 0.48);
  const iconMuted = anchors.iconMuted ?? textStep(0.4, 0.42);
  const border = over(ink, 0.08, panel);
  const input = over(ink, dark ? 0.12 : 0.11, panel);
  const secondary = over(ink, dark ? 0.08 : 0.05, panel);
  const hover = over(ink, dark ? 0.065 : 0.04, panel);
  const section = over(ink, dark ? 0.035 : 0.04, panel);

  return {
    ...base,
    canvas: panel,
    chrome: panel,
    toolbar: panel,
    toolbarForeground: fg,
    toolbarBorder: border,
    toolbarControl: card,
    toolbarControlForeground: fg,
    toolbarControlHover: cardHover,
    surface: card,
    surfaceRaised: cardHover,
    surfaceOverlay: popover,
    text: fg,
    textMuted: mutedForeground1,
    border,
    input,
    focus: primary,
    accent: primary,
    accentForeground: primaryText,
    secondary,
    secondaryForeground: fg,
    muted: section,
    mutedForeground: mutedForeground1,
    placeholder: mutedForeground2,
    secondaryLabel: mutedForeground2,
    iconMuted,
    update: anchors.textLink ?? primary,
    accentSurface: hover,
    accentSurfaceForeground: fg,
    messageSurface: secondary,
    messageForeground: fg,
    messageAction: primary,
    messageActionForeground: primaryText,
    messageActionHover: mix(primary, ink, 0.9),
    // Capy sets code on the panel itself, framed only by its hairline.
    codeBackground: panel,
    codeForeground: fg,
    // Capy paints the sidebar and the frame around the content panel with the page color.
    sidebar: bg,
    sidebarForeground: fg,
    sidebarMutedForeground: mutedForeground1,
    sidebarControlSurface: over(ink, dark ? 0.035 : 0.04, bg),
    sidebarRowHover: over(ink, dark ? 0.05 : 0.035, bg),
    sidebarRowActive: card,
    sidebarRowSelected: card,
    sidebarBorder: over(ink, 0.08, bg),
    terminalBackground: panel,
    terminalForeground: fg,
    terminalCursor: primary,
    terminalSelection: mix(primary, panel, dark ? 0.3 : 0.22),
  };
}
