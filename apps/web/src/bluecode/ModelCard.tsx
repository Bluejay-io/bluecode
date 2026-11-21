import type { RuntimeMode } from "@t3tools/contracts";
import { msg, T, useGT, useMessages } from "gt-react";
import { RotateCcwIcon, WorkflowIcon, ZapIcon } from "lucide-react";
import { type KeyboardEvent, type ReactElement, type ReactNode, use } from "react";

import {
  columnControls,
  COLUMN_LABEL,
  COLUMN_ROW,
  moveBetweenRows,
  OptionMenuRow,
  SpeedControl,
  splitSpeed,
  type TraitsSelection,
} from "../components/chat/ComposerModelEffort";
import type { RuntimeModeOption } from "../components/chat/ComposerFooterControls";
import { DockedPickerContext } from "../components/chat/ProviderModelPicker";
import {
  getTraitsSectionVisibility,
  type TraitsSelectionInput,
  useTraitsSelection,
} from "../components/chat/TraitsPicker";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import { EffortSlider } from "./EffortSlider";
import { fastTierSwitch, resetState } from "./modelCard.logic";

export type ModelCardPermissions = {
  runtimeMode: RuntimeMode;
  runtimeModeOptions: ReadonlyArray<RuntimeModeOption>;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  /** False while the composer footer shows its own permissions button. */
  showPermissions: boolean;
};

