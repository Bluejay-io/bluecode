import { useGT } from "gt-react";
import { FolderPlusIcon, SearchIcon, SquarePenIcon } from "lucide-react";
import { type ComponentProps, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { cn } from "~/lib/utils";
import { SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SidebarThreadHeaderProps {
  /** BlueCode: the mark that leads the row, as in Capy's sidebar. */
  brand: ReactNode;
  hasProjects: boolean;
  projectScope: ReactNode;
  onNewProject: () => void;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  newThreadInProjectShortcutLabel: string | null | undefined;
  showNewThreadInProjectHint: boolean;
}

export function SidebarThreadHeader({
  brand,
  hasProjects,
  projectScope,
  onNewProject,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  newThreadInProjectShortcutLabel,
  showNewThreadInProjectHint,
}: SidebarThreadHeaderProps) {
  const gt = useGT();
  const newThreadLabel = newThreadShortcutLabel
    ? gt("New thread ({shortcut})", { shortcut: newThreadShortcutLabel })
    : gt("New thread");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-9 items-center gap-1 pl-1.5">
        {brand}
        <div className="ml-auto flex shrink-0 items-center">
          {/* BlueCode: search opens the command palette, as Capy's does. */}
          <SidebarHeaderIconButton
            label={gt("Search threads")}
            onClick={() => openCommandPalette()}
          >
            <SearchIcon />
          </SidebarHeaderIconButton>
          {hasProjects ? (
            <>
              {projectScope}
              <SidebarHeaderIconButton label={gt("Add project")} onClick={onNewProject}>
                <FolderPlusIcon />
              </SidebarHeaderIconButton>
            </>
          ) : null}
          <SidebarHeaderIconButton
            label={gt("New thread")}
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
          </SidebarHeaderIconButton>
        </div>
      </div>
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
