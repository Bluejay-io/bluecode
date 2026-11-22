import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { fastTierSwitch, fitChips } from "./modelCard.logic";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

const tier = (...ids: ReadonlyArray<string>): SelectDescriptor => ({
  id: "serviceTier",
  label: "Service Tier",
  type: "select",
  options: ids.map((id) => ({ id, label: id === "default" ? "Standard" : id })),
  currentValue: "default",
});

describe("fastTierSwitch", () => {
  it.each([
    { name: "Codex's fast tier", provider: "codex", ids: ["default", "fast"], on: "fast" },
    {
      name: "Codex's priority tier",
      provider: "codex",
      ids: ["default", "priority"],
      on: "priority",
    },
    { name: "three tiers", provider: "codex", ids: ["default", "fast", "flex"], on: null },
    { name: "an unknown pair", provider: "codex", ids: ["default", "flex"], on: null },
    {
      name: "a provider with its own tier ids",
      provider: "pi",
      ids: ["default", "fast"],
      on: null,
    },
  ])("turns $name into a Fast toggle only when both ids are known", ({ provider, ids, on }) => {
    const result = fastTierSwitch(provider, tier(...ids));
    expect(result ? { on: result.on.id, off: result.off.id } : null).toEqual(
      on ? { on, off: "default" } : null,
    );
  });

  it("has nothing to switch without a speed setting", () => {
    expect(fastTierSwitch("codex", null)).toBeNull();
  });
});

describe("fitChips", () => {
  it.each([
    { name: "chips that fit exactly", widths: [100, 100, 90], fit: 3 },
    { name: "one chip too many, beside the more chip", widths: [100, 100, 100], fit: 2 },
    { name: "a chip wider than the row", widths: [400, 60], fit: 0 },
    { name: "no chips", widths: [], fit: 0 },
  ])("shows $fit for $name", ({ widths, fit }) => {
    // 300px of row, 5px gaps, a 26px more chip.
    expect(fitChips(widths, 26, 300, 5)).toBe(fit);
  });
});