function CardTooltip(props: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipPopup side="top">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** The inset card that holds the selected model's reasoning and options. */
function ReasoningInset(props: {
  heading: string;
  /** Null hides reset; a model with nothing changed shows it disabled. */
  onReset: (() => void) | "unchanged" | null;
  children: ReactNode;
}) {
  const gt = useGT();
  const { onReset } = props;
  const resetLabel = gt("Reset to defaults", { $context: "resets a model's effort and options" });
  return (
    <div
      data-model-picker-effort
      className="mx-1.5 mt-1.5 flex shrink-0 flex-col rounded-lg border border-(--border-1) bg-foreground/[0.03] p-1"
    >
      <div className="flex h-7 items-center gap-2 ps-2">
        <span
          data-model-card-effort
          className="min-w-0 flex-1 truncate font-medium text-(--model-card-accent) text-xs"
        >
          {props.heading}
        </span>
        {onReset ? (
          <CardTooltip label={resetLabel}>
            <Button
              variant="quiet"
              size="icon-xs"
              aria-label={resetLabel}
              disabled={onReset === "unchanged"}
              onClick={() => {
                if (onReset !== "unchanged") onReset();
              }}
            >
              <RotateCcwIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </CardTooltip>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function NoEffortNote() {
  return (
    <p className="px-2 pb-1 text-muted-foreground text-xs">
      <T>No effort levels</T>
    </p>
  );
}

/** A model the provider no longer lists keeps its saved options, shown read-only. */
function SavedOptions(props: { traits: TraitsSelection }) {
  return (
    <div>
      {props.traits.descriptors.map((descriptor) => {
        const value = props.traits.currentLabel(descriptor);
        return value ? (
          <div key={descriptor.id}>
            <div className={COLUMN_LABEL}>{descriptor.label}</div>
            <div className="px-2 pb-1.5 text-muted-foreground/80 text-xs">{value}</div>
          </div>
        ) : null;
      })}
    </div>
  );
}

function SwitchRow({
  focusTarget,
  ...props
}: {
  icon?: ReactNode;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  tabStop: boolean;
  /** Takes the effort shortcut when the model has no slider. */
  focusTarget?: ((node: HTMLElement | null) => void) | undefined;
}) {
  return (
    <label className={cn(COLUMN_ROW, "has-focus-visible:bg-(--popover-hover)")}>
      {props.icon ? (
        <span className="flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
          {props.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      <Switch
        ref={focusTarget}
        size="sm"
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        aria-label={props.label}
        data-effort-row
        tabIndex={props.tabStop ? 0 : -1}
      />
    </label>
  );
}

/** How much a mode lets the agent do unasked: amber for full access, quiet otherwise. */
function permissionTone(mode: RuntimeMode) {
  return mode === "full-access" ? "text-warning-foreground" : "text-(--contrast-icon-muted)";
}

/**
 * Arrows only move focus between the modes, as in the permissions menu: arrowing onto Full access
 * must never pick it. Enter, Space or a click picks.
 */
function moveBetweenModes(event: KeyboardEvent<HTMLElement>) {
  const step =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (step === 0 && event.key !== "Home" && event.key !== "End") return;
  const modes = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
  );
  const index = modes.findIndex((mode) => mode === document.activeElement);
  const next =
    event.key === "Home"
      ? modes[0]
      : event.key === "End"
        ? modes.at(-1)
        : modes[Math.min(modes.length - 1, Math.max(0, index + step))];
  event.preventDefault();
  event.stopPropagation();
  next?.focus();
}

/**
 * The permission modes as a segmented control at the panel's foot, from most to least cautious.
 * The chosen mode names itself; the others are icons, named on hover.
 */
function PermissionsRow(props: { permissions: ModelCardPermissions }) {
  const gt = useGT();
  const picker = use(DockedPickerContext);
  const { runtimeMode, runtimeModeOptions: options, onRuntimeModeChange } = props.permissions;
  if (!options.some((option) => option.mode === runtimeMode)) return null;
  const label = gt("Permissions");
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2">
      <span className="min-w-0 shrink truncate text-muted-foreground text-xs">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="ms-auto flex h-7 min-w-0 gap-0.5 rounded-md bg-foreground/5 p-0.5"
        onKeyDown={moveBetweenModes}
      >
        {options.map((option) => {
          const Icon = option.icon;
          const checked = option.mode === runtimeMode;
          return (
            <Tooltip key={option.mode}>
              <TooltipTrigger
                render={
                  <button
                    ref={checked ? picker.permissionsFocusRef : undefined}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={option.label}
                    disabled={option.disabledReason !== undefined}
                    tabIndex={checked ? 0 : -1}
                    className={cn(
                      "flex min-w-7 cursor-pointer items-center justify-center gap-1.5 rounded-sm px-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40",
                      checked && "bg-popover text-foreground shadow-xs",
                      checked && option.mode === "full-access" && "bg-warning/12",
                    )}
                    onClick={() => {
                      if (!checked) onRuntimeModeChange(option.mode);
                    }}
                  />
                }
              >
                <Icon
                  aria-hidden="true"
                  className={cn("size-3.5 shrink-0", permissionTone(option.mode))}
                />
                {checked ? (
                  <span className="truncate font-medium text-xs">{option.label}</span>
                ) : null}
              </TooltipTrigger>
              <TooltipPopup side="top" className="max-w-56">
                <span className="font-medium">{option.label}</span>
                <span className="block text-muted-foreground">
                  {option.disabledReason ?? option.description}
                </span>
              </TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function PanelFoot(props: { permissions: ModelCardPermissions | undefined }) {
  const { permissions } = props;
  if (!permissions?.showPermissions) return <div aria-hidden="true" className="h-1.5 shrink-0" />;
  return <PermissionsRow permissions={permissions} />;
}

function TraitsSection(props: {
  traits: TraitsSelectionInput;
  permissions: ModelCardPermissions | undefined;
}) {
  const gt = useGT();
  const messages = useMessages();
  const picker = use(DockedPickerContext);
  const traits = useTraitsSelection(props.traits);
  const { effort, others } = columnControls(traits.selectDescriptors, traits.booleanDescriptors);
  const { speedSelect, fastToggle, ultracodeToggle } = splitSpeed(
    traits.selectDescriptors,
    traits.booleanDescriptors,
  );
  const reasoning = gt("Reasoning", { $context: "model option name" });
  if (traits.modelIsUnavailable) {
    return (
      <>
        <ReasoningInset heading={reasoning} onReset={null}>
          <SavedOptions traits={traits} />
        </ReasoningInset>
        <PanelFoot permissions={props.permissions} />
      </>
    );
  }
  const speedSwitch = fastTierSwitch(props.traits.provider, speedSelect);
  const tierSwitch = fastToggle ? null : speedSwitch;
  // The model's own values, before any pick: what reset writes back.
  const defaults = getTraitsSectionVisibility({
    ...props.traits,
    modelOptions: undefined,
    resolve: messages,
  }).descriptors;
  const reset = resetState(traits.descriptors, defaults);
  // Ultrathink in the prompt locks the levels.
  const locked =
    effort?.descriptor.id === traits.primarySelectDescriptor?.id && traits.ultrathinkInBodyText;
  const level = !effort
    ? null
    : effort.kind === "boolean"
      ? messages(
          effort.descriptor.currentValue === true
            ? msg("{option} On", { option: effort.descriptor.label })
            : msg("{option} Off", { option: effort.descriptor.label }),
        )
      : (effort.descriptor.options.find(
          (option) => option.id === traits.selectValue(effort.descriptor),
        )?.label ??
        traits.currentLabel(effort.descriptor) ??
        null);
  const sliderTakesFocus = effort?.kind === "select" && !locked;
  // The rows share one tab stop, Up and Down move between them; it takes the effort shortcut
  // when there is no slider to move.
  const rows: Array<(tabStop: boolean) => ReactNode> = [
    ...(effort?.kind === "boolean"
      ? [
          (tabStop: boolean) => (
            <SwitchRow
              key={effort.descriptor.id}
              label={effort.descriptor.label}
              checked={effort.descriptor.currentValue === true}
              onCheckedChange={(next) => traits.changeBoolean(effort.descriptor.id, next)}
              tabStop={tabStop}
              focusTarget={tabStop ? picker.effortFocusRef : undefined}
            />
          ),
        ]
      : []),
    ...(fastToggle
      ? [
          (tabStop: boolean) => (
            <SwitchRow
              key={fastToggle.id}
              icon={<ZapIcon aria-hidden="true" className="size-3" />}
              label={fastToggle.label}
              checked={fastToggle.currentValue === true}
              onCheckedChange={(next) => traits.changeBoolean(fastToggle.id, next)}
              tabStop={tabStop}
              focusTarget={tabStop && !sliderTakesFocus ? picker.effortFocusRef : undefined}
            />
          ),
        ]
      : speedSelect && tierSwitch
        ? [
            (tabStop: boolean) => (
              <SwitchRow
                key={speedSelect.id}
                icon={<ZapIcon aria-hidden="true" className="size-3" />}
                label={gt("Fast mode")}
                checked={traits.selectValue(speedSelect) === tierSwitch.on.id}
                onCheckedChange={(next) =>
                  traits.changeSelect(speedSelect, next ? tierSwitch.on.id : tierSwitch.off.id)
                }
                tabStop={tabStop}
                focusTarget={tabStop && !sliderTakesFocus ? picker.effortFocusRef : undefined}
              />
            ),
          ]
        : []),
    ...(ultracodeToggle
      ? [
          (tabStop: boolean) => (
            <SwitchRow
              key={ultracodeToggle.id}
              icon={<WorkflowIcon aria-hidden="true" className="size-3" />}
              label={ultracodeToggle.label}
              checked={ultracodeToggle.currentValue === true}
              onCheckedChange={(next) => traits.changeBoolean(ultracodeToggle.id, next)}
              tabStop={tabStop}
              focusTarget={tabStop && !sliderTakesFocus ? picker.effortFocusRef : undefined}
            />
          ),
        ]
      : []),
    ...others.map((control) =>
      control.kind === "boolean"
        ? (tabStop: boolean) => (
            <SwitchRow
              key={control.descriptor.id}
              label={control.descriptor.label}
              checked={control.descriptor.currentValue === true}
              onCheckedChange={(next) => traits.changeBoolean(control.descriptor.id, next)}
              tabStop={tabStop}
              focusTarget={tabStop && !sliderTakesFocus ? picker.effortFocusRef : undefined}
            />
          )
        : (tabStop: boolean) => (
            <OptionMenuRow
              key={control.descriptor.id}
              descriptor={control.descriptor}
              traits={traits}
              tabStop={tabStop}
              inline
              focusTarget={tabStop && !sliderTakesFocus ? picker.effortFocusRef : undefined}
            />
          ),
    ),
  ];
  const multiSpeed = speedSelect !== null && speedSwitch === null;
  return (
    <>
      <ReasoningInset
        heading={level ? `${reasoning} · ${level}` : reasoning}
        onReset={
          reset === "hidden"
            ? null
            : reset === "changed"
              ? () => traits.changeAll(defaults)
              : "unchanged"
        }
      >
        {effort?.kind === "select" ? (
          <div className="px-1 pb-1">
            <EffortSlider
              descriptor={effort.descriptor}
              traits={traits}
              locked={locked}
              focusRef={sliderTakesFocus ? picker.effortFocusRef : undefined}
            />
          </div>
        ) : effort ? null : (
          <NoEffortNote />
        )}
        {rows.length > 0 ? (
          <div
            className="flex flex-col"
            // Capture, so Up and Down on an option row move rows instead of opening its menu.
            onKeyDownCapture={moveBetweenRows}
          >
            {rows.map((row, index) => row(index === 0))}
          </div>
        ) : null}
        {multiSpeed && speedSelect ? (
          <div className="flex h-8 items-center gap-2 ps-2">
            <span className="min-w-0 flex-1 truncate text-sm">{speedSelect.label}</span>
            <SpeedControl
              traits={props.traits}
              focusRef={!sliderTakesFocus && rows.length === 0 ? picker.effortFocusRef : undefined}
            />
          </div>
        ) : null}
      </ReasoningInset>
      <PanelFoot permissions={props.permissions} />
    </>
  );
}

/**
 * BlueCode: the docked picker's lower half, under the model list: the selected model's reasoning
 * slider and options in an inset card, then the permission modes when the footer hides them.
 */
export function ModelCard(props: {
  traits: TraitsSelectionInput | null;
  permissions?: ModelCardPermissions | undefined;
}) {
  const gt = useGT();
  if (props.traits) return <TraitsSection traits={props.traits} permissions={props.permissions} />;
  return (
    <>
      <ReasoningInset heading={gt("Reasoning", { $context: "model option name" })} onReset={null}>
        <NoEffortNote />
      </ReasoningInset>
      <PanelFoot permissions={props.permissions} />
    </>
  );
}
