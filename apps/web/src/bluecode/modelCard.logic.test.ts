import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { effortKeyStep, fastTierSwitch, optionValue, resetState } from "./modelCard.logic";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

const tier = (...ids: ReadonlyArray<string>): SelectDescriptor => ({
  id: "serviceTier",
  label: "Service Tier",
  type: "select",
  options: ids.map((id) => ({ id, label: id === "default" ? "Standard" : id })),
  currentValue: "default",
});

const reasoning = (currentValue?: string): SelectDescriptor => ({
  id: "reasoningEffort",
  label: "Reasoning",
  type: "select",
  options: [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium", isDefault: true },
  ],
  ...(currentValue ? { currentValue } : {}),
});

const toggle = (currentValue?: boolean): ProviderOptionDescriptor => ({
  id: "fastMode",
  label: "Fast mode",
  type: "boolean",
  ...(currentValue === undefined ? {} : { currentValue }),
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

describe("optionValue", () => {
  it.each([
    { name: "a picked level", descriptor: reasoning("low"), value: "low" },
    { name: "an unset select's default", descriptor: reasoning(), value: "medium" },
    { name: "an unset switch", descriptor: toggle(), value: false },
    { name: "a switch turned on", descriptor: toggle(true), value: true },
  ])("reads $name", ({ descriptor, value }) => {
    expect(optionValue(descriptor)).toBe(value);
  });
});

describe("resetState", () => {
  it.each([
    { name: "no options", current: [], defaults: [], state: "hidden" },
    {
      name: "the model's own values",
      current: [reasoning("medium"), toggle(false)],
      defaults: [reasoning(), toggle()],
      state: "unchanged",
    },
    {
      name: "a picked level",
      current: [reasoning("low"), toggle(false)],
      defaults: [reasoning(), toggle()],
      state: "changed",
    },
    {
      name: "a switch turned on",
      current: [reasoning("medium"), toggle(true)],
      defaults: [reasoning(), toggle()],
      state: "changed",
    },
    {
      name: "an option the model no longer has",
      current: [toggle(true)],
      defaults: [reasoning()],
      state: "unchanged",
    },
  ])("is $state for $name", ({ current, defaults, state }) => {
    expect(resetState(current, defaults)).toBe(state);
  });
});

describe("effortKeyStep", () => {
  it.each([
    { key: "ArrowRight", index: 1, next: 2 },
    { key: "ArrowUp", index: 1, next: 2 },
    { key: "ArrowLeft", index: 1, next: 0 },
    { key: "ArrowDown", index: 0, next: 0 },
    { key: "ArrowRight", index: 4, next: 4 },
    { key: "PageUp", index: 1, next: 3 },
    { key: "PageUp", index: 3, next: 4 },
    { key: "PageDown", index: 3, next: 1 },
    { key: "PageDown", index: 1, next: 0 },
    { key: "Home", index: 3, next: 0 },
    { key: "End", index: 1, next: 4 },
    { key: "Enter", index: 1, next: null },
  ])("moves $key from level $index to $next of five", ({ key, index, next }) => {
    expect(effortKeyStep(key, index, 4)).toBe(next);
  });
});
