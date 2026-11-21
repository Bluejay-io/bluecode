import type { PanelState } from "./panelView";

/**
 * With no tabs, the panel toggle lists the surfaces instead of opening an empty panel. The store
 * never leaves an empty panel open, so `resolvePanelView` shows the chat whatever `isOpen` says.
 */
export function panelToggleOpensMenu({ hasTabs }: Pick<PanelState, "hasTabs">): boolean {
  return !hasTabs;
}
