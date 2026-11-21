// Desktop widths, after Codex: the card runs flush to the window's top, right and bottom; beside the
// open sidebar its hairline left edge curves into the top and bottom. Closed, it fills the window.
// The edge is drawn in theme.css (.bluecode-card-edge) so it curves evenly into the top and bottom.
export const BLUECODE_CARD_FRAME_CLASS = "md:bg-(--app-frame) md:surface-grain";

export const BLUECODE_CARD_CLASS =
  "md:h-auto! md:overflow-hidden md:rounded-l-(--bluecode-composer-radius) bluecode-card-edge md:group-data-[sidebar-state=collapsed]/sidebar-wrapper:rounded-none";
