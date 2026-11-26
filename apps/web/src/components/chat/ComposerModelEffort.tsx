import {
  buildTraitsTriggerDisplay,
  getDescriptorStringValue,
  isReasoningControl,
  selectableProviderOptionChoices,
} from "@t3tools/client-runtime/model-traits";
import type { ProviderOptionDescriptor, RuntimeMode } from "@t3tools/contracts";
import type { EffortDisplay } from "@t3tools/contracts/settings";
import { getProviderOptionCurrentLabel } from "@t3tools/shared/model";
import { msg, T, useGT, useMessages } from "gt-react";
import { CheckIcon, ChevronRightIcon, WorkflowIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, use, useRef, useState } from "react";

import { m, type MessageResolver } from "~/i18n/messages";
import { cn } from "~/lib/utils";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuTrigger,
} from "../ui/menu";
import { Switch } from "../ui/switch";
import type { ComposerControlSize } from "./ComposerControl";
import type { RuntimeModeOption } from "./ComposerFooterControls";
import { composerFloatingLayerProps } from "./composerEventScope";
import { EffortGlyph, FastBolt, resolveEffortGlyph } from "./EffortGlyph";
import { DockedPickerContext } from "./ProviderModelPicker";
import {
  getTraitsSectionVisibility,
  type TraitsSelectionInput,
  ULTRATHINK_IN_BODY_NOTE,
  useTraitsSelection,
} from "./TraitsPicker";
import { SharedTooltipTrigger } from "../ui/shared-tooltip";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;
type BooleanDescriptor = Extract<ProviderOptionDescriptor, { type: "boolean" }>;

/** Service tiers, Claude's Fast mode, and Ultracode sit in the footer, not the column. */
function splitSpeed(
  selects: ReadonlyArray<SelectDescriptor>,
  toggles: ReadonlyArray<BooleanDescriptor>,
) {
  const speedSelect = selects.find((descriptor) => descriptor.id === "serviceTier") ?? null;
  const fastToggle = toggles.find((descriptor) => descriptor.id === "fastMode") ?? null;
  const ultracodeToggle = toggles.find((descriptor) => descriptor.id === "ultracode") ?? null;
  return {
    speedSelect,
    fastToggle,
    ultracodeToggle,
    columnSelects: selects.filter((descriptor) => descriptor !== speedSelect),
    columnToggles: toggles.filter(
      (descriptor) => descriptor !== fastToggle && descriptor !== ultracodeToggle,
    ),
  };
}

type ColumnControl =
  | { kind: "select"; descriptor: SelectDescriptor }
  | { kind: "boolean"; descriptor: BooleanDescriptor };

/**
 * The column lists the model's reasoning levels under the header that names it. Other options,
 * such as an agent's session mode, sit below as one row each.
 */
function columnControls(
  selects: ReadonlyArray<SelectDescriptor>,
  toggles: ReadonlyArray<BooleanDescriptor>,
) {
  const { columnSelects, columnToggles } = splitSpeed(selects, toggles);
  const controls: ReadonlyArray<ColumnControl> = [
    ...columnSelects.map((descriptor) => ({ kind: "select" as const, descriptor })),
    ...columnToggles.map((descriptor) => ({ kind: "boolean" as const, descriptor })),
  ];
  const effort = controls.find((control) => isReasoningControl(control.descriptor)) ?? null;
  return { effort, others: controls.filter((control) => control !== effort) };
}

/**
 * What the model trigger shows after the model name: the effort word (or bars, per the
 * Appearance setting), a bolt for Fast, a workflow icon for Ultracode, and other traits such as a
 * context window.
 */
