/** Which wallpaper paint may land on the canvas: only the most recently requested one. */
export interface WallpaperPaintState {
  /** The key of what the canvas shows. */
  painted: string;
  /** Bumped on every request, so any paint still decoding is stale. */
  latest: number;
}

/**
 * Starts a paint for `key` and returns its generation, or null when the canvas already shows it.
 * Either way older pending paints are invalidated: switching back to what is on screen must still
 * stop a slower paint from landing over it.
 */
export function requestWallpaperPaint(state: WallpaperPaintState, key: string): number | null {
  state.latest += 1;
  return key === state.painted ? null : state.latest;
}

/** Records `key` as painted if `generation` is still the latest request; false means drop it. */
export function commitWallpaperPaint(
  state: WallpaperPaintState,
  generation: number,
  key: string,
): boolean {
  if (generation !== state.latest) return false;
  state.painted = key;
  return true;
}

/** Schedules `run`, returning a cancel. */
type Schedule = (run: () => void) => () => void;

/**
 * Runs one paint at a time. `nextFrame` lands before the next frame renders, so a theme switch and
 * its wallpaper show together; `whenIdle` keeps mounts and resizes off the critical frame. The
 * paint reads the theme when it runs, so several mutation batches before it paint only their end
 * state, and a batch after it schedules another.
 */
export function createWallpaperScheduler(
  timers: { frame: Schedule; idle: Schedule },
  paint: () => void,
) {
  let cancel: (() => void) | null = null;
  let urgent = false;
  const run = () => {
    cancel = null;
    urgent = false;
    paint();
  };
  return {
    nextFrame() {
      if (urgent) return;
      cancel?.();
      urgent = true;
      cancel = timers.frame(run);
    },
    whenIdle() {
      if (!cancel) cancel = timers.idle(run);
    },
    dispose() {
      cancel?.();
      cancel = null;
      urgent = false;
    },
  };
}
