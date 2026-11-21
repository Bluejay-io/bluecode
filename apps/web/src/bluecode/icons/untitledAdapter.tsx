import {
  forwardRef,
  type ComponentType,
  type ForwardRefExoticComponent,
  type RefAttributes,
  type SVGProps,
} from "react";

export interface LucideProps
  extends RefAttributes<SVGSVGElement>, Partial<SVGProps<SVGSVGElement>> {
  size?: string | number;
  absoluteStrokeWidth?: boolean;
}

export type LucideIcon = ForwardRefExoticComponent<
  Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
>;

// Untitled types `color` without `| undefined`; the adapter passes `stroke` instead.
type StrokeIcon = ComponentType<Omit<SVGProps<SVGSVGElement>, "color">>;

const DEFAULT_STROKE_WIDTH = 2;
// Untitled and Lucide draw almost edge to edge on their 24 grid; Capy's icons sit about 1.5 units
// in. Widening the viewBox gives the same air, and the stroke grows by the same factor so lines
// still render at a 2-on-24 weight.
const INSET = 1.5;
const VIEW = 24 + INSET * 2;
export const VIEW_BOX = `${-INSET} ${-INSET} ${VIEW} ${VIEW}`;

// Lucide's rule: an absolute stroke keeps its width in pixels whatever size the icon renders at.
export function strokeWidthFor(
  strokeWidth: string | number | undefined,
  size: string | number,
  absolute: boolean,
): number {
  const width = Number(strokeWidth ?? DEFAULT_STROKE_WIDTH);
  return ((absolute ? (width * 24) / Number(size) : width) * VIEW) / 24;
}

/**
 * Draws a 24-grid stroke icon (Untitled UI, or a Lucide fallback) behind Lucide's props. Both draw
 * with stroke and fill on the root svg, so `stroke-*` and `fill-*` classes keep their meaning.
 */
export function stroke(Icon: StrokeIcon): LucideIcon {
  const component = forwardRef<SVGSVGElement, Omit<LucideProps, "ref">>(function StrokeIcon(
    { size = 24, color = "currentColor", strokeWidth, absoluteStrokeWidth, className, ...props },
    ref,
  ) {
    return (
      <Icon
        ref={ref}
        width={size}
        height={size}
        stroke={color}
        viewBox={VIEW_BOX}
        strokeWidth={strokeWidthFor(strokeWidth, size, absoluteStrokeWidth === true)}
        // CSS written for Lucide targets svg.lucide.
        className={className ? `lucide ${className}` : "lucide"}
        {...props}
      />
    );
  });
  component.displayName = Icon.displayName;
  return component;
}