export function describeComposerEffort(
  traits: TraitsSelectionInput | null,
  effortDisplay: EffortDisplay,
  size: ComposerControlSize,
  resolve: MessageResolver = m,
): { suffix: ReactNode; detail: string | null } {
  if (!traits) return { suffix: null, detail: null };
  const visibility = getTraitsSectionVisibility({ ...traits, resolve });
  if (!visibility.hasAnyControls) return { suffix: null, detail: null };
  const modelSelection =
    traits.instanceId && traits.model
      ? { instanceId: traits.instanceId, model: traits.model, options: traits.modelOptions ?? [] }
      : null;
  const primary = visibility.primarySelectDescriptor;
  const display = buildTraitsTriggerDisplay(
    {
      descriptors: visibility.descriptors,
      primarySelectDescriptorId: primary?.id ?? null,
      ultrathinkPromptControlled: visibility.ultrathinkPromptControlled,
      modelSelection,
      reportedModelSelection: traits.reportedModelSelection,
    },
    resolve,
  );
  // The same reasoning control the column lists, wherever the agent put it among its options.
  const reasoning =
    columnControls(visibility.selectDescriptors, visibility.booleanDescriptors).effort
      ?.descriptor ?? null;
  const ultrathink = visibility.ultrathinkPromptControlled && reasoning === primary;
  const glyph =
    reasoning?.type === "select"
      ? resolveEffortGlyph(
          reasoning,
          ultrathink
            ? "ultrathink"
            : getDescriptorStringValue(reasoning, modelSelection, traits.reportedModelSelection),
        )
      : null;
  // Workflow levels such as Ultracode always show their name; the setting names every level.
  const word = glyph
    ? (glyph.special ?? (effortDisplay === "label" ? glyph.label : null))
    : !reasoning
      ? null
      : reasoning.type === "boolean"
        ? reasoning.currentValue === true
          ? resolve(msg("{option} On", { option: reasoning.label }))
          : resolve(msg("{option} Off", { option: reasoning.label }))
        : ultrathink
          ? "Ultrathink"
          : (getProviderOptionCurrentLabel(
              reasoning,
              modelSelection,
              traits.reportedModelSelection,
            ) ?? (reasoning.id === "thinking" ? reasoning.label : null));
  const fast = display.speedLabel === "Fast" || display.speedLabel === "Ultrafast";
  // Agent options such as modes live in the picker; the trigger adds only the context window.
  const contextWindow =
    visibility.contextWindowDescriptor &&
    getProviderOptionCurrentLabel(
      visibility.contextWindowDescriptor,
      modelSelection,
      traits.reportedModelSelection,
    );
  if (!word && !glyph && !fast && !display.ultracode && !contextWindow)
    return { suffix: null, detail: display.label };
  return {
    detail: display.label,
    suffix: (
      <span
        className={cn(
          "flex shrink-0 items-center gap-1.5 text-muted-foreground group-hover/model-trigger:text-foreground group-data-pressed/model-trigger:text-foreground group-data-popup-open/model-trigger:text-foreground",
          // A word space after the model name: the regular trigger's gap is wider than one.
          size === "sm" && "-ms-0.5",
        )}
      >
        {word ? (
          <span data-composer-control-label className="max-w-24 truncate">
            {word}
          </span>
        ) : glyph ? (
          <EffortGlyph count={glyph.count} filled={glyph.filled} size={size} />
        ) : null}
        {fast ? <FastBolt ultra={display.speedLabel === "Ultrafast"} /> : null}
        {display.ultracode ? (
          <WorkflowIcon aria-hidden="true" data-composer-control-icon className="size-3" />
        ) : null}
        {contextWindow ? (
          <span
            // A label, so icon-only footers drop it; compacted rows drop it before the model.
            data-composer-control-label
            data-composer-secondary-trait
            className="max-w-24 truncate text-xs"
          >
            {contextWindow}
          </span>
        ) : null}
      </span>
    ),
  };
}

// BlueCode: rows hover with the menus' tone.
const COLUMN_ROW =
  "flex h-7 w-full shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none hover:bg-(--popover-hover) focus-visible:bg-(--popover-hover) disabled:cursor-not-allowed disabled:opacity-64";
const COLUMN_LABEL = "px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs";

function ColumnRow(props: {
  label: string;
  /** Shown on hover; the column is too narrow to print it under the label. */
  description?: string | undefined;
  selected: boolean;
  /** The column's one tab stop: the selected level, else the first when none shows as selected. */
  tabStop: boolean;
  isDefault?: boolean | undefined;
  disabled?: boolean;
  onPick: () => void;
}) {
  const gt = useGT();
  const rowProps = {
    type: "button",
    role: "radio",
    "aria-checked": props.selected,
    disabled: props.disabled,
    "data-effort-row": true,
    // Focus lands on a level after a model pick, and a typed letter finds one by its label.
    "data-effort-level": props.label,
    // Up and Down move between rows.
    tabIndex: props.tabStop ? 0 : -1,
    className: COLUMN_ROW,
    onClick: props.onPick,
  } as const;
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.selected ? (
        <>
          {props.isDefault ? (
            <span className="sr-only">
              {gt("Default", { $context: "marks the default option" })}
            </span>
          ) : null}
          <CheckIcon aria-hidden="true" className="size-3.5" />
        </>
      ) : props.isDefault ? (
        <span className="text-muted-foreground/70 text-xs">
          {gt("Default", { $context: "marks the default option" })}
        </span>
      ) : null}
    </>
  );
  if (!props.description) return <button {...rowProps}>{content}</button>;
  return (
    <SharedTooltipTrigger
      render={<button {...rowProps} />}
      label={props.description}
      side="right"
      className="max-w-56"
    >
      {content}
    </SharedTooltipTrigger>
  );
}

