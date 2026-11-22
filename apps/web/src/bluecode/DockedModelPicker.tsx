import type { ProviderInstanceEntry } from "../providerInstances";
import { useGT } from "gt-react";
import { StarIcon } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ProviderInstanceIcon } from "../components/chat/ProviderInstanceIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import { registerModelPickerContent } from "../modelPickerVisibility";

/** Where the panel's settings hand the composer.effort shortcut focus. */
export type ModelCardControls = {
  /** The effort chip, else the first chip. */
  effortFocusRef: (node: HTMLElement | null) => void;
};

export const MODEL_CARD_CONTROLS_FALLBACK: ModelCardControls = {
  effortFocusRef: () => {},
};

/**
 * BlueCode: a docked picker is one panel: search, provider tabs, the list, then the selected
 * model's settings as chips. composer.effort aims focus into it.
 */
export function useDockedModelPanel(input: {
  popupRef: RefObject<HTMLElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  isCoarsePointer: boolean;
}) {
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const effort = useRef<HTMLElement | null>(null);
  // Whether the popup's initial focus lands on the effort chip instead of the search.
  const openToEffort = useRef(false);

  /** composer.effort aims the panel before it opens, or moves within it. */
  const openTarget = () => {
    openToEffort.current = true;
    const node = effort.current;
    if (!node?.isConnected) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  };
  const reset = () => {
    openToEffort.current = false;
    setSectionFilter(null);
  };
  const initialFocus = () => {
    if (input.isCoarsePointer) return input.popupRef.current ?? true;
    return (openToEffort.current ? effort.current : null) ?? input.searchInputRef.current ?? true;
  };
  const controls: ModelCardControls = {
    effortFocusRef: (node) => {
      effort.current = node;
    },
  };
  return { sectionFilter, setSectionFilter, controls, openTarget, reset, initialFocus };
}

/** The open panel counts as an open picker, so mod+digit stays out of thread jumps. */
function ModelPickerPresence() {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes the panel's mount to global keydown handlers, as ModelPickerContent does
  useLayoutEffect(() => registerModelPickerContent(), []);
  return null;
}

const TAB =
  "flex h-6 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md text-muted-foreground text-xs outline-none hover:bg-(--popover-hover) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-selected:bg-(--border-1) aria-selected:text-foreground";

/**
 * The list's groups as compact tabs: All and Favorites by name, then each enabled provider as its
 * icon, named in a tooltip, so a row of providers fits the panel. A press keeps focus in the
 * search, so arrows still walk the list; from the keyboard, Left and Right move.
 */
export function ModelPickerTabs(props: {
  sections: ReadonlyArray<{ id: string; title: string }>;
  active: string | null;
  entries: ReadonlyArray<ProviderInstanceEntry>;
  onChange: (id: string | null) => void;
}) {
  const gt = useGT();
  if (props.sections.length < 2) return null;
  const tabs = [
    { id: null, title: gt("All", { $context: "all providers" }), icon: null, iconOnly: false },
    ...props.sections.map((section) => {
      const entry = props.entries.find((candidate) => candidate.instanceId === section.id);
      return {
        id: section.id,
        title: section.title,
        icon:
          section.id === "favorites" ? (
            <StarIcon aria-hidden="true" className="size-3.5" />
          ) : entry ? (
            <ProviderInstanceIcon
              driverKind={entry.driverKind}
              displayName={entry.displayName}
              accentColor={entry.accentColor}
              acpRegistryAgentId={entry.acpRegistryAgentId}
              acpRegistryIconUrl={entry.acpRegistryIconUrl}
              className="size-3.5"
              iconClassName="size-3.5"
            />
          ) : null,
        iconOnly: entry !== undefined,
      };
    }),
  ];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const index = tabs.findIndex((tab) => tab.id === props.active);
    const next = tabs[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    props.onChange(next.id);
    const button = event.currentTarget.querySelector<HTMLElement>(
      `[data-model-tab="${next.id ?? ""}"]`,
    );
    button?.focus();
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return (
    <div
      role="tablist"
      aria-label={gt("Providers")}
      className="flex shrink-0 gap-0.5 overflow-x-auto px-2 pt-1.5 pb-0.5 [scrollbar-width:none]"
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === props.active;
        const button = (
          <button
            key={tab.id ?? ""}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={tab.iconOnly ? tab.title : undefined}
            tabIndex={selected ? 0 : -1}
            data-model-tab={tab.id ?? ""}
            className={cn(TAB, tab.iconOnly ? "w-7" : "px-2")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => props.onChange(tab.id)}
          >
            {tab.icon}
            {tab.iconOnly ? null : <span className="whitespace-nowrap">{tab.title}</span>}
          </button>
        );
        if (!tab.iconOnly) return button;
        return (
          <Tooltip key={tab.id ?? ""}>
            <TooltipTrigger render={button} />
            <TooltipPopup side="top">{tab.title}</TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Typing anywhere in the panel lands in the search; focus moves before the key, so it lands. */
function typeToSearch(event: KeyboardEvent<HTMLDivElement>, search: HTMLInputElement | null): void {
  const target = event.target as HTMLElement;
  if (
    !search ||
    target === search ||
    !event.currentTarget.contains(target) ||
    target.closest("input, textarea, [contenteditable]") ||
    event.key.length !== 1 ||
    event.key === " " ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.nativeEvent.isComposing
  )
    return;
  search.focus({ preventScroll: true });
}

/**
 * The panel: the list (search, tabs, rows) takes the room left over and scrolls itself; the
 * model's chips sit under it at their own height. Once the list is at its minimum, the whole
 * panel scrolls, so the chips stay reachable on a short window.
 */
export function DockedModelPanel(props: {
  searchInputRef: RefObject<HTMLInputElement | null>;
  list: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-model-picker-card
      className="dropdown-glass flex max-h-(--available-height) w-85 max-w-[calc(100vw-1rem)] min-h-0 flex-col overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl text-popover-foreground"
      onKeyDown={(event) => typeToSearch(event, props.searchInputRef.current)}
    >
      <ModelPickerPresence />
      {/* About six rows; a short window shrinks the list first. */}
      <div className="flex h-68 min-h-36 shrink flex-col">{props.list}</div>
      {props.children}
    </div>
  );
}
