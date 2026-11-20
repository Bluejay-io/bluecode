import { cn } from "~/lib/utils";

import { MOON_MARK_SIZE, moonLayers } from "./moonCells";

/**
 * BlueCode's mark: the app icon's dithered moon without its tile. `accent` shades it in the theme's
 * accent color; `current` in the surrounding text color, for icon rows.
 */
export function BlueCodeMoonMark({
  className,
  tone = "accent",
  label = "BlueCode",
}: {
  className?: string;
  tone?: "accent" | "current";
  /** Accessible name; pass null where a parent already names it. */
  label?: string | null;
}) {
  const layers = moonLayers();
  return (
    <svg
      viewBox={`0 0 ${MOON_MARK_SIZE} ${MOON_MARK_SIZE}`}
      shapeRendering="crispEdges"
      data-bluecode-moon={tone}
      className={cn("shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path fill="var(--bluecode-moon-shadow)" d={layers.shadow} />
      <path fill="var(--bluecode-moon-mid)" d={layers.mid} />
      <path fill="var(--bluecode-moon-lit)" d={layers.lit} />
    </svg>
  );
}