function moveBetweenRows(event: KeyboardEvent<HTMLElement>) {
  const arrow = event.key === "ArrowDown" || event.key === "ArrowUp";
  if (
    !arrow &&
    (event.key.length !== 1 ||
      event.key.trim() === "" ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.nativeEvent.isComposing)
  )
    return;
  // An option's side menu is a React child here, but it moves through its own items.
  if (!event.currentTarget.contains(event.target as Node)) return;
  const rows = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-effort-row]:not(:disabled)"),
  );
  const index = rows.findIndex((row) => row === document.activeElement);
  const next = arrow
    ? rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]
    : [...rows.slice(index + 1), ...rows.slice(0, index + 1)].find((row) =>
        row.dataset.effortLevel?.toLowerCase().startsWith(event.key.toLowerCase()),
      );
  if (!next) return;
  event.preventDefault();
  event.stopPropagation();
  next.focus();
  next.scrollIntoView({ block: "nearest" });
}

function EffortLevels(props: { traits: TraitsSelectionInput }) {
  const traits = useTraitsSelection(props.traits);
  const { effort, others } = columnControls(traits.selectDescriptors, traits.booleanDescriptors);
  if (traits.modelIsUnavailable) {
    return (
      <>
        {traits.descriptors.map((descriptor) => {
          const value = traits.currentLabel(descriptor);
          return value ? (
            <div key={descriptor.id}>
              <div className={COLUMN_LABEL}>{descriptor.label}</div>
              <div className="px-2 pb-1.5 text-muted-foreground/80 text-xs">{value}</div>
            </div>
          ) : null;
        })}
      </>
    );
  }
  if (!effort && others.length === 0) return <NoEffortRow />;
  // Ultrathink in the prompt locks the levels; the first option then holds the tab stop.
  const locked =
    effort?.descriptor.id === traits.primarySelectDescriptor?.id && traits.ultrathinkInBodyText;
  return (
    <>
      {effort ? <EffortRows control={effort} traits={traits} locked={locked} /> : null}
      {others.length > 0 ? (
        <div
          className={cn("flex flex-col gap-0.5", effort && "mt-1 border-t border-border/70 pt-1")}
        >
          {others.map((control, index) =>
            control.kind === "boolean" ? (
              <OptionSwitchRow
                key={control.descriptor.id}
                descriptor={control.descriptor}
                traits={traits}
                tabStop={(!effort || locked) && index === 0}
              />
            ) : (
              <OptionMenuRow
                key={control.descriptor.id}
                descriptor={control.descriptor}
                traits={traits}
                tabStop={(!effort || locked) && index === 0}
              />
            ),
          )}
        </div>
      ) : null}
    </>
  );
}

type TraitsSelection = ReturnType<typeof useTraitsSelection>;

function EffortRows(props: { control: ColumnControl; traits: TraitsSelection; locked: boolean }) {
  const gt = useGT();
  const { control, traits } = props;
  const { descriptor } = control;
  if (control.kind === "boolean") {
    return (
      <div role="radiogroup" aria-label={descriptor.label} className="flex flex-col gap-0.5">
        {([true, false] as const).map((value) => (
          <ColumnRow
            key={String(value)}
            label={
              value
                ? gt("On", { $context: "option state" })
                : gt("Off", { $context: "option state" })
            }
            selected={(control.descriptor.currentValue === true) === value}
            tabStop={(control.descriptor.currentValue === true) === value}
            onPick={() => traits.changeBoolean(descriptor.id, value)}
          />
        ))}
      </div>
    );
  }
  return <EffortSlider descriptor={control.descriptor} traits={traits} locked={props.locked} />;
}

