import { describe, expect, it } from "vite-plus/test";

import {
  isPanelShown,
  type PanelState,
  type PanelTransition,
  type PanelView,
  resolvePanelView,
  toggleLayout,
  togglePanel,
} from "./panelView";

const state = (
  hasTabs: boolean,
  isOpen: boolean,
  layout: PanelState["layout"],
  chatTab = false,
): PanelState => ({ hasTabs, isOpen, chatTab, layout });

describe("resolvePanelView", () => {
  it.each<[PanelState, PanelView]>([
    [state(false, false, "split"), "chat"],
    [state(false, true, "split"), "chat"],
    [state(false, false, "full"), "chat"],
    [state(false, true, "full"), "chat"],
    [state(false, false, "full", true), "chat"],
    [state(true, false, "split"), "chat"],
    [state(true, false, "split", true), "chat"],
    [state(true, true, "split"), "split"],
    [state(true, false, "full"), "chat"],
    [state(true, false, "full", true), "full-chat"],
    [state(true, true, "full"), "full-surface"],
  ])("%o is %s", (input, view) => {
    expect(resolvePanelView(input)).toBe(view);
  });
});

describe("panel transitions", () => {
  it.each<[string, (state: PanelState) => PanelTransition, PanelState, PanelView, string]>([
    ["toggle", togglePanel, state(true, false, "split"), "split", "panel"],
    ["toggle", togglePanel, state(true, true, "split"), "chat", "unchanged"],
    ["toggle", togglePanel, state(true, false, "full"), "full-surface", "panel"],
    ["toggle", togglePanel, state(true, true, "full"), "chat", "composer"],
    ["toggle", togglePanel, state(true, false, "full", true), "chat", "composer"],
    ["toggle", togglePanel, state(false, false, "split"), "chat", "unchanged"],
    ["toggle", togglePanel, state(false, false, "full"), "chat", "unchanged"],
    ["layout", toggleLayout, state(true, true, "split"), "full-surface", "unchanged"],
    ["layout", toggleLayout, state(true, true, "full"), "split", "unchanged"],
    ["layout", toggleLayout, state(true, false, "full", true), "split", "unchanged"],
    ["layout", toggleLayout, state(true, false, "split"), "chat", "unchanged"],
    ["layout", toggleLayout, state(true, false, "full"), "chat", "unchanged"],
  ])("%s from %o shows %s, focus %s", (_name, transition, from, view, focus) => {
    const next = transition(from);
    expect(resolvePanelView({ hasTabs: from.hasTabs, ...next })).toBe(view);
    expect(next.focus).toBe(focus);
  });

  it("toggling hides and shows the panel without touching the layout", () => {
    for (const from of [state(true, true, "split"), state(true, true, "full")]) {
      const hidden = togglePanel(from);
      expect(hidden.layout).toBe(from.layout);
      expect(isPanelShown({ hasTabs: true, ...hidden })).toBe(false);
      const back = togglePanel({ hasTabs: true, ...hidden });
      expect(resolvePanelView({ hasTabs: true, ...back })).toBe(resolvePanelView(from));
    }
  });

  it("shows the toggle pressed while the full-width tab row is on screen", () => {
    expect(isPanelShown(state(true, false, "full", true))).toBe(true);
    expect(isPanelShown(state(true, true, "full"))).toBe(true);
    expect(isPanelShown(state(true, false, "full"))).toBe(false);
  });
});
