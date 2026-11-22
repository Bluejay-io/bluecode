import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { getLocalStorageItem } from "~/hooks/useLocalStorage";
import { requestWorkspaceContentFocus } from "~/lib/workspaceFocus";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";

import { PANEL_LAYOUT_STORAGE_KEY } from "./panelView";

function isFullWidth(): boolean {
  try {
    return getLocalStorageItem(PANEL_LAYOUT_STORAGE_KEY, Schema.Boolean) === false;
  } catch {
    return false;
  }
}

/**
 * Full width with a panel tab in front, brings the thread's chat tab back, as clicking the open
 * thread in the sidebar does. Split view already shows the chat, so it changes nothing there.
 */
export function returnToChatTab(ref: ScopedThreadRef): void {
  const store = useRightPanelStore.getState();
  const panel = selectThreadRightPanelState(store.byThreadKey, ref);
  if (!panel.isOpen || panel.surfaces.length === 0 || !isFullWidth()) return;
  store.showChatTab(ref);
  requestWorkspaceContentFocus();
}