/**
 * BlueCode: the levels as one slider, measured against Capy's: a 28px track with a mark at each
 * level, a textured fill and a white handle. Click or drag to a level; Left and Right step.
 */
function EffortSlider(props: {
  descriptor: SelectDescriptor;
  traits: TraitsSelection;
  locked: boolean;
}) {
  const messages = useMessages();
  const { descriptor, traits, locked } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  // While dragging, the fill follows the pointer at once instead of waiting on the saved level.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const value = traits.selectValue(descriptor);
  const choices = selectableProviderOptionChoices(descriptor);
  const last = choices.length - 1;
  // An "Ultrathink:" prefix selects a level the slider does not offer, so nothing fills.
  const selectedIndex = dragIndex ?? choices.findIndex((option) => option.id === value);
  const current = choices[selectedIndex];
  // Levels sit between the handle's half-widths, so the handle never leaves the track.
  const stop = (index: number) =>
    last <= 0 ? "100%" : `calc(0.5625rem + (100% - 1.125rem) * ${index / last})`;
  const pick = (index: number) => {
    const option = choices[Math.min(Math.max(index, 0), last)];
    if (!option || locked || option.id === value) return;
    traits.changeSelect(descriptor, option.id);
  };
  const drag = (clientX: number) => {
    const index = levelAt(clientX);
    setDragIndex(index);
    pick(index);
  };
  const levelAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || last <= 0) return 0;
    const fraction = (clientX - rect.left - 9) / (rect.width - 18);
    return Math.round(Math.min(Math.max(fraction, 0), 1) * last);
  };
  return (
    <>
      <div className="flex min-h-5.5 items-center justify-between gap-2 px-2 font-medium text-muted-foreground text-xs">
        <span>{descriptor.label}</span>
        <span className="truncate font-normal text-foreground text-sm">{current?.label}</span>
      </div>
      {locked ? (
        <div className="px-2 pb-1 text-muted-foreground/80 text-xs">
          {messages(ULTRATHINK_IN_BODY_NOTE)}
        </div>
      ) : null}
      <div className="px-2 pt-0.5 pb-1.5">
        <div
          ref={trackRef}
          role="slider"
          aria-label={descriptor.label}
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={Math.max(selectedIndex, 0)}
          aria-valuetext={current?.label}
          aria-disabled={locked || undefined}
          tabIndex={0}
          // Focus lands here after a model pick; Up and Down treat the slider as one row.
          data-effort-row
          data-effort-level
          className="group/slider relative h-7 w-full cursor-pointer touch-none overflow-hidden rounded-md bg-foreground/5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-disabled:cursor-not-allowed aria-disabled:opacity-64"
          onPointerDown={(event) => {
            if (locked || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag(event.clientX);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) drag(event.clientX);
          }}
          onPointerUp={() => setDragIndex(null)}
          onPointerCancel={() => setDragIndex(null)}
          onKeyDown={(event) => {
            const index = Math.max(selectedIndex, 0);
            const next =
              event.key === "ArrowRight"
                ? index + 1
                : event.key === "ArrowLeft"
                  ? index - 1
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? last
                      : null;
            // Left from the first level leaves for the search, as from any other row.
            if (next === null || next < 0 || next > last) return;
            event.preventDefault();
            event.stopPropagation();
            pick(next);
          }}
        >
          {choices.map((option, index) =>
            index > selectedIndex ? (
              <span
                key={option.id}
                aria-hidden="true"
                className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/15"
                style={{ left: stop(index) }}
              />
            ) : null,
          )}
          {selectedIndex >= 0 ? (
            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-y-0 left-0 overflow-hidden rounded-md bg-primary",
                dragIndex === null &&
                  "transition-[width] duration-150 ease-out motion-reduce:transition-none",
              )}
              style={{ width: `min(100%, calc(${stop(selectedIndex)} + 0.6875rem))` }}
            >
              <span className="absolute inset-0 bg-linear-to-r from-black/25 to-transparent" />
              <span data-slider-texture className="absolute inset-y-0 left-0 w-full opacity-35" />
              <span className="absolute inset-y-0.5 right-0.5 w-4 rounded-sm bg-white shadow-xs transition-[scale] duration-100 group-active/slider:scale-95" />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** BlueCode: Fast mode and Ultracode switch in place, as in Capy's model card. */
function SpeedToggleRows(props: { traits: TraitsSelectionInput }) {
  const traits = useTraitsSelection(props.traits);
  const { fastToggle, ultracodeToggle } = splitSpeed(
    traits.selectDescriptors,
    traits.booleanDescriptors,
  );
  if (traits.modelIsUnavailable || (!fastToggle && !ultracodeToggle)) return null;
  return (
    <div className="flex flex-col">
      {fastToggle ? (
        <ToggleRow icon={<FastBolt ultra={false} />} descriptor={fastToggle} traits={traits} />
      ) : null}
      {ultracodeToggle ? (
        <ToggleRow
          icon={<WorkflowIcon aria-hidden="true" className="size-3" />}
          descriptor={ultracodeToggle}
          traits={traits}
        />
      ) : null}
    </div>
  );
}

function ToggleRow(props: {
  icon: ReactNode;
  descriptor: BooleanDescriptor;
  traits: TraitsSelection;
}) {
  const { descriptor, traits } = props;
  const checked = descriptor.currentValue === true;
  return (
    <label className={cn(COLUMN_ROW, "has-focus-visible:bg-foreground/[0.09]")}>
      <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
        {props.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{descriptor.label}</span>
      <Switch
        size="sm"
        checked={checked}
        onCheckedChange={(next) => traits.changeBoolean(descriptor.id, next)}
        aria-label={descriptor.label}
        data-effort-row
        tabIndex={-1}
      />
    </label>
  );
}

const OPTION_ROW = cn(COLUMN_ROW, "h-auto py-1");

/** An option's name over its current value. */
function OptionRowText(props: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-muted-foreground text-xs">{props.label}</span>
      <span className="truncate">{props.value}</span>
    </span>
  );
}

/**
 * One select besides reasoning, such as an agent's session mode. It names the current choice and
 * opens the rest beside the column, so any number of options leaves the levels in place.
 */
function OptionMenuRow(props: {
  descriptor: SelectDescriptor;
  traits: TraitsSelection;
  /** Holds the column's tab stop when the model has no levels. */
  tabStop: boolean;
}) {
  const gt = useGT();
  const { descriptor, traits } = props;
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const choices = selectableProviderOptionChoices(descriptor);
  const value = traits.selectValue(descriptor);
  const current = choices.find((choice) => choice.id === value)?.label ?? "";
  return (
    <Menu
      open={open}
      // A modal menu would cover the picker, so the next click there would only close it.
      modal={false}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) return;
        const checked = popupRef.current?.querySelector<HTMLElement>(
          '[role="menuitemradio"][aria-checked="true"]',
        );
        checked?.focus({ preventScroll: true });
        checked?.scrollIntoView({ block: "nearest" });
      }}
    >
      {/* No hover opening: an opened menu takes focus, which would steal typing from search. */}
      <MenuTrigger
        render={
          <button
            type="button"
            data-effort-row
            tabIndex={props.tabStop ? 0 : -1}
            aria-label={`${descriptor.label}: ${current}`}
            className={cn(OPTION_ROW, "data-popup-open:bg-foreground/[0.09]")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight") return;
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
            }}
          />
        }
      >
        <OptionRowText label={descriptor.label} value={current} />
        <ChevronRightIcon
          aria-hidden="true"
          className="-me-1 size-3.5 shrink-0 text-muted-foreground"
        />
      </MenuTrigger>
      <MenuPopup
        ref={popupRef}
        side="right"
        align="start"
        sideOffset={6}
        // A full-width column on phones leaves no room beside it, so fall below or above.
        collisionAvoidance={{ fallbackAxisSide: "end" }}
        className="max-w-72"
        data-model-picker-option-menu
        {...composerFloatingLayerProps}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft") return;
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }}
      >
        <MenuRadioGroup
          aria-label={descriptor.label}
          value={value}
          onValueChange={(next: string) => {
            if (next !== value) traits.changeSelect(descriptor, next);
          }}
        >
          {choices.map((choice) => (
            <MenuRadioItem key={choice.id} value={choice.id} closeOnClick>
              <span className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{choice.label}</span>
                  {choice.description ? (
                    <span className="line-clamp-2 text-muted-foreground text-xs">
                      {choice.description}
                    </span>
                  ) : null}
                </span>
                {choice.isDefault ? (
                  <span className="text-muted-foreground/70 text-xs">
                    {gt("Default", { $context: "marks the default option" })}
                  </span>
                ) : null}
                <MenuRadioItemIndicator />
              </span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

/** A two-state option toggles in place; a menu would add a click for nothing. */
function OptionSwitchRow(props: {
  descriptor: BooleanDescriptor;
  traits: TraitsSelection;
  tabStop: boolean;
}) {
  const gt = useGT();
  const { descriptor, traits } = props;
  const checked = descriptor.currentValue === true;
  return (
    <label className={cn(OPTION_ROW, "has-focus-visible:bg-foreground/[0.09]")}>
      <OptionRowText
        label={descriptor.label}
        value={
          checked ? gt("On", { $context: "option state" }) : gt("Off", { $context: "option state" })
        }
      />
      <Switch
        size="sm"
        checked={checked}
        onCheckedChange={(next) => traits.changeBoolean(descriptor.id, next)}
        aria-label={descriptor.label}
        data-effort-row
        tabIndex={props.tabStop ? 0 : -1}
      />
    </label>
  );
}

function NoEffortRow() {
  return (
    <div className="flex h-8 items-center px-2 text-muted-foreground text-sm">
      <T>No effort levels</T>
    </div>
  );
}

/** The model picker's effort column: the selected model's levels and its other options. */
export function ComposerEffortColumn(props: { traits: TraitsSelectionInput | null }) {
  const gt = useGT();
  const messages = useMessages();
  const picker = use(DockedPickerContext);
  const visibility = props.traits
    ? getTraitsSectionVisibility({ ...props.traits, resolve: messages })
    : null;
  const controls =
    props.traits && visibility
      ? columnControls(visibility.selectDescriptors, visibility.booleanDescriptors)
      : null;
  return (
    <>
      {/* BlueCode: a card of its own beside the list, headed by the model it configures. */}
      <div className="flex h-7 shrink-0 items-center gap-2 px-2 font-medium text-sm">
        {picker.modelIcon}
        <span className="min-w-0 truncate">{picker.modelLabel}</span>
      </div>
      <div className="-mx-1 my-1 h-px shrink-0 bg-border" />
      {controls?.effort ? null : (
        <div className="flex min-h-5.5 shrink-0 items-center px-2 font-medium text-muted-foreground text-xs">
          {controls?.others.length
            ? gt("Options", { $context: "heading for model options" })
            : gt("Effort", { $context: "heading for reasoning effort levels" })}
        </div>
      )}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        // Capture, so Up and Down on an option row move rows instead of opening its menu.
        onKeyDownCapture={moveBetweenRows}
      >
        {props.traits ? <EffortLevels traits={props.traits} /> : <NoEffortRow />}
        {props.traits ? <SpeedToggleRows traits={props.traits} /> : null}
      </div>
    </>
  );
}

const FOOTER_SEGMENT =
  "flex h-6 cursor-pointer items-center justify-center gap-1 px-2 text-muted-foreground text-xs outline-none first:rounded-l-md last:rounded-r-md hover:text-foreground data-checked:bg-input/72 data-checked:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

function SpeedSegment(props: {
  checked: boolean;
  label: string;
  description?: string | undefined;
  onPick: () => void;
}) {
  const speed = props.label;
  const buttonProps = {
    type: "button",
    role: "radio",
    "aria-checked": props.checked,
    "data-checked": props.checked || undefined,
    className: FOOTER_SEGMENT,
    onClick: props.onPick,
  } as const;
  const content = (
    <>
      {speed === "Fast" || speed === "Ultrafast" ? (
        <FastBolt ultra={speed === "Ultrafast"} />
      ) : null}
      {props.label}
    </>
  );
  if (!props.description) return <button {...buttonProps}>{content}</button>;
  return (
    <SharedTooltipTrigger render={<button {...buttonProps} />} label={props.description}>
      {content}
    </SharedTooltipTrigger>
  );
}

function SpeedControl(props: { traits: TraitsSelectionInput }) {
  const traits = useTraitsSelection(props.traits);
  const { speedSelect } = splitSpeed(traits.selectDescriptors, traits.booleanDescriptors);
  if (traits.modelIsUnavailable || !speedSelect) return null;
  const choices = selectableProviderOptionChoices(speedSelect);
  return (
    <div
      role="radiogroup"
      aria-label={speedSelect.label}
      className="mx-1 flex self-start rounded-lg bg-input/40 p-0.5"
    >
      {choices.map((option) => (
        <SpeedSegment
          key={option.id}
          checked={option.id === traits.selectValue(speedSelect)}
          label={option.label}
          description={option.description}
          onPick={() => traits.changeSelect(speedSelect, option.id)}
        />
      ))}
    </div>
  );
}

/** How much a mode lets the agent do unasked: calm for supervised, amber for full access. */
const PERMISSION_TONE: Record<RuntimeMode, string> = {
  "approval-required": "text-success-foreground ring-success/30",
  "auto-accept-edits": "text-info-foreground ring-info/30",
  auto: "text-info-foreground ring-info/30",
  "full-access": "text-warning-foreground ring-warning/35",
};

/**
 * BlueCode: the permission modes inline, from most to least cautious, on the same track as the
 * reasoning slider. The chosen mode widens to name itself, tinted by how much it allows; the
 * others stay icons with their name and meaning on hover.
 */
function PermissionsControl(props: {
  runtimeMode: RuntimeMode;
  options: ReadonlyArray<RuntimeModeOption>;
  onChange: (mode: RuntimeMode) => void;
}) {
  const gt = useGT();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const { options } = props;
  const currentIndex = options.findIndex((option) => option.mode === props.runtimeMode);
  const current = options[currentIndex];
  if (!current) return null;
  const pick = (index: number) => {
    const option = options[index];
    if (!option || option.disabledReason) return;
    if (option.mode !== props.runtimeMode) props.onChange(option.mode);
    buttonsRef.current[index]?.focus();
  };
  return (
    <>
      <div className="flex min-h-5.5 items-center px-2 font-medium text-muted-foreground text-xs">
        {gt("Permissions")}
      </div>
      <div className="px-2 pt-0.5 pb-1.5">
        <div
          role="radiogroup"
          aria-label={gt("Permissions")}
          className="flex h-7 gap-0.5 rounded-md bg-foreground/5 p-0.5"
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            const step = event.key === "ArrowRight" ? 1 : -1;
            let next = currentIndex + step;
            while (options[next]?.disabledReason) next += step;
            // Left from the first mode leaves for the search, as from any other row.
            if (!options[next]) return;
            event.preventDefault();
            event.stopPropagation();
            pick(next);
          }}
        >
          {options.map((option, index) => {
            const Icon = option.icon;
            const checked = index === currentIndex;
            return (
              <SharedTooltipTrigger
                key={option.mode}
                render={
                  <button
                    ref={(button) => {
                      buttonsRef.current[index] = button;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={option.label}
                    disabled={option.disabledReason !== undefined}
                    tabIndex={checked ? 0 : -1}
                    // The mode shortcut lands here; Up and Down treat the control as one row.
                    {...(checked
                      ? { "data-effort-row": true, "data-composer-permissions-trigger": true }
                      : {})}
                    className={cn(
                      "flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-sm px-2 text-muted-foreground outline-none transition-[flex-grow,background-color,color] duration-200 ease-out hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
                      checked &&
                        cn(
                          // min-w-fit: on a phone the popover is too narrow to give the label its share.
                          "min-w-fit grow-[2.6] bg-popover shadow-xs ring-1 ring-inset",
                          PERMISSION_TONE[option.mode],
                        ),
                    )}
                    onClick={() => pick(index)}
                  />
                }
                label={
                  <>
                    <span className="font-medium">{option.label}</span>
                    <span className="block text-muted-foreground">
                      {option.disabledReason ?? option.description}
                    </span>
                  </>
                }
                className="max-w-56"
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                {checked ? (
                  <span className="truncate font-medium text-xs">{option.label}</span>
                ) : null}
              </SharedTooltipTrigger>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** The model picker's footer: multi-tier speed, then the permission modes. */
export function ComposerPickerFooter(props: {
  traits: TraitsSelectionInput | null;
  runtimeMode: RuntimeMode;
  runtimeModeOptions: ReadonlyArray<RuntimeModeOption>;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  return (
    <div className="-mx-1 mt-1 flex shrink-0 flex-col border-t px-1 pt-1">
      {props.traits ? <SpeedControl traits={props.traits} /> : null}
      <PermissionsControl
        runtimeMode={props.runtimeMode}
        options={props.runtimeModeOptions}
        onChange={props.onRuntimeModeChange}
      />
    </div>
  );
}

// BlueCode: the docked model card (bluecode/ModelCard.tsx) builds its chips from the same split.
export { columnControls, splitSpeed, type TraitsSelection };
