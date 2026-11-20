import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { DesktopT3CodeImportProgress } from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopLifecycle from "../app/DesktopLifecycle.ts";
import * as DesktopShutdown from "../app/DesktopShutdown.ts";
import * as DesktopState from "../app/DesktopState.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronTheme from "../electron/ElectronTheme.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopBackendManager from "./DesktopBackendManager.ts";
import * as DesktopBackendPool from "./DesktopBackendPool.ts";
import * as DesktopT3CodeImport from "./DesktopT3CodeImport.ts";

const encoder = new TextEncoder();

const probeLine = {
  type: "probe" as const,
  sourceBaseDir: "/home/test/.t3",
  found: true,
  databaseKind: "v2" as const,
  databaseBytes: 4096,
  migrationHead: 40,
  buildMigrationHead: 41,
  importable: true,
  blockedReason: null,
  projects: 3,
  threads: 12,
  serverRunning: true,
};

interface FakeRun {
  readonly stdout: ReadonlyArray<object | string>;
  readonly stderr?: string;
  readonly exitCode?: number;
  /** Holds the process open until it completes. */
  readonly hold?: Deferred.Deferred<void>;
  readonly spawned?: Deferred.Deferred<void>;
}

const jsonLines = (lines: ReadonlyArray<object | string>) =>
  lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n");

const makeHarness = Effect.fn("test.makeT3CodeImportHarness")(function* (options: {
  readonly runs: ReadonlyArray<FakeRun>;
  readonly settings?: Partial<DesktopAppSettings.DesktopSettings>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const baseDir = yield* fs.makeTempDirectoryScoped();
  const events: Array<string> = [];
  const commands: Array<ReadonlyArray<string>> = [];
  const runs = [...options.runs];

  const spawner = ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      if (command._tag !== "StandardCommand") return yield* Effect.die("expected a command");
      commands.push(command.args.map(String));
      events.push("spawn");
      const run = runs.shift();
      if (run === undefined) return yield* Effect.die("unexpected spawn");
      if (run.spawned !== undefined) yield* Deferred.succeed(run.spawned, undefined);
      const stdout = Stream.make(encoder.encode(jsonLines(run.stdout)));
      const exitCode = ChildProcessSpawner.ExitCode(run.exitCode ?? 0);
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(321),
        stdout:
          run.hold === undefined
            ? stdout
            : Stream.fromEffect(Deferred.await(run.hold)).pipe(Stream.flatMap(() => stdout)),
        stderr: Stream.make(encoder.encode(run.stderr ?? "")),
        all: Stream.empty,
        exitCode:
          run.hold === undefined
            ? Effect.succeed(exitCode)
            : Deferred.await(run.hold).pipe(Effect.as(exitCode)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: Sink.drain,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      });
    }),
  );

  const primary: DesktopBackendManager.DesktopBackendInstance = {
    id: DesktopBackendManager.PRIMARY_INSTANCE_ID,
    label: Effect.succeed("Local environment"),
    start: Effect.sync(() => events.push("start")),
    stop: () => Effect.sync(() => events.push("stop")),
    currentConfig: Effect.succeedNone,
    snapshot: Effect.succeed({
      desiredRunning: true,
      ready: true,
      activePid: Option.some(1),
      restartAttempt: 0,
      restartScheduled: false,
    }),
    waitForReady: () => Effect.succeed(true),
  };

  const environment = DesktopEnvironment.DesktopEnvironment.of({
    path,
    homeDirectory: "/home/test",
    baseDir,
    stateDir: path.join(baseDir, "userdata"),
    isPackaged: false,
    backendEntryPath: "/app/apps/server/dist/bin.mjs",
    backendCwd: "/app",
    compileCachePath: "/app/compileCache.cjs",
  } as DesktopEnvironment.DesktopEnvironment["Service"]);

  const layer = DesktopT3CodeImport.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(DesktopEnvironment.DesktopEnvironment, environment),
        DesktopAppSettings.layerTest({
          ...DesktopAppSettings.DEFAULT_DESKTOP_SETTINGS,
          ...options.settings,
        }),
        DesktopBackendPool.layerTest([primary]),
        Layer.mock(DesktopLifecycle.DesktopLifecycle, {
          relaunch: (reason) => Effect.sync(() => events.push(`relaunch:${reason}`)),
        }),
        Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
        DesktopConfig.layerTest({ T3CODE_HOME: "/data/t3-code" }),
        // Only captured for the real relaunch, which the mock above replaces.
        DesktopShutdown.layer,
        DesktopState.layer,
        Layer.mock(DesktopWindow.DesktopWindow, {}),
        Layer.mock(ElectronApp.ElectronApp, {}),
        Layer.mock(ElectronTheme.ElectronTheme, {}),
      ),
    ),
  );
  const service = yield* DesktopT3CodeImport.DesktopT3CodeImport.pipe(Effect.provide(layer));
  return { service, events, commands, baseDir };
});

