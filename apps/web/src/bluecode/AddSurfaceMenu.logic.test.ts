import { describe, expect, it } from "vite-plus/test";

import { panelToggleOpensMenu } from "./AddSurfaceMenu.logic";

describe("panelToggleOpensMenu", () => {
  it.each([
    [{ hasTabs: false }, true],
    [{ hasTabs: true }, false],
  ])("%o opens the menu: %s", (state, expected) => {
    expect(panelToggleOpensMenu(state)).toBe(expected);
  });
});
