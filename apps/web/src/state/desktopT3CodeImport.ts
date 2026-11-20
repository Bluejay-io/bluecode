import type { DesktopBridge, DesktopT3CodeImportProbeResult } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";

type DesktopT3CodeImportBridge = DesktopBridge["t3CodeImport"];

class DesktopT3CodeImportProbeError extends Schema.TaggedError<DesktopT3CodeImportProbeError>()(
  "DesktopT3CodeImportProbeError",
  { cause: Schema.Defect() },
) {}

/** Present only in the desktop app; plain web has no T3 Code home to read. */
export function getDesktopT3CodeImportBridge(): DesktopT3CodeImportBridge | undefined {
  return typeof window === "undefined" ? undefined : window.desktopBridge?.t3CodeImport;
}

export const desktopT3CodeImportProbeAtom = Atom.make(
  Effect.suspend(() => {
    const bridge = getDesktopT3CodeImportBridge();
    if (bridge === undefined) return Effect.succeed(null);
    return Effect.tryPromise({
      try: (): Promise<DesktopT3CodeImportProbeResult> => bridge.probe(),
      catch: (cause) => new DesktopT3CodeImportProbeError({ cause }),
    });
  }),
).pipe(Atom.withLabel("desktop:t3-code-import:probe"));
