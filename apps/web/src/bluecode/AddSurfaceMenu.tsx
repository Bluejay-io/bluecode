import { useMessages } from "gt-react";
import { type KeyboardEvent, type ReactElement, useRef } from "react";

import { useBrowserDefaults } from "~/browser/browserDefaults";
import {
  type AddSurfaceActionsInput,
  addSurfaceActionsFor,
  surfaceShortcutActionForKey,
} from "~/components/RightPanelTabs";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuShortcut,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

export type AddSurfaceMenuSurfaces = AddSurfaceActionsInput & {
  readonly onAddBrowserInProfile: (profileId: string) => void;
};

/**
 * The panel's + menu as a menu on the panel toggle, which it renders as its trigger. The rows come
 * from RightPanelTabs' own list; only the trigger and focus handling are this menu's.
 */
export function AddSurfaceMenu(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly trigger: ReactElement;
  readonly surfaces: AddSurfaceMenuSurfaces;
}) {
  const messages = useMessages();
  const browserProfiles = useBrowserDefaults().profiles;
  const triggerRef = useRef<HTMLButtonElement>(null);
  // A picked surface takes focus in the panel; dismissing returns it to the toggle.
  const picked = useRef(false);
  const actions = addSurfaceActionsFor(props.surfaces, messages);
  type Action = (typeof actions)[number];

  const pick = (onClick: () => void) => {
    picked.current = true;
    props.onOpenChange(false);
    onClick();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = surfaceShortcutActionForKey(actions, event.nativeEvent);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    pick(action.onClick);
  };

  const row = (action: Action) => {
    const Icon = action.icon;
    if (action.label === "Browser" && action.available && browserProfiles.length > 1) {
      return (
        <MenuSub key={action.label}>
          <MenuSubTrigger className="[&>svg:last-child]:ms-0" aria-keyshortcuts={action.shortcut}>
            <Icon />
            {messages(action.label)}
            <MenuShortcut>{action.shortcut}</MenuShortcut>
          </MenuSubTrigger>
          <MenuSubPopup className="max-w-56">
            {browserProfiles.map((profile) => (
              <MenuItem
                key={profile.id}
                onClick={() => pick(() => props.surfaces.onAddBrowserInProfile(profile.id))}
              >
                <span className="min-w-0 truncate">{profile.name}</span>
              </MenuItem>
            ))}
          </MenuSubPopup>
        </MenuSub>
      );
    }
    const item = (
      <MenuItem
        key={action.label}
        className={action.available ? undefined : "data-disabled:pointer-events-auto"}
        disabled={!action.available}
        aria-keyshortcuts={action.shortcut}
        onClick={() => pick(action.onClick)}
      >
        <Icon />
        {messages(action.label)}
        <MenuShortcut>{action.shortcut}</MenuShortcut>
      </MenuItem>
    );
    if (action.available) return item;
    return (
      <Tooltip key={action.label}>
        <TooltipTrigger render={item} />
        <TooltipPopup side="left">{action.disabledReason}</TooltipPopup>
      </Tooltip>
    );
  };

  return (
    <Menu open={props.open} onOpenChange={props.onOpenChange}>
      <MenuTrigger ref={triggerRef} render={props.trigger} />
      <MenuPopup
        align="end"
        side="bottom"
        sideOffset={6}
        finalFocus={() => {
          const wasPicked = picked.current;
          picked.current = false;
          return wasPicked ? false : triggerRef.current;
        }}
        onKeyDownCapture={handleKeyDown}
        data-add-surface-menu
      >
        {actions.map(row)}
      </MenuPopup>
    </Menu>
  );
}
