import { T, useGT, useLocale, useMessages } from "gt-react";
import { useLegendListRef } from "~/hooks/useLegendListRef";
import {
  ANTIGRAVITY_DEFAULT_MODEL,
  type ProviderInstanceId,
  type EnvironmentId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
  MODEL_PICKER_JUMP_KEYBINDING_COMMANDS,
} from "@t3tools/contracts";
import { resolveSelectableModel } from "@t3tools/shared/model";
import { useAtomValue } from "@effect/atom-react";
import {
  formatProviderUpdateRequiredNotice,
  providerUpdateChannelLags,
} from "@t3tools/client-runtime/providerUpdateRequiredModels";
import { groupModelsBySubProvider } from "@t3tools/client-runtime/providerSubProviders";
import { useNavigate } from "@tanstack/react-router";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import {
  memo,
  useState,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronRightIcon } from "lucide-react";
import { ModelListRow } from "./ModelListRow";
import { useProviderWorkspaceSnapshotRefresh } from "./useProviderWorkspaceSnapshotRefresh";
import { getProviderStatusMessage, hasProviderSetup } from "./ProviderStatusBanner";
import {
  modelPickerLegacySectionKey,
  modelPickerModelKey,
  modelPickerSubProviderSectionKey,
  parseModelPickerLegacySectionKey,
  parseModelPickerModelKey,
} from "./modelPickerKeys";
import { rankModelPickerSearch } from "@t3tools/client-runtime/model-search";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxSearchInput,
  ComboboxItem,
  ComboboxListVirtualized,
} from "../ui/combobox";
import { ModelEsque } from "./providerIconUtils";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { registerModelPickerContent } from "../../modelPickerVisibility";
import { primaryServerKeybindingsAtom } from "../../state/server";
import {
  modelPickerJumpCommandForIndex,
  modelPickerJumpIndexFromCommand,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../../keybindings";
import {
  useEnvironmentModelPreferences,
  useToggleEnvironmentModelFavorite,
} from "~/hooks/useSettings";
import { announce } from "~/lib/announce";
import { cn } from "~/lib/utils";
import { getVirtualizedScrollFadeClassName } from "../ui/scroll-area";
import { TooltipProvider } from "../ui/tooltip";
import { InlineButton } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  isProviderInstancePickerReady,
  isProviderInstancePickerVisible,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { providerModelKey, sortProviderModelItems } from "../../modelOrdering";
import { hasRuntimeModelCatalog } from "../../providerModels";

type ModelPickerItem = {
  slug: string;
  name: string;
  shortName?: string;
  subProvider?: string;
  badge?: "new";
  instanceId: ProviderInstanceId;
  driverKind: ProviderDriverKind;
  instanceDisplayName: string;
  instanceAccentColor?: string | undefined;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  continuationGroupKey?: string | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

export function resolveModelPickerSelectedModel(input: {
  driverKind: ProviderDriverKind | undefined;
  model: string;
  options: ReadonlyArray<ModelEsque>;
}) {
  if (input.driverKind === "antigravity" && input.model === ANTIGRAVITY_DEFAULT_MODEL) {
    const availableModels = input.options.filter(
      (option) => option.slug !== ANTIGRAVITY_DEFAULT_MODEL && !option.isUnavailable,
    );
    return (
      availableModels.find((option) => option.aliases?.includes(ANTIGRAVITY_DEFAULT_MODEL)) ??
      availableModels.find((option) => option.isDefault)
    );
  }
  return input.options.find((option) => option.slug === input.model);
}

function shouldIncludeModelPickerOption(input: {
  readonly entry: ProviderInstanceEntry;
  readonly option: ModelEsque;
  readonly activeInstanceId: ProviderInstanceId;
  readonly activeModel: string;
}): boolean {
  if (input.entry.driverKind === "antigravity" && input.option.slug === ANTIGRAVITY_DEFAULT_MODEL) {
    return false;
  }
  if (isProviderInstancePickerReady(input.entry)) return true;
  return (
    input.entry.enabled &&
    hasRuntimeModelCatalog(input.entry.driverKind) &&
    input.entry.instanceId === input.activeInstanceId &&
    input.option.slug === input.activeModel &&
    input.option.isUnavailable === true
  );
}

function shouldOfferModelPickerSetup(
  entry: ProviderInstanceEntry,
  options: ReadonlyArray<ModelEsque>,
): boolean {
  return (
    entry.enabled &&
    entry.status !== "disabled" &&
    hasProviderSetup(entry.snapshot) &&
    (!isProviderInstancePickerReady(entry) ||
      !entry.installed ||
      entry.snapshot.auth.status === "unauthenticated" ||
      !options.some((option) => !option.isUnavailable))
  );
}

const EMPTY_MODEL_JUMP_LABELS = new Map<string, string>();
const MODEL_LIST_ESTIMATED_ITEM_SIZE = 28;
// BlueCode: one list grouped by provider, as in Capy's picker. Heights are in `--spacing` units:
// a 28px row, a group header, a setup note, and the search box plus list padding and border.
const ROW_UNITS = 7;
const HEADER_UNITS = 8;
const SETUP_ROW_UNITS = 14;
const ROW_SEPARATOR_UNITS = 0.5;
const LIST_CHROME_UNITS = 15.5;
// A favorite is listed twice, so its Favorites row carries its own combobox value.
const FAVORITE_COPY_PREFIX = "favorite:";
const SECTION_HEADER_PREFIX = "section:";
const SETUP_ROW_PREFIX = "setup:";

function modelKeyOfItem(key: string): string {
  return key.startsWith(FAVORITE_COPY_PREFIX) ? key.slice(FAVORITE_COPY_PREFIX.length) : key;
}

function ModelListSeparator() {
  return <div className="h-0.5" />;
}

const SECTION_TITLE = "flex items-end truncate px-2 pb-1 text-muted-foreground text-xs font-medium";

/**
 * Later groups open with Capy's menu separator: 1px from the card's edge to the scroll gutter, with
 * 4px either side (the row gap supplies half the space above).
 */
function ModelPickerSectionHeader(props: { title: string; first: boolean }) {
  if (props.first) {
    return (
      <div role="presentation" className={cn(SECTION_TITLE, "h-7")}>
        {props.title}
      </div>
    );
  }
  return (
    <div role="presentation" className="-ms-3 -me-1.25 pt-0.5">
      <div aria-hidden="true" className="h-px bg-(--border-1)" />
      <div className={cn(SECTION_TITLE, "mt-1 h-6 ps-5")}>{props.title}</div>
    </div>
  );
}

function ModelPickerSetupRow(props: { entry: ProviderInstanceEntry; onOpen: () => void }) {
  const gt = useGT();
  const messages = useMessages();
  return (
    <div className="px-2 py-1.5 text-xs leading-snug">
      <p className="line-clamp-3 text-muted-foreground">
        {getProviderStatusMessage(props.entry.snapshot, messages)}
      </p>
      <InlineButton className="mt-1" onClick={props.onOpen}>
        {gt("Open provider setup")}
      </InlineButton>
    </div>
  );
}

function modelJumpLabelsByKey(
  modelKeys: ReadonlyArray<string>,
  keybindings: ResolvedKeybindingsConfig,
  terminalOpen: boolean,
): ReadonlyMap<string, string> {
  const shortcutLabelOptions = {
    platform: navigator.platform,
    context: { terminalFocus: false, terminalOpen, modelPickerOpen: true },
  };
  const mapping = new Map<string, string>();
  for (const [index, modelKey] of modelKeys.entries()) {
    const command = modelPickerJumpCommandForIndex(index);
    const label = command && shortcutLabelForCommand(keybindings, command, shortcutLabelOptions);
    if (label) {
      mapping.set(modelKey, label);
    }
  }
  return mapping.size > 0 ? mapping : EMPTY_MODEL_JUMP_LABELS;
}

function ModelPickerProviderNotices({
  updateRequiredNotices,
  emptyLabel,
  onRequestClose,
}: {
  emptyLabel: string;
  updateRequiredNotices: ReadonlyArray<{
    instanceId: ProviderInstanceId;
    notice: string;
    canUpdateInSettings: boolean;
  }>;
  onRequestClose: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  return (
    <>
      <ComboboxEmpty className="empty:h-0">{emptyLabel}</ComboboxEmpty>
      {updateRequiredNotices.map(({ instanceId, notice, canUpdateInSettings }) => (
        <p
          key={instanceId}
          className="shrink-0 border-t border-border/70 px-3 py-2 text-xs leading-snug text-muted-foreground"
        >
          {notice}
          {canUpdateInSettings ? (
            <>
              {" "}
              <InlineButton
                onClick={() => {
                  onRequestClose?.();
                  void navigate({ to: "/settings/providers" });
                }}
              >
                <T>Provider settings</T>
              </InlineButton>
            </>
          ) : null}
        </p>
      ))}
    </>
  );
}

function ModelPickerList({
  listRef,
  itemKeys,
  extraData,
  renderItem,
  initialScrollIndex,
}: {
  listRef: RefObject<LegendListRef | null>;
  itemKeys: ReadonlyArray<string>;
  extraData: unknown;
  renderItem: (props: { item: string; index: number }) => ReactNode;
  /** Opens on the selected model's group instead of the top of the list. */
  initialScrollIndex: number;
}) {
  const [showTopScrollFade, setShowTopScrollFade] = useState(false);
  const [showBottomScrollFade, setShowBottomScrollFade] = useState(false);
  const updateScrollFades = () => {
    const metrics = listRef.current?.getState();
    if (!metrics) return;
    setShowTopScrollFade(!metrics.isAtStart);
    setShowBottomScrollFade(!metrics.isAtEnd);
  };
  const scrollRef = useLegendListRef(listRef, updateScrollFades);

  return (
    <div
      className={cn(
        "relative min-h-0 overflow-hidden pr-px",
        itemKeys.length > 0 ? "flex-1" : "h-0",
      )}
    >
      <ComboboxListVirtualized>
        <LegendList<string>
          ref={scrollRef}
          data={itemKeys}
          extraData={extraData}
          keyExtractor={(modelKey) => modelKey}
          renderItem={renderItem}
          estimatedItemSize={MODEL_LIST_ESTIMATED_ITEM_SIZE}
          {...(initialScrollIndex > 0
            ? { initialScrollIndex: { index: initialScrollIndex, viewPosition: 0 } }
            : {})}
          drawDistance={480}
          recycleItems
          // BlueCode: the list spans the card's padding so group separators reach its edge.
          contentContainerClassName="pl-3 pr-1.25"
          ItemSeparatorComponent={ModelListSeparator}
          onLayout={updateScrollFades}
          onScroll={updateScrollFades}
          onReady={updateScrollFades}
          className={cn(
            "scrollbar-gutter-stable -mx-1 h-full overflow-x-hidden overscroll-y-contain py-1.5 [&::-webkit-scrollbar-track]:my-2",
            getVirtualizedScrollFadeClassName({
              top: showTopScrollFade,
              bottom: showBottomScrollFade,
            }),
          )}
        />
      </ComboboxListVirtualized>
    </div>
  );
}

// Capture gives picker shortcuts priority over the composer.
function WindowKeyDownListener({ onKeyDown }: { onKeyDown: (event: KeyboardEvent) => void }) {
  const handleKeyDown = useEffectEvent(onKeyDown);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes a capture-phase window keydown listener for the picker's lifetime
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener("keydown", listener, true);
    return () => {
      window.removeEventListener("keydown", listener, true);
    };
  }, []);
  return null;
}

export const ModelPickerContent = memo(function ModelPickerContent(props: {
  environmentId: EnvironmentId | null;
  /** Keeps the open provider tab's catalog fresh for this directory. */
  workspaceCwd?: string | null;
  activeInstanceId: ProviderInstanceId;
  model: string;
  selectedModels?: ReadonlyArray<{ instanceId: ProviderInstanceId; model: string }>;
  onToggleModel?: (instanceId: ProviderInstanceId, model: string) => void;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  terminalOpen: boolean;
  onRequestClose?: () => void;
  onOpenProviderSetup?: (instanceId: ProviderInstanceId) => void;
  getModelDisabledReason?: (instanceId: ProviderInstanceId, model: string) => string | null;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
  /** The owning popup moves focus here when it opens (its `initialFocus`). */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Sits beside an effort column: fills the shared row, and stacks above it on narrow screens. */
  docked?: boolean;
  /** Right at the end of the search text moves into the popup's effort column. */
  onFocusEffort?: () => void;
  /** Closes the list column, inside the popup's fixed height. */
  listFooter?: ReactNode;
  /** BlueCode: lists only this group ("favorites" or an instance id), searches included. */
  sectionFilter?: string | null;
  /** BlueCode: the provider shortcuts move an active filter to the next or previous group. */
  onSectionFilterChange?: (id: string | null) => void;
  /** BlueCode: drawn under the search, given the groups and the filter that applies. */
  renderSectionTabs?: (
    sections: ReadonlyArray<{ id: string; title: string }>,
    active: string | null,
  ) => ReactNode;
}) {
  const gt = useGT();
  const messages = useMessages();
  const locale = useLocale();
  const {
    searchInputRef,
    keybindings: providedKeybindings,
    modelOptionsByInstance,
    instanceEntries,
    getModelDisabledReason,
    onInstanceModelChange,
    onToggleModel,
    onRequestClose,
    onOpenProviderSetup,
  } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const modelListRef = useRef<LegendListRef | null>(null);
  const pickerContentRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes this picker's mount to global keydown handlers
  useLayoutEffect(() => registerModelPickerContent(), []);
  const highlightedModelKeyRef = useRef<string | null>(null);
  const { favorites } = useEnvironmentModelPreferences(props.environmentId);
  const activeEntry = props.instanceEntries.find(
    (entry) => entry.instanceId === props.activeInstanceId,
  );
  const activeModel = resolveModelPickerSelectedModel({
    driverKind: activeEntry?.driverKind,
    model: props.model,
    options: modelOptionsByInstance.get(props.activeInstanceId) ?? [],
  });
  const activeModelSlug =
    activeModel?.slug ?? (props.model === ANTIGRAVITY_DEFAULT_MODEL ? "" : props.model);
  const activeModelKey = activeModelSlug
    ? modelPickerModelKey(props.activeInstanceId, activeModelSlug)
    : null;
  const selectedModelKeys = props.selectedModels?.map((selection) => {
    const entry = instanceEntries.find((entry) => entry.instanceId === selection.instanceId);
    const model = resolveModelPickerSelectedModel({
      driverKind: entry?.driverKind,
      model: selection.model,
      options: modelOptionsByInstance.get(selection.instanceId) ?? [],
    });
    return modelPickerModelKey(selection.instanceId, model?.slug ?? selection.model);
  });
  const selectedModelKeySet = new Set(
    selectedModelKeys ?? (activeModelKey ? [activeModelKey] : []),
  );
  const { scanning: workspaceModelsScanning } = useProviderWorkspaceSnapshotRefresh({
    environmentId: props.environmentId,
    gitCwd: props.workspaceCwd ?? null,
    instanceId: props.activeInstanceId,
  });
  const favoritesSet = new Set(favorites.map((fav) => providerModelKey(fav.provider, fav.model)));
  const [expandedLegacyInstances, setExpandedLegacyInstances] = useState(
    () =>
      new Set<ProviderInstanceId>(
        activeModel?.isLegacy &&
          !favoritesSet.has(providerModelKey(props.activeInstanceId, activeModelSlug))
          ? [props.activeInstanceId]
          : [],
      ),
  );
  // The thread's backend opens expanded, so its models show without a click.
  const [expandedSubProviderKeys, setExpandedSubProviderKeys] = useState(
    () =>
      new Set<string>(
        activeModel?.subProvider
          ? [modelPickerSubProviderSectionKey(props.activeInstanceId, activeModel.subProvider)]
          : [],
      ),
  );
  const serverKeybindings = useAtomValue(primaryServerKeybindingsAtom);
  const keybindings = providedKeybindings ?? serverKeybindings;
  const [searchHeight, setSearchHeight] = useState(0);
  const toggleFavorite = useToggleEnvironmentModelFavorite(props.environmentId);
  // The group the provider shortcuts last moved to; a highlight change hands control back.
  const sectionCursorRef = useRef<number | null>(null);

  const toggleLegacySection = (instanceId: ProviderInstanceId) => {
    setExpandedLegacyInstances((expanded) => {
      const next = new Set(expanded);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      return next;
    });
  };

  const toggleSubProviderSection = (key: string) => {
    setExpandedSubProviderKeys((expanded) => {
      const next = new Set(expanded);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const handleModelSelect = (
    modelSlug: string,
    instanceId: ProviderInstanceId,
    additive = false,
  ): string | null => {
    if (getModelDisabledReason?.(instanceId, modelSlug)) {
      return null;
    }
    const options = modelOptionsByInstance.get(instanceId);
    if (!options) {
      return null;
    }
    const entry = instanceEntries.find((candidate) => candidate.instanceId === instanceId);
    if (!entry) {
      return null;
    }
    const resolvedModel = resolveSelectableModel(entry.driverKind, modelSlug, options);
    if (!resolvedModel) return null;
    if (additive && onToggleModel) {
      onToggleModel(instanceId, resolvedModel);
    } else {
      onInstanceModelChange(instanceId, resolvedModel);
    }
    return resolvedModel;
  };

  /** Toggles a group row, or picks the model a row names. */
  const activateItem = (key: string, additive = false): string | null => {
    const legacyInstanceId = parseModelPickerLegacySectionKey(key);
    if (legacyInstanceId) {
      toggleLegacySection(legacyInstanceId);
      return null;
    }
    if (subProviderSectionByKey.has(key)) {
      toggleSubProviderSection(key);
      return null;
    }
    const model = parseModelPickerModelKey(modelKeyOfItem(key));
    return model ? handleModelSelect(model.slug, model.instanceId, additive) : null;
  };

  const modelJumpShortcutContext = {
    terminalFocus: false,
    terminalOpen: props.terminalOpen,
    modelPickerOpen: true,
  } as const;
  const lockedProvider = props.lockedProvider;
  const lockedContinuationGroupKey = props.lockedContinuationGroupKey;
  const canOpenProviderSetup = onOpenProviderSetup !== undefined;

  const matchesLockedProvider = (
    entry: Pick<ProviderInstanceEntry, "driverKind" | "continuationGroupKey">,
  ): boolean => {
    if (lockedProvider === null) return true;
    if (entry.driverKind !== lockedProvider) return false;
    if (!lockedContinuationGroupKey) return true;
    return entry.continuationGroupKey === lockedContinuationGroupKey;
  };

  const flatModels = (() => {
    const entryByInstanceId = new Map(instanceEntries.map((entry) => [entry.instanceId, entry]));
    const out: ModelPickerItem[] = [];
    const seenKeys = new Set<string>();
    for (const [instanceId, models] of modelOptionsByInstance) {
      const entry = entryByInstanceId.get(instanceId);
      if (!entry) {
        continue;
      }
      for (const model of models) {
        const key = modelPickerModelKey(instanceId, model.slug);
        if (
          seenKeys.has(key) ||
          !shouldIncludeModelPickerOption({
            entry,
            option: model,
            activeInstanceId: props.activeInstanceId,
            activeModel: activeModelSlug,
          })
        ) {
          continue;
        }
        seenKeys.add(key);
        out.push({
          slug: model.slug,
          name: model.name,
          ...(model.shortName ? { shortName: model.shortName } : {}),
          ...(model.subProvider ? { subProvider: model.subProvider } : {}),
          ...(model.badge ? { badge: model.badge } : {}),
          ...(model.isLegacy ? { isLegacy: true } : {}),
          ...(model.isUnavailable ? { isUnavailable: true } : {}),
          instanceId,
          driverKind: entry.driverKind,
          instanceDisplayName: entry.displayName,
          ...(entry.accentColor ? { instanceAccentColor: entry.accentColor } : {}),
          ...(entry.acpRegistryAgentId ? { acpRegistryAgentId: entry.acpRegistryAgentId } : {}),
          ...(entry.acpRegistryIconUrl ? { acpRegistryIconUrl: entry.acpRegistryIconUrl } : {}),
          ...(entry.continuationGroupKey
            ? { continuationGroupKey: entry.continuationGroupKey }
            : {}),
        });
      }
    }
    return out;
  })();

  const subProvidersByInstance = new Map(
    instanceEntries.flatMap((entry) =>
      entry.snapshot.subProviders?.length
        ? [[entry.instanceId, entry.snapshot.subProviders] as const]
        : [],
    ),
  );
  const isSearching = searchQuery.trim().length > 0;
  const keyOf = (model: ModelPickerItem) => modelPickerModelKey(model.instanceId, model.slug);
  const isFavoriteModel = (model: ModelPickerItem) =>
    favoritesSet.has(providerModelKey(model.instanceId, model.slug));
  const pickableModels = flatModels.filter((model) => matchesLockedProvider(model));
  const modelByKey = new Map(flatModels.map((model) => [keyOf(model), model] as const));

  // Favorites lead, then every provider the thread can use, each as one group of the same list.
  const legacySectionByKey = new Map<string, { isExpanded: boolean }>();
  const subProviderSectionByKey = new Map<
    string,
    { name: string; unavailableReason: string | undefined; isExpanded: boolean }
  >();
  const subProviderModelCounts = new Map<string, number>();
  const groupSections = (() => {
    const out: Array<{
      id: ProviderInstanceId | "favorites";
      title: string;
      itemKeys: string[];
      setupEntry: ProviderInstanceEntry | null;
    }> = [];
    const favoriteModels = sortProviderModelItems(pickableModels.filter(isFavoriteModel), {
      instanceOrder: instanceEntries.map((entry) => entry.instanceId),
    });
    if (favoriteModels.length > 0) {
      out.push({
        id: "favorites",
        title: gt("Favorites"),
        itemKeys: favoriteModels.map((model) => FAVORITE_COPY_PREFIX + keyOf(model)),
        setupEntry: null,
      });
    }
    for (const entry of instanceEntries) {
      if (!isProviderInstancePickerVisible(entry) || !matchesLockedProvider(entry)) continue;
      const instanceId = entry.instanceId;
      const models = pickableModels.filter((model) => model.instanceId === instanceId);
      const itemKeys: string[] = [];
      const subProviders = subProvidersByInstance.get(instanceId);
      if (subProviders) {
        // A provider whose models run on several backends, such as fx, lists each backend as a
        // collapsible row inside its group.
        const { ungrouped, groups } = groupModelsBySubProvider(
          models,
          subProviders,
          (model) => model.subProvider,
        );
        itemKeys.push(...ungrouped.map(keyOf));
        for (const { subProvider, models: backendModels } of groups) {
          const key = modelPickerSubProviderSectionKey(instanceId, subProvider.name);
          const isExpanded = expandedSubProviderKeys.has(key);
          subProviderSectionByKey.set(key, {
            name: subProvider.name,
            unavailableReason: subProvider.unavailableReason,
            isExpanded,
          });
          itemKeys.push(key, ...(isExpanded ? backendModels.map(keyOf) : []));
          subProviderModelCounts.set(key, backendModels.length);
        }
      } else {
        const legacyModels = models.filter((model) => model.isLegacy && !isFavoriteModel(model));
        itemKeys.push(...models.filter((model) => !legacyModels.includes(model)).map(keyOf));
        if (legacyModels.length > 0) {
          const key = modelPickerLegacySectionKey(instanceId);
          const isExpanded = expandedLegacyInstances.has(instanceId);
          legacySectionByKey.set(key, { isExpanded });
          // The toggle trails the group, so expanding it reveals older models above it.
          itemKeys.push(...(isExpanded ? legacyModels.map(keyOf) : []), key);
        }
      }
      const setupEntry =
        canOpenProviderSetup &&
        shouldOfferModelPickerSetup(entry, modelOptionsByInstance.get(instanceId) ?? [])
          ? entry
          : null;
      if (itemKeys.length > 0 || setupEntry) {
        out.push({ id: instanceId, title: entry.displayName, itemKeys, setupEntry });
      }
    }
    return out;
  })();
  // BlueCode: a filter naming a group that is gone shows every group.
  const activeFilter = groupSections.some((section) => section.id === props.sectionFilter)
    ? (props.sectionFilter ?? null)
    : null;
  const sections = isSearching
    ? []
    : groupSections.filter((section) => activeFilter === null || section.id === activeFilter);
  const searchPool =
    activeFilter === null
      ? pickableModels
      : pickableModels.filter((model) =>
          activeFilter === "favorites" ? isFavoriteModel(model) : model.instanceId === activeFilter,
        );

  const searchResultKeys = isSearching
    ? rankModelPickerSearch(searchPool, searchQuery, (model) => ({
        name: model.name,
        ...(model.shortName ? { shortName: model.shortName } : {}),
        ...(model.subProvider ? { subProvider: model.subProvider } : {}),
        driverKind: model.driverKind,
        providerDisplayName: model.instanceDisplayName,
        isFavorite: isFavoriteModel(model),
      })).map(keyOf)
    : [];
  const sectionByHeaderKey = new Map(
    sections.map((section) => [SECTION_HEADER_PREFIX + section.id, section] as const),
  );
  const setupEntryByKey = new Map(
    sections.flatMap((section) =>
      section.setupEntry ? [[SETUP_ROW_PREFIX + section.id, section.setupEntry] as const] : [],
    ),
  );
  // Rows the list draws, headers included; the combobox only knows the rows it can highlight.
  const displayKeys = isSearching
    ? searchResultKeys
    : sections.flatMap((section) => [
        SECTION_HEADER_PREFIX + section.id,
        ...section.itemKeys,
        ...(section.setupEntry ? [SETUP_ROW_PREFIX + section.id] : []),
      ]);
  const filteredItemKeys = isSearching
    ? searchResultKeys
    : sections.flatMap((section) => section.itemKeys);
  const comboboxIndexByKey = new Map(filteredItemKeys.map((key, index) => [key, index] as const));
  const displayIndexByKey = new Map(displayKeys.map((key, index) => [key, index] as const));
  const allItemKeys = [
    ...flatModels.map(keyOf),
    ...flatModels.filter(isFavoriteModel).map((model) => FAVORITE_COPY_PREFIX + keyOf(model)),
    ...new Set(
      flatModels
        .filter((model) => model.isLegacy)
        .map((model) => modelPickerLegacySectionKey(model.instanceId)),
    ),
    ...[...subProvidersByInstance].flatMap(([instanceId, subProviders]) =>
      subProviders.map((subProvider) =>
        modelPickerSubProviderSectionKey(instanceId, subProvider.name),
      ),
    ),
  ];

  const [initialScrollIndex] = useState(() => {
    const section = sections.find((candidate) =>
      candidate.itemKeys.some((key) => modelKeyOfItem(key) === activeModelKey),
    );
    return section ? (displayIndexByKey.get(SECTION_HEADER_PREFIX + section.id) ?? 0) : 0;
  });

  const shownInstanceIds = new Set<string>(sections.map((section) => section.id));
  const updateRequiredNotices = instanceEntries.flatMap((entry) => {
    const shown = isSearching
      ? matchesLockedProvider(entry)
      : shownInstanceIds.has(entry.instanceId);
    const notice = shown
      ? formatProviderUpdateRequiredNotice(entry.snapshot, searchQuery, messages, locale)
      : null;
    return notice
      ? [
          {
            instanceId: entry.instanceId,
            notice,
            canUpdateInSettings: !providerUpdateChannelLags(entry.snapshot, searchQuery),
          },
        ]
      : [];
  });

  // A favorite listed twice takes one shortcut, on its first row.
  const modelJumpModelKeys = (() => {
    const labelled = new Set<string>();
    const keys: string[] = [];
    for (const key of filteredItemKeys) {
      if (keys.length === MODEL_PICKER_JUMP_KEYBINDING_COMMANDS.length) break;
      const modelKey = modelKeyOfItem(key);
      const model = modelByKey.get(modelKey);
      if (!model || labelled.has(modelKey)) continue;
      if (getModelDisabledReason?.(model.instanceId, model.slug)) continue;
      labelled.add(modelKey);
      keys.push(key);
    }
    return keys;
  })();
  const modelJumpLabelByKey = modelJumpLabelsByKey(
    modelJumpModelKeys,
    keybindings,
    props.terminalOpen,
  );
  const badgedInstanceIds = new Set(
    instanceEntries
      .filter((entry) => shouldShowInstanceBadge(entry, instanceEntries))
      .map((entry) => entry.instanceId),
  );
  const modelListExtraData = {
    badgedInstanceIds,
    favoritesSet,
    modelJumpLabelByKey,
    activeModelKey,
    selectedModelKeySet,
    comboboxIndexByKey,
  };
  const contentUnits = displayKeys.reduce(
    (units, key, index) =>
      units +
      (index > 0 ? ROW_SEPARATOR_UNITS : 0) +
      (sectionByHeaderKey.has(key)
        ? HEADER_UNITS
        : setupEntryByKey.has(key)
          ? SETUP_ROW_UNITS
          : ROW_UNITS),
    0,
  );

  const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.keyCode === 229 ||
      isCommandPaletteOpen()
    ) {
      return;
    }

    const command = resolveShortcutCommand(event, keybindings, {
      platform: navigator.platform,
      context: modelJumpShortcutContext,
    });
    if (command === "modelPicker.previousProvider" || command === "modelPicker.nextProvider") {
      event.preventDefault();
      event.stopPropagation();
      const direction = command === "modelPicker.nextProvider" ? 1 : -1;
      // BlueCode: a filter shows one group, so the shortcut moves the filter instead.
      if (activeFilter !== null && props.onSectionFilterChange) {
        const current = groupSections.findIndex((section) => section.id === activeFilter);
        const next =
          groupSections[(current + direction + groupSections.length) % groupSections.length]!;
        props.onSectionFilterChange(next.id);
        announce(next.title, "model-picker");
        return;
      }
      if (sections.length === 0) return;
      const highlightedKey = highlightedModelKeyRef.current;
      const current =
        sectionCursorRef.current ??
        (highlightedKey
          ? sections.findIndex((section) => section.itemKeys.includes(highlightedKey))
          : -1);
      const nextIndex =
        current < 0
          ? direction === 1
            ? 0
            : sections.length - 1
          : (current + direction + sections.length) % sections.length;
      const next = sections[nextIndex]!;
      sectionCursorRef.current = nextIndex;
      void modelListRef.current?.scrollToIndex({
        index: displayIndexByKey.get(SECTION_HEADER_PREFIX + next.id) ?? 0,
        animated: false,
        viewPosition: 0,
      });
      announce(next.title, "model-picker");
      return;
    }
    const jumpIndex = modelPickerJumpIndexFromCommand(command ?? "");
    if (jumpIndex === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const targetModelKey = modelJumpModelKeys[jumpIndex];
    if (!targetModelKey) {
      return;
    }
    const model = parseModelPickerModelKey(modelKeyOfItem(targetModelKey));
    if (!model) {
      return;
    }
    const selectedSlug = handleModelSelect(model.slug, model.instanceId);
    if (selectedSlug === null) return;
    const name = flatModels.find(
      (item) => item.slug === selectedSlug && item.instanceId === model.instanceId,
    )?.name;
    announce(gt("Model: {name}", { name: name ?? selectedSlug }), "model-picker");
  };

  return (
    <TooltipProvider delay={0}>
      <WindowKeyDownListener onKeyDown={onWindowKeyDown} />
      <div
        ref={pickerContentRef}
        className={cn(
          "relative flex w-screen max-w-80 flex-col overflow-hidden",
          props.docked
            ? "min-h-0 w-full max-w-none flex-1" // BlueCode: fills the docked panel
            : "max-h-86.5",
        )}
        // Docked, the popup sets the height; a minimum here would overflow short windows.
        style={
          props.docked
            ? undefined
            : isSearching
              ? { height: searchHeight }
              : {
                  minHeight: `min(calc(var(--spacing) * ${contentUnits + LIST_CHROME_UNITS} + 1px), calc(var(--spacing) * 86.5))`,
                }
        }
        data-model-picker-content="true"
      >
        <Combobox<string, boolean>
          inline
          items={allItemKeys}
          filteredItems={filteredItemKeys}
          filter={null}
          autoHighlight
          open
          virtualized
          multiple={onToggleModel !== undefined}
          value={onToggleModel ? [...selectedModelKeySet] : activeModelKey}
          onItemHighlighted={(modelKey, eventDetails) => {
            highlightedModelKeyRef.current = typeof modelKey === "string" ? modelKey : null;
            sectionCursorRef.current = null;
            const key = filteredItemKeys[eventDetails.index];
            const displayIndex = key === undefined ? undefined : displayIndexByKey.get(key);
            if (eventDetails.reason === "keyboard" && displayIndex !== undefined) {
              void modelListRef.current?.scrollIndexIntoView?.({
                index: displayIndex,
                animated: false,
              });
            }
          }}
          onValueChange={(value, details) => {
            const itemKey = Array.isArray(value)
              ? (value.find((key) => !selectedModelKeySet.has(modelKeyOfItem(key))) ??
                [...selectedModelKeySet].find((key) => !value.includes(key)))
              : value;
            if (typeof itemKey !== "string") {
              return;
            }
            activateItem(itemKey, "shiftKey" in details.event && details.event.shiftKey === true);
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ComboboxSearchInput
              ref={searchInputRef}
              placeholder={gt("Search models...")}
              value={searchQuery}
              onChange={(e) => {
                if (!isSearching) setSearchHeight(pickerContentRef.current?.offsetHeight ?? 0);
                setSearchQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) {
                  (e as typeof e & { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
                  e.stopPropagation();
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestClose?.();
                  return;
                }
                if (
                  props.onFocusEffort &&
                  e.key === "ArrowRight" &&
                  !e.altKey &&
                  !e.ctrlKey &&
                  !e.metaKey &&
                  !e.shiftKey &&
                  e.currentTarget.selectionStart === searchQuery.length
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  // The column shows the selected model's effort, so a highlighted model is picked
                  // first; the owning popup then moves focus to that model's levels.
                  const highlightedKey = highlightedModelKeyRef.current;
                  const highlighted = highlightedKey
                    ? parseModelPickerModelKey(modelKeyOfItem(highlightedKey))
                    : null;
                  const pickedNew =
                    highlighted !== null &&
                    modelKeyOfItem(highlightedKey ?? "") !== activeModelKey &&
                    handleModelSelect(highlighted.slug, highlighted.instanceId) !== null;
                  if (!pickedNew) props.onFocusEffort();
                  return;
                }
                if (e.key === "Enter" && highlightedModelKeyRef.current) {
                  (e as typeof e & { preventBaseUIHandler?: () => void }).preventBaseUIHandler?.();
                  e.preventDefault();
                  e.stopPropagation();
                  activateItem(highlightedModelKeyRef.current, e.shiftKey);
                  return;
                }
                e.stopPropagation();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            />
            {props.renderSectionTabs?.(groupSections, activeFilter)}

            <ModelPickerList
              // BlueCode: a new filter starts its list at the top.
              key={activeFilter ?? ""}
              listRef={modelListRef}
              itemKeys={displayKeys}
              extraData={modelListExtraData}
              initialScrollIndex={activeFilter === null ? initialScrollIndex : 0}
              renderItem={({ item: key }) => {
                const section = sectionByHeaderKey.get(key);
                if (section) {
                  return (
                    <ModelPickerSectionHeader
                      title={section.title}
                      first={displayIndexByKey.get(key) === 0}
                    />
                  );
                }
                const setupEntry = setupEntryByKey.get(key);
                if (setupEntry) {
                  return (
                    <ModelPickerSetupRow
                      entry={setupEntry}
                      onOpen={() => {
                        onRequestClose?.();
                        onOpenProviderSetup?.(setupEntry.instanceId);
                      }}
                    />
                  );
                }
                const index = comboboxIndexByKey.get(key) ?? -1;
                const legacySection = legacySectionByKey.get(key);
                if (legacySection) {
                  return (
                    <ComboboxItem
                      hideIndicator
                      index={index}
                      value={key}
                      aria-expanded={legacySection.isExpanded}
                      className="group w-full cursor-pointer"
                    >
                      <span className="text-sm leading-snug text-muted-foreground group-hover:text-foreground group-data-highlighted:text-foreground">
                        {legacySection.isExpanded
                          ? gt("Show less", { $context: "collapses the list of older models" })
                          : gt("Show more", { $context: "expands the list of older models" })}
                      </span>
                    </ComboboxItem>
                  );
                }
                const subProviderSection = subProviderSectionByKey.get(key);
                if (subProviderSection) {
                  const unavailable = subProviderSection.unavailableReason !== undefined;
                  return (
                    <ComboboxItem
                      hideIndicator
                      index={index}
                      value={key}
                      disabled={unavailable}
                      aria-expanded={unavailable ? undefined : subProviderSection.isExpanded}
                      className="group w-full cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="min-w-0 truncate text-sm font-normal leading-snug">
                            {subProviderSection.name}
                          </div>
                          {unavailable ? (
                            <Badge variant="outline" size="sm">
                              {gt("Unavailable", { $context: "backend cannot be used right now" })}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs font-normal leading-snug text-muted-foreground">
                          {subProviderSection.unavailableReason ??
                            gt("{count, plural, one {{count} model} other {{count} models}}", {
                              count: subProviderModelCounts.get(key) ?? 0,
                            })}
                        </div>
                      </div>
                      {unavailable ? null : (
                        <ChevronRightIcon
                          className={cn(
                            "size-4 shrink-0 transition-transform",
                            subProviderSection.isExpanded && "rotate-90",
                          )}
                        />
                      )}
                    </ComboboxItem>
                  );
                }
                const modelKey = modelKeyOfItem(key);
                const model = modelByKey.get(modelKey);
                if (!model) {
                  return null;
                }
                const disabledReason =
                  getModelDisabledReason?.(model.instanceId, model.slug) ?? null;
                return (
                  <ModelListRow
                    key={key}
                    itemValue={key}
                    index={index}
                    slug={model.slug}
                    name={model.name}
                    subProvider={model.subProvider}
                    instanceId={model.instanceId}
                    driverKind={model.driverKind}
                    providerDisplayName={model.instanceDisplayName}
                    providerAccentColor={model.instanceAccentColor}
                    acpRegistryAgentId={model.acpRegistryAgentId}
                    acpRegistryIconUrl={model.acpRegistryIconUrl}
                    isFavorite={isFavoriteModel(model)}
                    isSelected={
                      selectedModelKeys !== undefined
                        ? selectedModelKeySet.has(modelKey)
                        : modelKey === activeModelKey
                    }
                    favoriteStarOnHover={key !== modelKey}
                    showInstanceBadge={badgedInstanceIds.has(model.instanceId)}
                    showNewBadge={model.badge === "new"}
                    unavailable={model.isUnavailable === true}
                    jumpLabel={modelJumpLabelByKey.get(key) ?? null}
                    disabledReason={disabledReason}
                    onToggleFavorite={toggleFavorite}
                  />
                );
              }}
            />
            <ModelPickerProviderNotices
              updateRequiredNotices={updateRequiredNotices}
              emptyLabel={
                workspaceModelsScanning && !isSearching
                  ? gt("Searching project models...")
                  : gt("No models found")
              }
              onRequestClose={onRequestClose}
            />
            {props.listFooter}
          </div>
        </Combobox>
      </div>
    </TooltipProvider>
  );
});
