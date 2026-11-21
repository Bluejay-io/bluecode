import { Check } from "@untitledui/icons/Check";
import { X as LucideX } from "lucide-react-upstream";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { stroke, strokeWidthFor, VIEW_BOX } from "./untitledAdapter";

describe("strokeWidthFor", () => {
  it.each([
    // The default draws 2 on Lucide's 24 grid, scaled up to the inset viewBox.
    [undefined, 24, false, 2.25],
    [2, 16, false, 2.25],
    [1.5, 16, false, 1.6875],
    ["1.5", 16, false, 1.6875],
    // Absolute strokes keep their pixel width whatever the rendered size.
    [undefined, 12, true, 4.5],
    [2, 24, true, 2.25],
  ] as const)(
    "strokeWidth %s at size %s (absolute %s) draws %s",
    (width, size, absolute, drawn) => {
      expect(strokeWidthFor(width, size, absolute)).toBe(drawn);
    },
  );

  it("insets the 24 grid by 1.5 units", () => {
    expect(VIEW_BOX).toBe("-1.5 -1.5 27 27");
  });
});

describe("stroke", () => {
  it.each([
    ["Untitled", Check],
    ["Lucide", LucideX],
  ])("draws %s icons with the inset viewBox, scaled stroke, and Lucide's class", (_, Icon) => {
    const Drawn = stroke(Icon);
    const markup = renderToStaticMarkup(<Drawn className="size-4" />);
    expect(markup).toMatch(/class="[^"]*\blucide\b[^"]* size-4"/);
    expect(markup).toContain(`viewBox="${VIEW_BOX}"`);
    expect(markup).toContain('stroke-width="2.25"');
  });
});
