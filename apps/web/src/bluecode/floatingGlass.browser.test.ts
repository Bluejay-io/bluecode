import { expect, it } from "vite-plus/test";

import "~/index.css";
import "~/bluecode/menus.css";
import "~/bluecode/model-card.css";

function probe(attributes: Record<string, string>) {
  const element = document.createElement("div");
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  return Object.assign(element, { [Symbol.dispose]: () => element.remove() });
}

// Sets the Appearance glass setting as appInit applies it: no blur once the glass is solid.
function glassSetting() {
  const root = document.documentElement.style;
  return {
    set(percent: number) {
      root.setProperty("--glass-opacity", `${percent}%`);
      if (percent === 100) root.setProperty("--glass-blur", "0px");
      else root.removeProperty("--glass-blur");
    },
    [Symbol.dispose]() {
      root.removeProperty("--glass-opacity");
      root.removeProperty("--glass-blur");
    },
  };
}

// Chromium serializes a color-mix() result as color(srgb r g b / a), dropping a = 1.
const fillAlpha = (element: Element) =>
  Number(/\/\s*([\d.]+)\)$/.exec(getComputedStyle(element).backgroundColor)?.[1] ?? 1);

it("fills floating glass from the glass setting, solid at 100%", () => {
  using glass = glassSetting();
  using menu = probe({ class: "dropdown-glass" });
  using dialog = probe({ class: "dialog-glass" });
  using picker = probe({ class: "dropdown-glass", "data-model-picker-card": "" });

  for (const percent of [40, 80, 100]) {
    glass.set(percent);
    const g = percent / 100;
    expect(fillAlpha(menu)).toBeCloseTo(0.18 + 0.82 * g, 2);
    expect(fillAlpha(dialog)).toBeCloseTo(g, 2);
    expect(fillAlpha(picker)).toBeCloseTo(0.72 + 0.28 * g, 2);
  }
  expect(getComputedStyle(menu).backdropFilter).toContain("blur(0px)");
});

it("ignores a theme surface colour's own alpha", () => {
  using glass = glassSetting();
  glass.set(80);
  using menu = probe({ class: "dropdown-glass", style: "--popover: rgb(10 20 30 / 50%)" });

  expect(fillAlpha(menu)).toBeCloseTo(0.18 + 0.82 * 0.8, 2);
});
