// Desktop-width layout: the app's content sits in a rounded card inset from the window,
// framed by the sidebar's colour. The fixed titlebar controls move with the card (inset + border).
// The edge is a border, not an outer shadow: the fixed sidebar paints over anything outside the
// card's left side.
export const BLUECODE_CARD_FRAME_CLASS =
  "md:bg-(--app-frame) md:surface-grain md:py-2 md:pr-2 md:data-[sidebar-state=collapsed]:pl-2";

// Inside the card, window-anchored controls read the shifted offsets; card-anchored (absolute)
// ones subtract --bluecode-card-inset to get back to the card's own corner.
export const BLUECODE_CARD_CLASS =
  "md:h-auto! md:overflow-hidden md:rounded-xl md:border md:border-border md:[--bluecode-card-inset:calc(0.5rem+0.5px)] md:[--workspace-controls-top:calc(0.5rem+0.5px)] md:[--workspace-controls-right:calc(env(safe-area-inset-right)+1.25rem+0.5px)]";
