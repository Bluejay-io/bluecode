import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { removeLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";

import { PANEL_LAYOUT_STORAGE_KEY, resolvePanelView } from "./panelView";
import { returnToChatTab } from "./returnToChatTab";

const ref = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));

describe("returnToChatTab", () => {
  it.each([
    { splitView: false, isOpen: true, before: "full-surface", after: "full-chat" },
    { splitView: false, isOpen: false, before: "chat", after: "chat" },
    { splitView: true, isOpen: true, before: "split", after: "split" },
  ] as const)(
    "split view $splitView, panel open $isOpen: $before → $after",
    ({ splitView, isOpen, before, after }) => {
      useRightPanelStore.setState({
        byThreadKey: {
          [scopedThreadKey(ref)]: {
            isOpen,
            surfaces: [{ id: "diff", kind: "diff" }],
            activeSurfaceId: "diff",
          },
        },
      });
      setLocalStorageItem(PANEL_LAYOUT_STORAGE_KEY, splitView, Schema.Boolean);
      const view = () => {
        const panel = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref);
        return resolvePanelView({
          hasTabs: panel.surfaces.length > 0,
          isOpen: panel.isOpen,
          chatTab: panel.chatTab === true,
          layout: splitView ? "split" : "full",
        });
      };
      try {
        expect(view()).toBe(before);
        returnToChatTab(ref);
        expect(view()).toBe(after);
      } finally {
        removeLocalStorageItem(PANEL_LAYOUT_STORAGE_KEY);
      }
    },
  );
});
