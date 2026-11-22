import { selectableProviderOptionChoices } from "@t3tools/client-runtime/model-traits";
import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { useGT, useMessages } from "gt-react";
import { ChevronDownIcon, EllipsisIcon, WorkflowIcon } from "lucide-react";
import {
  type ReactNode,
  use,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  columnControls,
  splitSpeed,
  type TraitsSelection,
} from "../components/chat/ComposerModelEffort";
import { composerFloatingLayerProps } from "../components/chat/composerEventScope";
import { EffortGlyph, FastBolt, resolveEffortGlyph } from "../components/chat/EffortGlyph";
import { DockedPickerContext } from "../components/chat/ProviderModelPicker";
import { observeResize } from "../lib/observeResize";
import {
  ULTRATHINK_IN_BODY_NOTE,
  type TraitsSelectionInput,
  useTraitsSelection,
} from "../components/chat/TraitsPicker";
import {
  Menu,
  MenuCheckboxItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../components/ui/menu";
import { fastTierSwitch, fitChips } from "./modelCard.logic";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

/** One of the selected model's settings, as a chip under the list. */
type Chip =
  | {
      kind: "toggle";
      id: string;
      name: string;
      icon: ReactNode;
      pressed: boolean;
      onPressedChange: (next: boolean) => void;
    }
  | {
      kind: "choice";
      id: string;
      name: string;
      /** Effort names itself by its value; other choices print their name before it. */
      nameOnChip: boolean;
      icon: ReactNode;
      descriptor: SelectDescriptor;
      value: string;
      valueLabel: string;
      disabled: boolean;
    };

const takesInput = (chip: Chip) => chip.kind === "toggle" || !chip.disabled;

const CHIP_GAP = 5;
const CHIP =
  "inline-flex h-6.5 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-(--border-1) bg-foreground/[0.04] px-2 text-foreground text-xs outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-popup-open:bg-foreground/[0.08] disabled:cursor-not-allowed disabled:opacity-64 aria-pressed:border-primary/40 aria-pressed:bg-primary/14 aria-pressed:text-(--model-card-accent)";

function buildChips(traits: TraitsSelection, provider: string, gt: ReturnType<typeof useGT>) {
  const { effort, others } = columnControls(traits.selectDescriptors, traits.booleanDescriptors);
  const { speedSelect, fastToggle, ultracodeToggle } = splitSpeed(
    traits.selectDescriptors,
    traits.booleanDescriptors,
  );
  const toggle = (
    descriptor: Extract<ProviderOptionDescriptor, { type: "boolean" }>,
    icon: ReactNode = null,
  ): Chip => ({
    kind: "toggle",
    id: descriptor.id,
    name: descriptor.label,
    icon,
    pressed: descriptor.currentValue === true,
    onPressedChange: (next) => traits.changeBoolean(descriptor.id, next),
  });
  const choice = (
    descriptor: SelectDescriptor,
    extra: { name?: string; nameOnChip?: boolean; icon?: ReactNode; disabled?: boolean } = {},
  ): Chip => {
    const value = traits.selectValue(descriptor);
    return {
      kind: "choice",
      id: descriptor.id,
      name: extra.name ?? descriptor.label,
      nameOnChip: extra.nameOnChip ?? true,
      icon: extra.icon ?? null,
      descriptor,
      value,
      valueLabel:
        descriptor.options.find((option) => option.id === value)?.label ??
        traits.currentLabel(descriptor) ??
        "",
      disabled: extra.disabled ?? false,
    };
  };
  const chips: Chip[] = [];
  // Ultrathink in the prompt locks the levels.
  const locked =
    effort?.descriptor.id === traits.primarySelectDescriptor?.id && traits.ultrathinkInBodyText;
  if (effort?.kind === "select") {
    const glyph = resolveEffortGlyph(effort.descriptor, traits.selectValue(effort.descriptor));
    chips.push(
      choice(effort.descriptor, {
        name: gt("Reasoning effort"),
        nameOnChip: false,
        icon: glyph ? <EffortGlyph count={glyph.count} filled={glyph.filled} size="xs" /> : null,
        disabled: locked,
      }),
    );
  } else if (effort) {
    chips.push(toggle(effort.descriptor));
  }
  const bolt = <FastBolt ultra={false} />;
  if (fastToggle) chips.push(toggle(fastToggle, bolt));
  const tierSwitch = fastToggle ? null : fastTierSwitch(provider, speedSelect);
  if (speedSelect && tierSwitch) {
    chips.push({
      kind: "toggle",
      id: speedSelect.id,
      name: gt("Fast mode"),
      icon: bolt,
      pressed: traits.selectValue(speedSelect) === tierSwitch.on.id,
      onPressedChange: (next) =>
        traits.changeSelect(speedSelect, next ? tierSwitch.on.id : tierSwitch.off.id),
    });
  } else if (speedSelect) {
    chips.push(choice(speedSelect, { icon: bolt }));
  }
  if (ultracodeToggle) {
    chips.push(toggle(ultracodeToggle, <WorkflowIcon aria-hidden="true" className="size-3" />));
  }
  for (const control of others) {
    chips.push(
      control.kind === "boolean" ? toggle(control.descriptor) : choice(control.descriptor),
    );
  }
  // A choice whose values are all spoken for by the prompt has nothing to pick.
  const settable = chips.filter(
    (chip) => chip.kind === "toggle" || selectableProviderOptionChoices(chip.descriptor).length > 0,
  );
  return { chips: settable, locked };
}

/** What a chip shows; the measuring row draws the same faces to decide which chips fit. */
function ChipFace(props: { chip: Chip }) {
  const { chip } = props;
  return (
    <>
      {chip.icon ? (
        <span className="flex shrink-0 items-center text-muted-foreground in-aria-pressed:text-current">
          {chip.icon}
        </span>
      ) : null}
      {chip.kind === "toggle" ? (
        <span>{chip.name}</span>
      ) : (
        <>
          {chip.nameOnChip ? <span className="text-muted-foreground">{chip.name}</span> : null}
          <span>{chip.valueLabel}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3 text-muted-foreground" />
        </>
      )}
    </>
  );
}

/** A choice's values, checked at the current one. */
function ChoiceItems(props: { chip: Extract<Chip, { kind: "choice" }>; traits: TraitsSelection }) {
  const gt = useGT();
  const { chip, traits } = props;
  return (
    <MenuRadioGroup
      aria-label={chip.name}
      value={chip.value}
      onValueChange={(next: string) => {
        if (next !== chip.value) traits.changeSelect(chip.descriptor, next);
      }}
    >
      {selectableProviderOptionChoices(chip.descriptor).map((option) => (
        <MenuRadioItem key={option.id} value={option.id} closeOnClick>
          <span className="flex items-center gap-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{option.label}</span>
              {option.description ? (
                <span className="line-clamp-2 text-muted-foreground text-xs">
                  {option.description}
                </span>
              ) : null}
            </span>
            {option.isDefault ? (
              <span className="text-muted-foreground/70 text-xs">
                {gt("Default", { $context: "marks the default option" })}
              </span>
            ) : null}
          </span>
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  );
}

/** The chip menus share the picker's dense glass and count as the composer's floating layer. */
const CHIP_MENU = { "data-dense-glass": true, ...composerFloatingLayerProps } as const;

/** The "⋯" chip's index in ChipOwner. */
const MORE = -1;

/** Marks a chip's trigger and menus, so focus can follow the chip when it moves behind "⋯". */
type ChipOwner = { "data-chip-row": string; "data-chip-index": number };

/** The chip (or "⋯") that holds focus in its trigger or one of its menus, if it is in this row. */
function focusedChipIndex(rowKey: string): number | null {
  const owner = document.activeElement?.closest<HTMLElement>("[data-chip-row]");
  return owner?.dataset.chipRow === rowKey ? Number(owner.dataset.chipIndex) : null;
}

/** A menu opened from the keyboard lands on the checked value, not the first. */
function focusChecked(popup: HTMLElement | null) {
  const checked = popup?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]');
  checked?.focus({ preventScroll: true });
  checked?.scrollIntoView({ block: "nearest" });
}

function ChipControl({
  focusTarget,
  owner,
  ...props
}: {
  chip: Chip;
  traits: TraitsSelection;
  focusTarget: ((node: HTMLElement | null) => void) | undefined;
  owner: ChipOwner;
}) {
  const { chip } = props;
  const popupRef = useRef<HTMLDivElement>(null);
  if (chip.kind === "toggle") {
    return (
      <button
        ref={focusTarget}
        {...owner}
        type="button"
        aria-pressed={chip.pressed}
        className={CHIP}
        onClick={() => chip.onPressedChange(!chip.pressed)}
      >
        <ChipFace chip={chip} />
      </button>
    );
  }
  return (
    <Menu
      // A modal menu would cover the picker, so the next click there would only close it.
      modal={false}
      onOpenChangeComplete={(open) => {
        if (open) focusChecked(popupRef.current);
      }}
    >
      <MenuTrigger
        render={
          <button
            ref={focusTarget}
            {...owner}
            type="button"
            aria-label={`${chip.name}: ${chip.valueLabel}`}
            disabled={chip.disabled}
            className={CHIP}
          />
        }
      >
        <ChipFace chip={chip} />
      </MenuTrigger>
      <MenuPopup ref={popupRef} side="top" align="start" sideOffset={6} {...CHIP_MENU} {...owner}>
        <ChoiceItems chip={chip} traits={props.traits} />
      </MenuPopup>
    </Menu>
  );
}

/** Chips that do not fit the row, as label and value rows, like a settings list. */
function MoreChips({
  focusTarget,
  owner,
  ...props
}: {
  chips: ReadonlyArray<Chip>;
  traits: TraitsSelection;
  focusTarget: (node: HTMLElement | null) => void;
  owner: ChipOwner;
}) {
  const gt = useGT();
  return (
    <Menu modal={false}>
      <MenuTrigger
        render={
          <button
            ref={focusTarget}
            {...owner}
            type="button"
            aria-label={gt("More options")}
            className={CHIP}
          />
        }
      >
        <EllipsisIcon aria-hidden="true" className="size-3.5" />
      </MenuTrigger>
      <MenuPopup side="top" align="end" sideOffset={6} {...CHIP_MENU} {...owner}>
        {props.chips.map((chip) =>
          chip.kind === "toggle" ? (
            <MenuCheckboxItem
              key={chip.id}
              variant="switch"
              checked={chip.pressed}
              onCheckedChange={chip.onPressedChange}
            >
              {chip.name}
            </MenuCheckboxItem>
          ) : (
            <MenuSub key={chip.id}>
              <MenuSubTrigger disabled={chip.disabled}>
                <span className="min-w-0 flex-1 truncate">{chip.name}</span>
                <span className="max-w-1/2 shrink-0 truncate text-muted-foreground text-xs">
                  {chip.valueLabel}
                </span>
              </MenuSubTrigger>
              <MenuSubPopup {...CHIP_MENU} {...owner}>
                <ChoiceItems chip={chip} traits={props.traits} />
              </MenuSubPopup>
            </MenuSub>
          ),
        )}
      </MenuPopup>
    </Menu>
  );
}

/** How many chips fit the row, from the hidden copy whose last child is the "⋯" chip. */
function measureFit(row: HTMLElement | null, measure: HTMLElement | null) {
  if (!row || !measure) return null;
  const widths = Array.from(measure.children, (child) => child.getBoundingClientRect().width);
  const more = widths.pop() ?? 0;
  return fitChips(widths, more, row.clientWidth, CHIP_GAP);
}

/**
 * The chips in one row. A hidden copy measures them; those that do not fit move behind a "⋯"
 * chip, so the row never wraps or truncates a chip.
 */
function ChipRow(props: { chips: ReadonlyArray<Chip>; traits: TraitsSelection }) {
  const picker = use(DockedPickerContext);
  const rowKey = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLElement | null>(null);
  const [fit, setFit] = useState(props.chips.length);
  // The chip (or MORE) to focus once a new fit has rendered, when the focused one left the row.
  const refocus = useRef<number | null>(null);
  const applyFit = (next: number | null) => {
    if (next === null || next === fit) return;
    const focused = focusedChipIndex(rowKey);
    if (focused !== null && focused !== MORE && focused >= next) refocus.current = MORE;
    // "⋯" goes once every chip fits: focus the first chip that was behind it and takes input.
    if (focused === MORE && next === (measureRef.current?.childElementCount ?? 0) - 1) {
      const restored = props.chips.findIndex((chip, index) => index >= fit && takesInput(chip));
      const target = restored === -1 ? props.chips.findIndex(takesInput) : restored;
      refocus.current = target === -1 ? null : target;
    }
    setFit(next);
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the chips' rendered widths, which change with every value, before paint
  useLayoutEffect(() => {
    const target = refocus.current;
    refocus.current = null;
    // Only when focus fell to the body with the chip it was on, not when it moved on.
    if (target !== null && document.activeElement === document.body) {
      const node = target === MORE ? moreRef.current : rowRef.current?.children.item(target);
      if (node instanceof HTMLElement) node.focus({ preventScroll: true });
    }
    applyFit(measureFit(rowRef.current, measureRef.current));
  });
  const onResize = useEffectEvent(() => applyFit(measureFit(rowRef.current, measureRef.current)));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the row's width, which a phone-width picker changes
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    return observeResize(row, () => onResize());
  }, []);
  const shown = props.chips.slice(0, fit);
  const hidden = props.chips.slice(fit);
  // composer.effort lands on the first chip that takes input: effort, unless ultrathink locks it.
  const effortTarget = shown.findIndex(takesInput);
  return (
    <div ref={rowRef} className="relative flex min-w-0" style={{ gap: CHIP_GAP }}>
      {shown.map((chip, index) => (
        <ChipControl
          key={chip.id}
          chip={chip}
          traits={props.traits}
          focusTarget={index === effortTarget ? picker.effortFocusRef : undefined}
          owner={{ "data-chip-row": rowKey, "data-chip-index": index }}
        />
      ))}
      {hidden.length > 0 ? (
        <MoreChips
          chips={hidden}
          traits={props.traits}
          focusTarget={(node) => {
            moreRef.current = node;
            if (effortTarget === -1) picker.effortFocusRef(node);
          }}
          owner={{ "data-chip-row": rowKey, "data-chip-index": MORE }}
        />
      ) : null}
      <div
        ref={measureRef}
        aria-hidden="true"
        inert
        className="pointer-events-none invisible absolute top-0 left-0 flex w-max"
      >
        {props.chips.map((chip) => (
          <span key={chip.id} className={CHIP}>
            <ChipFace chip={chip} />
          </span>
        ))}
        <span className={CHIP}>
          <EllipsisIcon aria-hidden="true" className="size-3.5" />
        </span>
      </div>
    </div>
  );
}

/** Under a hairline: the model's settings as chips, or the saved values of a model now missing. */
function Settings(props: { children: ReactNode }) {
  return (
    <div data-model-picker-effort className="shrink-0 border-(--border-1) border-t p-2">
      {props.children}
    </div>
  );
}

function TraitsChips(props: { traits: TraitsSelectionInput }) {
  const gt = useGT();
  const messages = useMessages();
  const traits = useTraitsSelection(props.traits);
  if (traits.modelIsUnavailable) {
    const saved = traits.descriptors.flatMap((descriptor) => {
      const value = traits.currentLabel(descriptor);
      return value ? [`${descriptor.label}: ${value}`] : [];
    });
    if (saved.length === 0) return null;
    return (
      <Settings>
        <p className="px-1 text-muted-foreground text-xs">{saved.join(" · ")}</p>
      </Settings>
    );
  }
  const { chips, locked } = buildChips(traits, props.traits.provider, gt);
  if (chips.length === 0) return null;
  return (
    <Settings>
      <ChipRow chips={chips} traits={traits} />
      {locked ? (
        <p className="px-1 pt-1.5 text-muted-foreground text-xs">
          {messages(ULTRATHINK_IN_BODY_NOTE)}
        </p>
      ) : null}
    </Settings>
  );
}

/**
 * BlueCode: the docked picker's foot, under the model list: the selected model's effort and
 * options as one row of chips. A model with neither shows nothing.
 */
export function ModelCard(props: { traits: TraitsSelectionInput | null }) {
  return props.traits ? <TraitsChips traits={props.traits} /> : null;
}
