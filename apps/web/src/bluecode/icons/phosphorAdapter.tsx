import {
  forwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type SVGProps,
} from "react";
import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";

export interface LucideProps
  extends RefAttributes<SVGSVGElement>, Partial<SVGProps<SVGSVGElement>> {
  size?: string | number;
  absoluteStrokeWidth?: boolean;
}

export type LucideIcon = ForwardRefExoticComponent<
  Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
>;

interface PhosphorOptions {
  readonly mirrored?: boolean;
  readonly weight?: IconWeight;
}

// Lucide icons are strokes; Phosphor icons are fills. Class names written for Lucide are
// translated so they keep their meaning: a stroke colour becomes the icon colour, a stroke
// width picks a weight, and a fill class (Lucide's "filled" look) picks the fill weight.
const STROKE_WIDTH = /^stroke-(?:\[(\d*\.?\d+)(?:px)?\]|(\d*\.?\d+))$/;

interface Translated {
  readonly className: string | undefined;
  readonly color: string | undefined;
  readonly strokeWidth: string | undefined;
  readonly fill: boolean;
}

export function translateClassName(className: string | undefined): Translated {
  if (className === undefined || !/\b(?:stroke|fill)-/.test(className)) {
    return { className, color: undefined, strokeWidth: undefined, fill: false };
  }
  let color: string | undefined;
  let strokeWidth: string | undefined;
  let fill = false;
  const kept: string[] = [];
  for (const token of className.split(/\s+/)) {
    const width = STROKE_WIDTH.exec(token);
    if (width !== null) {
      strokeWidth = width[1] ?? width[2];
    } else if (token === "stroke-current") {
      // Phosphor already draws in the current colour.
    } else if (/^stroke-[a-z]/.test(token)) {
      const [name, alpha] = token.slice("stroke-".length).split("/");
      color =
        alpha === undefined
          ? `var(--color-${name})`
          : `color-mix(in oklab, var(--color-${name}) ${alpha}%, transparent)`;
    } else if (/^fill-(?!none$|transparent$)/.test(token)) {
      fill = true;
    } else if (token !== "") {
      kept.push(token);
    }
  }
  return { className: kept.join(" "), color, strokeWidth, fill };
}

// At 24px Phosphor's weights draw roughly 0.75 (thin), 1.1 (light), 1.5 (regular) and
// 2.25px (bold) lines; Lucide's default 2 renders at 1.75 here (see index.css).
export function weightFor(
  strokeWidth: string | number | undefined,
  fallback: IconWeight,
): IconWeight {
  const width = Number(strokeWidth);
  if (strokeWidth === undefined || Number.isNaN(width)) return fallback;
  if (width <= 1) return "thin";
  if (width < 1.75) return "light";
  if (width < 2.5) return "regular";
  return "bold";
}

export function phosphor(Icon: PhosphorIcon, options: PhosphorOptions = {}): LucideIcon {
  const component = forwardRef<SVGSVGElement, Omit<LucideProps, "ref">>(function PhosphorLucide(
    {
      size = 24,
      color = "currentColor",
      strokeWidth,
      absoluteStrokeWidth: _absolute,
      className,
      style,
      ...props
    },
    ref,
  ) {
    const translated = translateClassName(className);
    const fallback = options.weight ?? "regular";
    return (
      <Icon
        ref={ref}
        size={size}
        color={color}
        weight={
          translated.fill ? "fill" : weightFor(strokeWidth ?? translated.strokeWidth, fallback)
        }
        mirrored={options.mirrored ?? false}
        className={translated.className}
        style={translated.color === undefined ? style : { color: translated.color, ...style }}
        {...props}
      />
    );
  });
  component.displayName = Icon.displayName;
  return component;
}
