import {
  DesktopT3CodeImportProbeResultSchema,
  DesktopT3CodeImportRunResultSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";

import * as DesktopT3CodeImport from "../../backend/DesktopT3CodeImport.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const probeT3CodeImport = makeIpcMethod({
  channel: IpcChannels.T3_CODE_IMPORT_PROBE_CHANNEL,
  payload: Schema.Void,
  result: DesktopT3CodeImportProbeResultSchema,
  handler: Effect.fn("desktop.ipc.t3CodeImport.probe")(function* () {
    return yield* (yield* DesktopT3CodeImport.DesktopT3CodeImport).probe;
  }),
});

export const runT3CodeImport = makeIpcMethod({
  channel: IpcChannels.T3_CODE_IMPORT_RUN_CHANNEL,
  payload: Schema.Void,
  result: DesktopT3CodeImportRunResultSchema,
  handler: Effect.fn("desktop.ipc.t3CodeImport.run")(function* () {
    const t3CodeImport = yield* DesktopT3CodeImport.DesktopT3CodeImport;
    const electronWindow = yield* ElectronWindow.ElectronWindow;
    // The app's scope, captured at registration: quitting interrupts the import, so the CLI
    // gets SIGTERM and rolls back before the app exits.
    const appScope = yield* Scope.Scope;
    const fiber = yield* t3CodeImport
      .run((progress) =>
        electronWindow.sendAll(IpcChannels.T3_CODE_IMPORT_PROGRESS_CHANNEL, progress),
      )
      .pipe(Effect.forkIn(appScope));
    return yield* Fiber.join(fiber);
  }),
});