const collectProgress = () => {
  const progress: Array<DesktopT3CodeImportProgress> = [];
  return {
    progress,
    onProgress: (next: DesktopT3CodeImportProgress) =>
      Effect.sync(() => {
        progress.push(next);
      }),
  };
};

describe("DesktopT3CodeImport", () => {
  it.effect("probes the T3 Code home with the bundled CLI", () =>
    Effect.gen(function* () {
      const { service, commands, baseDir } = yield* makeHarness({
        runs: [
          { stdout: [probeLine] },
          { stdout: [{ ...probeLine, found: false, importable: false, projects: null }] },
        ],
      });
      const { type: _type, ...probe } = probeLine;
      assert.deepEqual(yield* service.probe, { _tag: "Probed", probe });
      assert.deepEqual(commands[0], [
        "/app/apps/server/dist/bin.mjs",
        "import-t3-code",
        "--json",
        "--base-dir",
        baseDir,
        "--from",
        "/data/t3-code",
        "--probe",
      ]);
      const missing = yield* service.probe;
      assert.isTrue(missing._tag === "Probed" && !missing.probe.found);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("reports malformed probe output, and skips the probe for a WSL primary", () =>
    Effect.gen(function* () {
      const malformed = yield* makeHarness({
        runs: [{ stdout: ["Importing...", "{not json"], stderr: "boom", exitCode: 1 }],
      });
      assert.deepEqual(yield* malformed.service.probe, {
        _tag: "Unavailable",
        reason: "probe-failed",
        message: "boom",
      });

      const wsl = yield* makeHarness({
        runs: [],
        settings: { wslBackendEnabled: true, wslOnly: true },
      });
      assert.deepEqual(yield* wsl.service.probe, {
        _tag: "Unavailable",
        reason: "wsl-primary",
        message: null,
      });
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("stops the backend, forwards progress, and relaunches after a summary", () =>
    Effect.gen(function* () {
      const { service, events, commands } = yield* makeHarness({
        runs: [
          {
            stdout: [
              { type: "progress", phase: "snapshot", message: "Copying" },
              "not a json line",
              { type: "progress", phase: "publish", message: "Publishing" },
              { type: "summary", counts: { projects: 3, threads: 12 } },
            ],
          },
        ],
      });
      const { progress, onProgress } = collectProgress();
      assert.deepEqual(yield* service.run(onProgress), {
        _tag: "Imported",
        projects: 3,
        threads: 12,
      });
      assert.deepEqual(
        progress.map((entry) => entry.phase),
        ["snapshot", "publish"],
      );
      assert.deepEqual(events, ["stop", "spawn", "relaunch:t3-code-import"]);
      assert.notInclude(commands[0]!, "--replace");
      assert.notInclude(commands[0]!, "--probe");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("restarts the backend and returns the CLI's error, then allows a retry", () =>
    Effect.gen(function* () {
      const { service, events } = yield* makeHarness({
        runs: [
          {
            stdout: [
              { type: "progress", phase: "preflight", message: "Checking" },
              { type: "error", error: "T3HomeImportSourceNewerError", message: "Update first." },
            ],
            exitCode: 1,
          },
          { stdout: [], stderr: "", exitCode: 3 },
        ],
      });
      const { onProgress } = collectProgress();
      assert.deepEqual(yield* service.run(onProgress), {
        _tag: "Failed",
        error: "T3HomeImportSourceNewerError",
        message: "Update first.",
      });
      assert.deepEqual(events, ["stop", "spawn", "start"]);

      const exited = yield* service.run(onProgress);
      assert.strictEqual(exited._tag, "Failed");
      assert.deepEqual(events, ["stop", "spawn", "start", "stop", "spawn", "start"]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects a second import while one runs", () =>
    Effect.gen(function* () {
      const hold = yield* Deferred.make<void>();
      const spawned = yield* Deferred.make<void>();
      const { service, events } = yield* makeHarness({
        runs: [
          { stdout: [{ type: "summary", counts: { projects: 1, threads: 1 } }], hold, spawned },
        ],
      });
      const { onProgress } = collectProgress();
      const first = yield* service.run(onProgress).pipe(Effect.forkChild);
      yield* Deferred.await(spawned);
      assert.deepEqual(yield* service.run(onProgress), { _tag: "Busy" });
      yield* Deferred.succeed(hold, undefined);
      assert.strictEqual((yield* Fiber.join(first))._tag, "Imported");
      assert.deepEqual(events, ["stop", "spawn", "relaunch:t3-code-import"]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
