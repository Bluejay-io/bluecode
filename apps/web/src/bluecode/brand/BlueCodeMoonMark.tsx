import { useId } from "react";

import { cn } from "~/lib/utils";

const SIZE = 28;
const CENTER = 14;
const RADIUS = 13;
// The small app icon's three bands (assets/bluecode/generate-moon-icons.py), on whole and half
// pixels so the cuts stay crisp at 1x and 2x.
const SLICES = [
  [CENTER - RADIUS, 15],
  [16, 20],
  [21.5, 23.5],
  [25.5, CENTER + RADIUS],
] as const;

function halfWidth(y: number) {
  return Math.sqrt(Math.max(0, RADIUS * RADIUS - (y - CENTER) * (y - CENTER)));
}

const MOON_PATH = SLICES.map(([top, bottom]) => {
  const a = halfWidth(top);
  const b = halfWidth(bottom);
  return (
    `M${CENTER - a} ${top}H${CENTER + a}A${RADIUS} ${RADIUS} 0 0 1 ${CENTER + b} ${bottom}` +
    `H${CENTER - b}A${RADIUS} ${RADIUS} 0 0 1 ${CENTER - a} ${top}Z`
  );
}).join("");

/**
 * BlueCode's mark: the app icon's striped moon without its tile. `accent` shades it in the theme's
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
  const gradientId = useId();
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      data-bluecode-moon={tone}
      className={cn("shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={CENTER - RADIUS}
          x2="0"
          y2={CENTER + RADIUS}
        >
          <stop offset="0" style={{ stopColor: "var(--bluecode-moon-lit)" }} />
          <stop offset="1" style={{ stopColor: "var(--bluecode-moon-mid)" }} />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradientId})`} d={MOON_PATH} />
    </svg>
  );
}
