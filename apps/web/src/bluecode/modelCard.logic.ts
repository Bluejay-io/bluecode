import { selectableProviderOptionChoices } from "@t3tools/client-runtime/model-traits";
import type { ProviderOptionDescriptor } from "@t3tools/contracts";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

/** Each provider's two-way service tier: the standard id and the ids that mean Fast. */
const FAST_SERVICE_TIERS: Readonly<
  Record<string, { off: string; on: ReadonlyArray<string> } | undefined>
> = {
  // CodexProvider.ts: "default" is Standard; older catalogs call Fast "fast", newer "priority".
  codex: { off: "default", on: ["fast", "priority"] },
};

/**
 * A two-way speed setting as the card's Fast toggle. Speeds with more tiers, or from a provider
 * whose tier ids are not known here, keep the segmented control under More options.
 */
export function fastTierSwitch(provider: string, speedSelect: SelectDescriptor | null) {
  const tiers = FAST_SERVICE_TIERS[provider];
  if (!speedSelect || !tiers) return null;
  const choices = selectableProviderOptionChoices(speedSelect);
  if (choices.length !== 2) return null;
  const off = choices.find((choice) => choice.id === tiers.off);
  const on = choices.find((choice) => tiers.on.includes(choice.id));
  return on && off ? { on, off } : null;
}

/** What an option is set to, so a pick can be told from the model's default. */
export function optionValue(descriptor: ProviderOptionDescriptor) {
  return descriptor.type === "boolean"
    ? descriptor.currentValue === true
    : (descriptor.currentValue ?? descriptor.options.find((option) => option.isDefault)?.id);
}

/**
 * Reset hides for a model with no options, and is disabled until an option differs from the
 * model's own value. `defaults` are the descriptors with no pick applied.
 */
export function resetState(
  current: ReadonlyArray<ProviderOptionDescriptor>,
  defaults: ReadonlyArray<ProviderOptionDescriptor>,
): "hidden" | "unchanged" | "changed" {
  if (current.length === 0) return "hidden";
  const changed = current.some((descriptor) => {
    const fallback = defaults.find((candidate) => candidate.id === descriptor.id);
    return fallback !== undefined && optionValue(fallback) !== optionValue(descriptor);
  });
  return changed ? "changed" : "unchanged";
}

/** The level a key moves the effort slider to, or null when the key is not the slider's. */
export function effortKeyStep(key: string, index: number, last: number): number | null {
  const clamp = (next: number) => Math.min(Math.max(next, 0), last);
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clamp(index + 1);
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(index - 1);
    case "PageUp":
      return clamp(index + 2);
    case "PageDown":
      return clamp(index - 2);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}
