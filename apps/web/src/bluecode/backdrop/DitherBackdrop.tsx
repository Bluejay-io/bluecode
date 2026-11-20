import { useEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

import { DITHER_CELL_PX, REACH_COLUMNS, crossfadeLayers, ditherMask } from "./ditherMask";

// Motion comes from compositor opacity fades between keyframes, so no frame runs script or
// repaints. Script computes one keyframe per period, and the chain rests while the tab is
// hidden, the window is unfocused, the user is idle, or prefers reduced motion.
const PERIOD_MS = 1600;
const DRIFT_PER_KEYFRAME = 1;
const IDLE_MS = 60_000;
const MAX_ROWS = 256;
const FADE_EASING = "cubic-bezier(0.45, 0, 0.55, 1)";
const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel"] as const;

type Layers = readonly [
  stay: HTMLCanvasElement,
  appear: HTMLCanvasElement,
  vanish: HTMLCanvasElement,
];

/** Capy's dotted corner glow in the theme's primary color, drifting slowly. */
export function DitherBackdrop({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLCanvasElement>(null);
  const appearRef = useRef<HTMLCanvasElement>(null);
  const vanishRef = useRef<HTMLCanvasElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives canvases from the box size, the theme, and a keyframe chain
  useEffect(() => {
    const host = hostRef.current;
    const stay = stayRef.current;
    const appear = appearRef.current;
    const vanish = vanishRef.current;
    if (!host || !stay || !appear || !vanish) return;
    const layers: Layers = [stay, appear, vanish];
    const contexts = layers.map((canvas) => canvas.getContext("2d"));
    if (contexts.some((context) => context === null)) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let color = getComputedStyle(host).color;
    let columns = 0;
    let rows = 0;
    let keyframe = 0;
    let shown: Uint8Array = new Uint8Array(0);
    let prefetched: { keyframe: number; mask: Uint8Array } | null = null;
    let images: ImageData[] = [];
    let fades: Animation[] = [];
    let running = false;
    let idleTask = 0;
    let lastActive = performance.now();

    const maskAt = (index: number) =>
      prefetched?.keyframe === index
        ? prefetched.mask
        : ditherMask(columns, rows, index * DRIFT_PER_KEYFRAME);

    const paint = () => {
      contexts.forEach((context, index) => {
        if (!context || !images[index]) return;
        context.globalCompositeOperation = "copy";
        context.putImageData(images[index], 0, 0);
        // Recolors only the lit cells, so any CSS color the theme uses works as-is.
        context.globalCompositeOperation = "source-in";
        context.fillStyle = color;
        context.fillRect(0, 0, columns, rows);
      });
    };

    const cancelFades = () => {
      for (const fade of fades) fade.cancel();
      fades = [];
    };

    const shouldRun = () =>
      columns > 0 &&
      !document.hidden &&
      !reducedMotion.matches &&
      document.hasFocus() &&
      performance.now() - lastActive < IDLE_MS;

    // Fades from the shown keyframe to the next, then chains to the one after while it should run.
    const advance = () => {
      if (!shouldRun()) {
        running = false;
        return;
      }
      running = true;
      const target = maskAt(keyframe + 1);
      const [stayImage, appearImage, vanishImage] = images;
      if (!stayImage || !appearImage || !vanishImage) return;
      crossfadeLayers(shown, target, stayImage.data, appearImage.data, vanishImage.data);
      cancelFades();
      paint();
      const timing = { duration: PERIOD_MS, easing: FADE_EASING, fill: "forwards" } as const;
      const fadeIn = appear.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      fades = [fadeIn, vanish.animate([{ opacity: 1 }, { opacity: 0 }], timing)];
      fadeIn.onfinish = () => {
        shown = target;
        keyframe += 1;
        advance();
      };
      cancelIdleTask();
      idleTask = requestIdle(() => {
        idleTask = 0;
        prefetched = { keyframe: keyframe + 2, mask: maskAt(keyframe + 2) };
      });
    };

    const resume = () => {
      if (!running) advance();
    };

    const layout = () => {
      const ratio = window.devicePixelRatio || 1;
      // Whole device pixels per cell keep every cell the same size when scaled up.
      const cellPx = Math.max(1, Math.round(DITHER_CELL_PX * ratio)) / ratio;
      // No cell left of the cloud's reach is ever lit, so the canvas stops there.
      const nextColumns = Math.min(REACH_COLUMNS, Math.ceil(host.clientWidth / cellPx));
      const nextRows = Math.min(MAX_ROWS, Math.ceil(host.clientHeight / cellPx));
      if (nextColumns === columns && nextRows === rows) return;
      columns = nextColumns;
      rows = nextRows;
      cancelFades();
      running = false;
      prefetched = null;
      if (columns === 0 || rows === 0) return;
      for (const canvas of layers) {
        canvas.width = columns;
        canvas.height = rows;
        canvas.style.width = `${columns * cellPx}px`;
        canvas.style.height = `${rows * cellPx}px`;
      }
      images = layers.map(() => new ImageData(columns, rows));
      shown = maskAt(keyframe);
      const [stayImage, appearImage, vanishImage] = images;
      if (stayImage && appearImage && vanishImage) {
        crossfadeLayers(shown, shown, stayImage.data, appearImage.data, vanishImage.data);
      }
      paint();
      resume();
    };

    const onThemeChange = () => {
      const next = getComputedStyle(host).color;
      if (next === color) return;
      color = next;
      paint();
    };
    const onActivity = () => {
      lastActive = performance.now();
      resume();
    };
    const cancelIdleTask = () => {
      if (idleTask) cancelIdle(idleTask);
      idleTask = 0;
    };

    layout();
    host.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 900,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    const stopResize = observeResize(host, layout);
    // Themes apply as the root's dark class, inline palette variables, and theme id.
    const theme = new MutationObserver(onThemeChange);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme-id"],
    });
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    reducedMotion.addEventListener("change", resume);
    return () => {
      cancelFades();
      cancelIdleTask();
      stopResize();
      theme.disconnect();
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      reducedMotion.removeEventListener("change", resume);
    };
  }, []);

  const layerClass = "absolute top-0 right-0 [image-rendering:pixelated]";
  return (
    <div
      ref={hostRef}
      aria-hidden
      className={cn("pointer-events-none absolute overflow-hidden text-primary", className)}
    >
      <div className="absolute inset-0 opacity-20 dark:opacity-25">
        <canvas ref={stayRef} className={layerClass} />
        <canvas ref={appearRef} className={cn(layerClass, "opacity-0")} />
        <canvas ref={vanishRef} className={cn(layerClass, "opacity-0")} />
      </div>
    </div>
  );
}

// Safari has no requestIdleCallback; a short timeout keeps the prefetch off the fade's first frame.
function requestIdle(callback: () => void): number {
  return typeof window.requestIdleCallback === "function"
    ? window.requestIdleCallback(callback, { timeout: PERIOD_MS / 2 })
    : window.setTimeout(callback, 50);
}

function cancelIdle(handle: number): void {
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}
