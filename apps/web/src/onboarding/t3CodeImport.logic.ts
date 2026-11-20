import type {
  DesktopT3CodeImportPhase,
  DesktopT3CodeImportProbeResult,
  DesktopT3CodeImportProgress,
  DesktopT3CodeImportRunResult,
} from "@t3tools/contracts";

/** What the Welcome page offers for the T3 Code data on this computer. */
export type T3CodeImportOffer =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "importable";
      readonly projects: number;
      readonly threads: number;
      readonly serverRunning: boolean;
    }
  | { readonly kind: "newer" }
  | { readonly kind: "blocked"; readonly reason: string | null };

export function resolveT3CodeImportOffer(
  result: DesktopT3CodeImportProbeResult | null,
): T3CodeImportOffer {
  if (result === null || result._tag === "Unavailable" || !result.probe.found) {
    return { kind: "hidden" };
  }
  const { probe } = result;
  if (probe.importable) {
    const projects = probe.projects ?? 0;
    const threads = probe.threads ?? 0;
    // Settings alone are not worth a restart; an empty T3 Code home is not offered.
    if (projects === 0 && threads === 0) return { kind: "hidden" };
    return { kind: "importable", projects, threads, serverRunning: probe.serverRunning };
  }
  if (probe.migrationHead !== null && probe.migrationHead > probe.buildMigrationHead) {
    return { kind: "newer" };
  }
  return { kind: "blocked", reason: probe.blockedReason };
}

export type T3CodeImportRunState =
  | { readonly status: "idle" }
  /** `phase` is null until the CLI reports its first step, while the server stops. */
  | { readonly status: "running"; readonly phase: DesktopT3CodeImportPhase | null }
  | { readonly status: "restarting" }
  | {
      readonly status: "failed";
      /** The CLI's error tag, such as `T3HomeImportDestinationNotEmptyError`. */
      readonly error: string | null;
      readonly message: string | null;
    };

export type T3CodeImportEvent =
  | { readonly type: "start" }
  | { readonly type: "progress"; readonly progress: DesktopT3CodeImportProgress }
  | { readonly type: "settled"; readonly result: DesktopT3CodeImportRunResult }
  /** The bridge call itself threw; there is no CLI message to show. */
  | { readonly type: "rejected" };

export const T3_CODE_IMPORT_IDLE: T3CodeImportRunState = { status: "idle" };

export function nextT3CodeImportState(
  state: T3CodeImportRunState,
  event: T3CodeImportEvent,
): T3CodeImportRunState {
  switch (event.type) {
    case "start":
      return state.status === "idle" || state.status === "failed"
        ? { status: "running", phase: null }
        : state;
    case "progress":
      return state.status === "running"
        ? { status: "running", phase: event.progress.phase }
        : state;
    case "settled":
      if (state.status !== "running") return state;
      switch (event.result._tag) {
        case "Imported":
          return { status: "restarting" };
        // Another import from this app is already under way; its relaunch ends this page too.
        case "Busy":
          return state;
        case "Failed":
          return { status: "failed", error: event.result.error, message: event.result.message };
      }
      return state;
    case "rejected":
      return state.status === "running" ? { status: "failed", error: null, message: null } : state;
  }
}

export const isT3CodeImportBusy = (state: T3CodeImportRunState) =>
  state.status === "running" || state.status === "restarting";
