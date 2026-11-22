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

/**
 * How many chips, in order, the row shows. All of them when they fit; otherwise as many as fit
 * beside the "⋯" chip that holds the rest.
 */
export function fitChips(
  widths: ReadonlyArray<number>,
  moreWidth: number,
  available: number,
  gap: number,
): number {
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
  if (total <= available) return widths.length;
  let used = moreWidth;
  let fit = 0;
  for (const width of widths) {
    if (used + gap + width > available) break;
    used += gap + width;
    fit += 1;
  }
  return fit;
}
