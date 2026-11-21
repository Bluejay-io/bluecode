/**
 * BlueCode: what the workspace shows, from three facts. `isOpen` means a panel tab is on screen;
 * `chatTab` means, at full width, the panel's tab row is on screen with its chat tab selected;
 * the layout puts the panel beside the chat ("split") or over it ("full"). Only the layout
 * control changes the layout.
 */
export type PanelLayout = "split" | "full";

/** The layout preference: a JSON boolean, true for split. */
export const PANEL_LAYOUT_STORAGE_KEY = "t3code:bluecode-split-view";

export type PanelView = "chat" | "split" | "full-chat" | "full-surface";

/** Where focus goes after a transition; "panel" also comes from the store's user-action open. */
export type PanelFocus = "panel" | "composer" | "unchanged";

export interface PanelState {
  readonly hasTabs: boolean;
  readonly isOpen: boolean;
  readonly chatTab: boolean;
  readonly layout: PanelLayout;
}

export interface PanelTransition {
  readonly isOpen: boolean;
  readonly chatTab: boolean;
  readonly layout: PanelLayout;
  readonly focus: PanelFocus;
}

export function resolvePanelView({ hasTabs, isOpen, chatTab, layout }: PanelState): PanelView {
  if (!hasTabs) return "chat";
  if (layout === "split") return isOpen ? "split" : "chat";
  if (isOpen) return "full-surface";
  return chatTab ? "full-chat" : "chat";
}

/** Whether the panel, or at full width its tab row, is on screen; the toggle shows it pressed. */
export function isPanelShown(state: PanelState): boolean {
  return resolvePanelView(state) !== "chat";
}

/** The panel toggle and its shortcut hide or show the whole panel. With no tabs saved it does nothing yet. */
export function togglePanel(state: PanelState): PanelTransition {
  const { hasTabs, isOpen, chatTab, layout } = state;
  if (!hasTabs) return { isOpen, chatTab, layout, focus: "unchanged" };
  if (!isPanelShown(state)) return { isOpen: true, chatTab: false, layout, focus: "panel" };
  return {
    isOpen: false,
    chatTab: false,
    layout,
    focus: layout === "full" ? "composer" : "unchanged",
  };
}

/**
 * Maximize or minimize, offered only while the panel is shown; minimizing from the chat tab
 * brings the last tab beside the chat.
 */
export function toggleLayout(state: PanelState): PanelTransition {
  const { hasTabs, isOpen, chatTab, layout } = state;
  if (!hasTabs || !isPanelShown(state)) return { isOpen, chatTab, layout, focus: "unchanged" };
  if (layout === "full")
    return { isOpen: true, chatTab: false, layout: "split", focus: "unchanged" };
  return { isOpen, chatTab: false, layout: "full", focus: "unchanged" };
}
