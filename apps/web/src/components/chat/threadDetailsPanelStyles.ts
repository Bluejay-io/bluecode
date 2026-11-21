const THREAD_DETAILS_PANEL_RESTING_BUTTON_SURFACE_CLASS = "bg-transparent shadow-none";

// BlueCode: rows take the menus' hover fill (bluecode/menus.css).
const THREAD_DETAILS_PANEL_HOVER_SURFACE_CLASS =
  "hover:!bg-(--popover-hover) data-pressed:!bg-(--popover-hover)";

const THREAD_DETAILS_PANEL_ROW_SURFACE_CLASS = `${THREAD_DETAILS_PANEL_RESTING_BUTTON_SURFACE_CLASS} ${THREAD_DETAILS_PANEL_HOVER_SURFACE_CLASS}`;
// BlueCode: split segments and selects take their states from bluecode/thread-details.css.
const THREAD_DETAILS_PANEL_SPLIT_BUTTON_SURFACE_CLASS =
  THREAD_DETAILS_PANEL_RESTING_BUTTON_SURFACE_CLASS;

// BlueCode: rows are 28px with an 8px inset and gap, 6px corners, 13px text at 450, 14px icons.
export const THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS = "gap-2 px-2 text-left";

export const THREAD_DETAILS_PANEL_LABEL_CLASS =
  "ml-0 [text-box:trim-both_cap_alphabetic] overflow-x-clip overflow-y-visible";

const THREAD_DETAILS_PANEL_CONTROL_CLASS = `h-7 min-w-0 rounded-md border-transparent ${THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS} text-[13px] font-normal text-foreground/80`;

export const THREAD_DETAILS_PANEL_ROW_CLASS = `${THREAD_DETAILS_PANEL_CONTROL_CLASS} w-full justify-start ${THREAD_DETAILS_PANEL_ROW_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_SELECT_ROW_CLASS = `${THREAD_DETAILS_PANEL_CONTROL_CLASS} w-full justify-start ${THREAD_DETAILS_PANEL_SPLIT_BUTTON_SURFACE_CLASS} gap-0 px-0 [&_[data-slot=select-icon]]:-me-px [&_[data-slot=select-icon]]:flex [&_[data-slot=select-icon]]:h-full [&_[data-slot=select-icon]]:w-7 [&_[data-slot=select-icon]]:shrink-0 [&_[data-slot=select-icon]]:items-center [&_[data-slot=select-icon]]:justify-center [&_[data-slot=select-icon]>svg]:me-0 [&_[data-slot=select-icon]>svg]:size-3.5 [&_[data-slot=select-icon]>svg]:text-(--muted-foreground-3) [&_[data-slot=select-icon]>svg]:opacity-100`;

export const THREAD_DETAILS_PANEL_SELECT_LABEL_CLASS = `flex h-full min-w-0 flex-1 items-center ${THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS}`;

export const THREAD_DETAILS_PANEL_LOCKED_ROW_CLASS = `h-7 w-full min-w-0 justify-start rounded-md border border-transparent ${THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS} text-[13px] font-normal text-foreground/80 sm:h-7 sm:text-[13px]`;

export const THREAD_DETAILS_PANEL_ICON_CLASS = "size-3.5 shrink-0 text-icon-muted";

export const THREAD_DETAILS_PANEL_CHEVRON_CLASS = "size-3.5 shrink-0 text-(--muted-foreground-3)";

export const THREAD_DETAILS_PANEL_ICON_ACTION_CLASS = `size-6 justify-center rounded-md border-transparent bg-transparent p-0 sm:size-6 ${THREAD_DETAILS_PANEL_ROW_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_META_ACTION_CLASS = `h-6 gap-1 rounded-md border-transparent px-1.5 text-xs font-medium text-muted-foreground ${THREAD_DETAILS_PANEL_ROW_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS =
  "group/details-split flex w-full items-center rounded-md";

export const THREAD_DETAILS_PANEL_SPLIT_PRIMARY_CLASS = `${THREAD_DETAILS_PANEL_CONTROL_CLASS} flex-1 justify-start rounded-e-none ${THREAD_DETAILS_PANEL_SPLIT_BUTTON_SURFACE_CLASS}`;

export const THREAD_DETAILS_PANEL_SPLIT_SECONDARY_CLASS = `${THREAD_DETAILS_PANEL_CONTROL_CLASS} h-auto min-h-7 w-7 self-stretch justify-center rounded-s-none px-0 ${THREAD_DETAILS_PANEL_SPLIT_BUTTON_SURFACE_CLASS}`;

// BlueCode: a resting hairline marks the split until a segment's own fill edges it.
export const THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS =
  "h-4 w-px shrink-0 bg-(--border-1) group-has-[[data-details-part]:is(:hover,:active,[aria-haspopup][aria-expanded=true]):not(:disabled,[aria-disabled=true])]/details-split:bg-transparent";
