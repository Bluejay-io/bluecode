import { useEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

import { DITHER_CELL_PX, type Rgb, ditherWallpaper, wallpaperRamp } from "./wallpaperDither";
import {
  commitWallpaperPaint,
  createWallpaperScheduler,
  requestWallpaperPaint,
} from "./wallpaperPaint";

// Literal URLs so Vite emits each photo as its own asset; only the active theme's is fetched.
const WALLPAPERS: Readonly<Record<string, URL>> = {
  absolutely: new URL("./wallpapers/absolutely.webp", import.meta.url),
  "bearded-oled": new URL("./wallpapers/bearded-oled.webp", import.meta.url),
  catppuccin: new URL("./wallpapers/catppuccin.webp", import.meta.url),
  codex: new URL("./wallpapers/codex.webp", import.meta.url),
  "crimson-evernight": new URL("./wallpapers/crimson-evernight.webp", import.meta.url),
  everforest: new URL("./wallpapers/everforest.webp", import.meta.url),
  firecrawl: new URL("./wallpapers/firecrawl.webp", import.meta.url),
  github: new URL("./wallpapers/github.webp", import.meta.url),
  gruvbox: new URL("./wallpapers/gruvbox.webp", import.meta.url),
  hub: new URL("./wallpapers/hub.webp", import.meta.url),
  linear: new URL("./wallpapers/linear.webp", import.meta.url),
  notion: new URL("./wallpapers/notion.webp", import.meta.url),
  one: new URL("./wallpapers/one.webp", import.meta.url),
};
const DEFAULT_WALLPAPER = new URL("./wallpapers/default.webp", import.meta.url);
const MAX_ROWS = 256;
const RESIZE_DEBOUNCE_MS = 150;

const decoded = new Map<string, Promise<HTMLImageElement>>();
// Decoded photos, so a light/dark switch repaints within the frame that shows the new theme.
const ready = new Map<string, HTMLImageElement>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let image = decoded.get(url);
  if (!image) {
    const element = new Image();
    element.src = url;
    image = element.decode().then(() => {
      ready.set(url, element);
      return element;
    });
    decoded.set(url, image);
    image.catch(() => decoded.delete(url));
  }
  return image;
}

/** A still photo for the active theme, dithered into its page, accent, and text colours. */
export function PhotoBackdrop({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- paints a canvas from the box size and the root's theme
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!host || !canvas || !context || !probe) return;
    const root = document.documentElement;
    let disposed = false;
    const paints = { painted: "", latest: 0 };
    let resizeTimer = 0;

    // Canvas parses any CSS colour the theme uses, oklch and custom themes included.
    const resolveColor = (variable: string): Rgb => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = "#000";
      probe.fillStyle = getComputedStyle(host).getPropertyValue(variable).trim() || "#000";
      probe.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0] = probe.getImageData(0, 0, 1, 1).data;
      return [red, green, blue];
    };

    const paint = () => {
      const url = (WALLPAPERS[root.dataset.themeId ?? ""] ?? DEFAULT_WALLPAPER).href;
      const ratio = window.devicePixelRatio || 1;
      // Whole device pixels per cell keep every cell the same size when scaled up.
      const cellPx = Math.max(1, Math.round(DITHER_CELL_PX * ratio)) / ratio;
      // Painted for the whole window and pinned to the right edge, so opening or closing the
      // sidebar only uncovers more of the same picture instead of rescaling it.
      const columns = Math.ceil(Math.max(window.innerWidth, host.clientWidth) / cellPx);
      const rows = Math.min(MAX_ROWS, Math.ceil(host.clientHeight / cellPx));
      if (columns === 0 || rows === 0) return;
      const dark = root.classList.contains("dark");
      const ramp = wallpaperRamp(
        resolveColor("--background"),
        resolveColor("--primary"),
        resolveColor("--foreground"),
        dark,
      );
      const key = `${url} ${columns}x${rows} ${cellPx} ${dark} ${ramp.join(" ")}`;
      const generation = requestWallpaperPaint(paints, key);
      if (generation === null) {
        canvas.dataset.shown = "";
        return;
      }
      const draw = (image: HTMLImageElement) => {
        if (disposed || !commitWallpaperPaint(paints, generation, key)) return;
        drawWallpaper(image, columns, rows, cellPx, ramp, dark);
        canvas.dataset.shown = "";
      };
      const image = ready.get(url);
      if (image) {
        draw(image);
        return;
      }
      // The old paint belongs to the previous theme, so it must not sit over this one while the
      // photo decodes; the new one fades in when it lands.
      delete canvas.dataset.shown;
      loadImage(url).then(draw, () => {});
    };

    const drawWallpaper = (
      image: HTMLImageElement,
      columns: number,
      rows: number,
      cellPx: number,
      ramp: ReadonlyArray<Rgb>,
      dark: boolean,
    ) => {
      const scale = Math.max(columns / image.naturalWidth, rows / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const sample = document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      });
      if (!sample) return;
      sample.canvas.width = columns;
      sample.canvas.height = rows;
      sample.drawImage(image, (columns - width) / 2, (rows - height) / 2, width, height);
      const source = sample.getImageData(0, 0, columns, rows).data;
      const luminance = new Uint8Array(columns * rows);
      for (let cell = 0; cell < luminance.length; cell++) luminance[cell] = source[cell * 4]!;

      canvas.width = columns;
      canvas.height = rows;
      canvas.style.width = `${columns * cellPx}px`;
      canvas.style.height = `${rows * cellPx}px`;
      context.putImageData(
        new ImageData(ditherWallpaper(luminance, columns, ramp, dark), columns, rows),
        0,
        0,
      );
    };

    const scheduler = createWallpaperScheduler(
      {
        frame: (run) => {
          const handle = window.requestAnimationFrame(run);
          return () => window.cancelAnimationFrame(handle);
        },
        idle: requestIdle,
      },
      paint,
    );
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(scheduler.whenIdle, RESIZE_DEBOUNCE_MS);
    };

    // After the frame that mounted the start page, so the dither never delays it.
    scheduler.whenIdle();
    const stopResize = observeResize(host, onResize);
    window.addEventListener("resize", onResize);
    // Themes apply as the root's dark class, inline palette variables, and theme id. Painting
    // before the next frame renders keeps the old theme's wallpaper off the new page.
    const theme = new MutationObserver(scheduler.nextFrame);
    theme.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme-id"] });
    return () => {
      disposed = true;
      scheduler.dispose();
      window.clearTimeout(resizeTimer);
      stopResize();
      window.removeEventListener("resize", onResize);
      theme.disconnect();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      data-photo-backdrop
      className={cn("pointer-events-none absolute overflow-hidden", className)}
    >
      <canvas
        ref={canvasRef}
        className="absolute top-0 right-0 opacity-0 [image-rendering:pixelated] data-shown:opacity-100 data-shown:duration-200 data-shown:motion-safe:transition-opacity"
      />
    </div>
  );
}

// Safari has no requestIdleCallback; a short timeout still lets the current frame paint first.
function requestIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 500 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 50);
  return () => window.clearTimeout(handle);
}
