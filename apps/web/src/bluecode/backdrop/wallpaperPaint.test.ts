import { describe, expect, it } from "vite-plus/test";

import {
  commitWallpaperPaint,
  createWallpaperScheduler,
  requestWallpaperPaint,
  type WallpaperPaintState,
} from "./wallpaperPaint";

const fresh = (): WallpaperPaintState => ({ painted: "", latest: 0 });

describe("wallpaper paints", () => {
  it("skips a request for what is already painted", () => {
    const state = fresh();
    const a = requestWallpaperPaint(state, "A")!;
    expect(commitWallpaperPaint(state, a, "A")).toBe(true);
    expect(requestWallpaperPaint(state, "A")).toBeNull();
  });

  it("drops a slower paint once a newer one is requested", () => {
    const state = fresh();
    const b = requestWallpaperPaint(state, "B")!;
    const c = requestWallpaperPaint(state, "C")!;
    expect(commitWallpaperPaint(state, b, "B")).toBe(false);
    expect(commitWallpaperPaint(state, c, "C")).toBe(true);
    expect(state.painted).toBe("C");
  });

  it("drops a pending paint when the theme switches back to the one on screen", () => {
    const state = fresh();
    const a = requestWallpaperPaint(state, "A")!;
    commitWallpaperPaint(state, a, "A");
    const b = requestWallpaperPaint(state, "B")!;
    expect(requestWallpaperPaint(state, "A")).toBeNull();
    expect(commitWallpaperPaint(state, b, "B")).toBe(false);
    expect(state.painted).toBe("A");
  });
});

describe("wallpaper scheduling", () => {
  const setup = () => {
    const theme = { dark: false, background: "light-page" };
    const painted: string[] = [];
    const queues = { frame: [] as Array<() => void>, idle: [] as Array<() => void> };
    const queue = (list: Array<() => void>) => (run: () => void) => {
      list.push(run);
      return () => list.splice(list.indexOf(run), 1);
    };
    const state = fresh();
    const scheduler = createWallpaperScheduler(
      { frame: queue(queues.frame), idle: queue(queues.idle) },
      () => {
        // Mode and colours are read together when the paint runs, as PhotoBackdrop does.
        const key = `${theme.dark} ${theme.background}`;
        const generation = requestWallpaperPaint(state, key);
        if (generation !== null && commitWallpaperPaint(state, generation, key)) painted.push(key);
      },
    );
    const flush = (list: Array<() => void>) => list.splice(0).forEach((run) => run());
    return { theme, painted, queues, scheduler, flush };
  };

  it("paints only the final theme when mode and colours change in separate batches", () => {
    const { theme, painted, queues, scheduler, flush } = setup();
    theme.dark = true;
    scheduler.nextFrame();
    theme.background = "dark-page";
    scheduler.nextFrame();
    expect(queues.frame).toHaveLength(1);
    flush(queues.frame);
    expect(painted).toEqual(["true dark-page"]);
  });

  it("repaints when a batch lands after the frame painted", () => {
    const { theme, painted, queues, scheduler, flush } = setup();
    theme.dark = true;
    scheduler.nextFrame();
    flush(queues.frame);
    theme.background = "dark-page";
    scheduler.nextFrame();
    flush(queues.frame);
    expect(painted).toEqual(["true light-page", "true dark-page"]);
  });

  it("lets a theme switch take over a pending idle paint", () => {
    const { theme, painted, queues, scheduler, flush } = setup();
    scheduler.whenIdle();
    theme.dark = true;
    scheduler.nextFrame();
    scheduler.whenIdle();
    expect(queues.idle).toHaveLength(0);
    flush(queues.frame);
    expect(painted).toEqual(["true light-page"]);
  });
});
