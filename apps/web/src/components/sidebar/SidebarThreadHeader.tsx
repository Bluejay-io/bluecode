import { useGT } from "gt-react";
import { SearchIcon, SquarePenIcon } from "lucide-react";
import { type ComponentProps, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SidebarHeaderActionsProps {
  onBackdrop: boolean;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  newThreadInProjectShortcutLabel: string | null | undefined;
  showNewThreadInProjectHint: boolean;
}

/** BlueCode: Capy's titlebar actions, Search and New thread, just before the sidebar toggle. */
export function SidebarHeaderActions({
  onBackdrop,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  newThreadInProjectShortcutLabel,
  showNewThreadInProjectHint,
}: SidebarHeaderActionsProps) {
  const gt = useGT();
  const newThreadLabel = newThreadShortcutLabel
    ? gt("New thread ({shortcut})", { shortcut: newThreadShortcutLabel })
    : gt("New thread");

  return (
    <>
      {/* BlueCode: search opens the command palette, as Capy's does. */}
      <SidebarTitlebarButton
        label={gt("Search threads")}
        onBackdrop={onBackdrop}
        onClick={() => openCommandPalette()}
      >
        <SearchIcon />
      </SidebarTitlebarButton>
      <SidebarTitlebarButton
        label={gt("New thread")}
        onBackdrop={onBackdrop}
        tooltip={
          showNewThreadInProjectHint ? (
            <span className="flex flex-col gap-0.5">
              <span>{newThreadLabel}</span>
              <span className="text-muted-foreground">
                {newThreadInProjectShortcutLabel
                  ? gt("New thread in current project: Shift+click ({shortcut})", {
                      shortcut: newThreadInProjectShortcutLabel,
                    })
                  : gt("New thread in current project: Shift+click")}
              </span>
            </span>
          ) : (
            newThreadLabel
          )
        }
        disabled={newThreadDisabled}
        onClick={onNewThread}
      >
        <SquarePenIcon />
      </SidebarTitlebarButton>
    </>
  );
}

/** An icon button in the sidebar's titlebar row, styled like the toggle and history buttons beside it. */
function SidebarTitlebarButton({
  label,
  tooltip = label,
  onBackdrop,
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  onBackdrop: boolean;
} & Omit<ComponentProps<typeof Button>, "aria-label" | "size" | "variant">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className={cn(
              "[-webkit-app-region:no-drag]",
              onBackdrop && "relative top-auto translate-y-0",
              className,
            )}
            size="icon-sm"
            variant={onBackdrop ? "media-navigation" : "ghost"}
            {...rest}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}

export interface SidebarThreadHeaderProps {
  /** On desktop the window controls hold the titlebar's corner, so the mark leads this row. */
  brand: ReactNode;
  hasProjects: boolean;
  /** The project filter, shown only when there are projects to filter by. */
  projectScope: ReactNode;
  /** A filter is applied, so its control stays in view instead of waiting for hover. */
  projectScopeActive: boolean;
}

/**
 * BlueCode: Capy's quiet "Threads" section row. The project filter sits at its end and shows on
 * hover or focus, unless a filter is applied.
 */
export function SidebarThreadHeader({
  brand,
  hasProjects,
  projectScope,
  projectScopeActive,
}: SidebarThreadHeaderProps) {
  const gt = useGT();
  if (!brand && !hasProjects) return null;
  return (
    <div
      data-sidebar-threads-header
      className={cn("group/threads-header flex items-center gap-1 pl-1.5", brand ? "h-9" : "h-7")}
    >
      {brand ?? (
        <span className="truncate px-0.5 text-xs font-medium text-sidebar-muted-foreground">
          {gt("Threads")}
        </span>
      )}
      {hasProjects ? (
        <div
          className={cn(
            "ml-auto flex shrink-0 items-center transition-opacity",
            !projectScopeActive &&
              "pointer-fine:opacity-0 pointer-fine:group-hover/threads-header:opacity-100 pointer-fine:focus-within:opacity-100 pointer-fine:has-[[data-popup-open]]:opacity-100",
          )}
        >
          {projectScope}
        </div>
      ) : null}
    </div>
  );
}

export function SidebarHeaderIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn("relative size-7 shrink-0", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
