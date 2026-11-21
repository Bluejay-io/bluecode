import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import { getClientSettings } from "~/hooks/useSettings";
import { useRightPanelStore } from "~/rightPanelStore";

/** The thread whose chat is on screen; `beside` is false where a panel would cover the chat. */
interface ThreadOnScreen {
  readonly threadKey: string;
  readonly beside: boolean;
}

let onScreen: ThreadOnScreen | null = null;

/**
 * Whether an agent revealing a browser tab may open the panel on it: its thread is on screen and,
 * unless the reveal is forced (`open: true`), the setting is on, there is room beside the chat
 * (not a sheet or full width, where the tab-row pill shows the agent instead), and the user has
 * not closed that tab or the panel on it.
 */
export function mayShowAgentBrowser(
  threadRef: ScopedThreadRef,
  tabId: string,
  force = false,
): boolean {
  const threadKey = scopedThreadKey(threadRef);
  if (onScreen?.threadKey !== threadKey) return false;
  if (force) return true;
  if (!getClientSettings().browserAutoShowFloatingPreview || !onScreen.beside) return false;
  const dismissed = useRightPanelStore.getState().byThreadKey[threadKey]?.dismissedDeviceSurfaceIds;
  return !dismissed?.includes(`browser:${tabId}`);
}

/** Marks the thread the user is reading, for agent reveals that arrive outside React. */
export function useAgentBrowserScreen(threadRef: ScopedThreadRef | null, beside: boolean): void {
  const threadKey = threadRef === null ? null : scopedThreadKey(threadRef);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- BlueCode: agent reveals are handled outside React and need the thread on screen.
  useEffect(() => {
    if (threadKey === null) return;
    const entry = { threadKey, beside };
    onScreen = entry;
    return () => {
      if (onScreen === entry) onScreen = null;
    };
  }, [threadKey, beside]);
}

export function setAgentBrowserScreenForTests(next: ThreadOnScreen | null): void {
  onScreen = next;
}
