import type { ContextMenuItem } from "@t3tools/contracts";
import {
  ArchiveIcon,
  CircleCheckIcon,
  ClockIcon,
  CopyIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderTreeIcon,
  GitBranchIcon,
  HashIcon,
  type LucideIcon,
  MailOpenIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RefreshCwIcon,
  SettingsIcon,
  TextSearchIcon,
  TimerIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";
import { Fragment } from "react";

import {
  MenuItem,
  MenuItemDetail,
  MenuItemLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "~/components/ui/menu";
import type { ThreadActionMenuId } from "~/components/threadActionMenu.logic";

// The icon names buildThreadActionMenuItems uses, as the native and fallback menus draw them.
const ICONS: Record<string, LucideIcon> = {
  archive: ArchiveIcon,
  "circle-check": CircleCheckIcon,
  clock: ClockIcon,
  copy: CopyIcon,
  folder: FolderIcon,
  "folder-plus": FolderPlusIcon,
  "folder-tree": FolderTreeIcon,
  "git-branch": GitBranchIcon,
  hash: HashIcon,
  "mail-open": MailOpenIcon,
  "message-square": MessageSquareIcon,
  "message-square-plus": MessageSquarePlusIcon,
  pencil: PencilIcon,
  pin: PinIcon,
  "pin-off": PinOffIcon,
  "refresh-cw": RefreshCwIcon,
  settings: SettingsIcon,
  "text-search": TextSearchIcon,
  timer: TimerIcon,
  trash: Trash2Icon,
  "user-plus": UserPlusIcon,
};

type Item = ContextMenuItem<ThreadActionMenuId>;

/**
 * The thread actions list drawn with the app's menu, row for row as the native menu shows it.
 */
export function ThreadActionsMenuItems(props: {
  readonly items: ReadonlyArray<Item>;
  readonly onSelect: (id: ThreadActionMenuId) => void;
}) {
  const { onSelect } = props;
  function row(item: Item) {
    const Icon = item.icon ? ICONS[item.icon] : undefined;
    const children = item.children ?? [];
    if (children.length > 0) {
      const checked = children.find((child) => child.checked === true);
      const isRadio = children.some((child) => typeof child.checked === "boolean");
      return (
        <MenuSub>
          <MenuSubTrigger disabled={item.disabled}>
            {Icon ? <Icon /> : null}
            <MenuItemLabel>{item.label}</MenuItemLabel>
          </MenuSubTrigger>
          <MenuSubPopup>
            {isRadio ? (
              <MenuRadioGroup value={checked?.id ?? null}>
                {children.map((child) => (
                  <MenuRadioItem
                    key={child.id}
                    value={child.id}
                    disabled={child.disabled}
                    closeOnClick
                    onClick={() => onSelect(child.id)}
                  >
                    {child.label}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            ) : (
              list(children)
            )}
          </MenuSubPopup>
        </MenuSub>
      );
    }
    return (
      <MenuItem
        variant={item.destructive ? "destructive" : "default"}
        disabled={item.disabled}
        aria-label={item.detail ? `${item.label}, ${item.detail}` : undefined}
        onClick={() => onSelect(item.id)}
      >
        {Icon ? <Icon /> : null}
        <MenuItemLabel>{item.label}</MenuItemLabel>
        {item.detail ? <MenuItemDetail>{item.detail}</MenuItemDetail> : null}
      </MenuItem>
    );
  }
  function list(items: ReadonlyArray<Item>) {
    return items.map((item, index) => (
      <Fragment key={item.id}>
        {item.separatorBefore && index > 0 ? <MenuSeparator /> : null}
        {row(item)}
      </Fragment>
    ));
  }
  return list(props.items);
}
