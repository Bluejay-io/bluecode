import type { KeybindingCommand } from "@t3tools/contracts";

import type { RightPanelSurface } from "../rightPanelStore";

// A right panel tab holds one terminal: "+" adds one and closing the tab closes it, so BlueCode
// offers no split panes. Unbinding the split shortcuts also hands Ctrl+D (EOF) back to the shell.
const TERMINAL_SPLIT_COMMANDS: ReadonlySet<KeybindingCommand> = new Set([
  "terminal.split",
  "terminal.splitVertical",
]);

export function isTerminalSplitCommand(command: KeybindingCommand): boolean {
  return TERMINAL_SPLIT_COMMANDS.has(command);
}

export function withoutTerminalSplitBindings<T extends { readonly command: KeybindingCommand }>(
  bindings: ReadonlyArray<T>,
): T[] {
  return bindings.filter((binding) => !isTerminalSplitCommand(binding.command));
}

/** A tab saved with split panes reopens as one tab per pane, so no running session is hidden. */
export function oneTerminalPerTab(surface: RightPanelSurface): RightPanelSurface[] {
  if (surface.kind !== "terminal" || surface.terminalIds.length <= 1) return [surface];
  return surface.terminalIds.map((terminalId) => ({
    id: `terminal:${terminalId}`,
    kind: "terminal",
    resourceId: terminalId,
    terminalIds: [terminalId],
    activeTerminalId: terminalId,
  }));
}

/** A selected split tab reopens on the tab for the pane that was active inside it. */
export function selectedTerminalTab(
  savedSurfaces: unknown,
  migratedSurfaces: ReadonlyArray<RightPanelSurface>,
  savedSurfaceId: string | null | undefined,
): string | null | undefined {
  const saved = Array.isArray(savedSurfaces)
    ? savedSurfaces.find(
        (surface): surface is Record<string, unknown> =>
          !!surface && typeof surface === "object" && surface.id === savedSurfaceId,
      )
    : undefined;
  if (saved?.kind !== "terminal" || typeof saved.activeTerminalId !== "string") {
    return savedSurfaceId;
  }
  const tabId = `terminal:${saved.activeTerminalId}`;
  return migratedSurfaces.some((surface) => surface.id === tabId) ? tabId : savedSurfaceId;
}
