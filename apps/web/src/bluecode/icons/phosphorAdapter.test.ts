import { describe, expect, it } from "vite-plus/test";
import { translateClassName, weightFor } from "./phosphorAdapter";

describe("translateClassName", () => {
  it("keeps Lucide class names meaning the same thing on Phosphor icons", () => {
    for (const [input, expected] of [
      ["size-4", { className: "size-4", color: undefined, strokeWidth: undefined, fill: false }],
      [
        "size-3 stroke-muted-foreground",
        {
          className: "size-3",
          color: "var(--color-muted-foreground)",
          strokeWidth: undefined,
          fill: false,
        },
      ],
      [
        "stroke-current/22",
        {
          className: "",
          color: "color-mix(in oklab, var(--color-current) 22%, transparent)",
          strokeWidth: undefined,
          fill: false,
        },
      ],
      ["size-4 stroke-2", { className: "size-4", color: undefined, strokeWidth: "2", fill: false }],
      ["stroke-[1.75]", { className: "", color: undefined, strokeWidth: "1.75", fill: false }],
      [
        "fill-current text-warning",
        { className: "text-warning", color: undefined, strokeWidth: undefined, fill: true },
      ],
      [
        "fill-background stroke-2",
        { className: "", color: undefined, strokeWidth: "2", fill: true },
      ],
      [
        "fill-none",
        { className: "fill-none", color: undefined, strokeWidth: undefined, fill: false },
      ],
      [
        "fill-current stroke-(--glass) [paint-order:stroke]",
        {
          className: "stroke-(--glass) [paint-order:stroke]",
          color: undefined,
          strokeWidth: undefined,
          fill: true,
        },
      ],
    ] as const) {
      expect(translateClassName(input), input).toEqual(expected);
    }
  });
});

describe("weightFor", () => {
  it("maps Lucide stroke widths onto Phosphor weights", () => {
    for (const [width, weight] of [
      [undefined, "regular"],
      ["0.5", "thin"],
      [1.5, "light"],
      [2, "regular"],
      [2.25, "regular"],
      [3, "bold"],
    ] as const) {
      expect(weightFor(width, "regular"), String(width)).toBe(weight);
    }
  });
});
