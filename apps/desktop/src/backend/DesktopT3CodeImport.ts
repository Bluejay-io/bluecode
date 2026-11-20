import {
  DesktopT3CodeImportProbeSchema,
  DesktopT3CodeImportProgressSchema,
  type DesktopT3CodeImportProbeResult,
  type DesktopT3CodeImportProgress,
  type DesktopT3CodeImportRunResult,
  type DesktopT3CodeImportUnavailableReason,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { msg } from "gt-i18n";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopLifecycle from "../app/DesktopLifecycle.ts";
import { makeComponentLogger } from "../app/DesktopObservability.ts";
import { m } from "../i18n/messages.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopBackendPool from "./DesktopBackendPool.ts";
import * as DesktopHomeOwner from "./DesktopHomeOwner.ts";

const { logInfo, logWarning } = makeComponentLogger("desktop-t3-code-import");

const STDERR_TAIL_CHARS = 2_000;

/** One stdout line of `t3 import-t3-code --json`. */
const ImportLine = Schema.Union([
  Schema.Struct({ type: Schema.Literal("probe"), ...DesktopT3CodeImportProbeSchema.fields }),
  Schema.Struct({ type: Schema.Literal("progress"), ...DesktopT3CodeImportProgressSchema.fields }),
  Schema.Struct({
    type: Schema.Literal("summary"),
    counts: Schema.Struct({ projects: Schema.Number, threads: Schema.Number }),
  }),
  Schema.Struct({ type: Schema.Literal("error"), error: Schema.String, message: Schema.String }),
]);
type ImportLine = typeof ImportLine.Type;
type ImportLineOf<T extends ImportLine["type"]> = Extract<ImportLine, { readonly type: T }>;

const findLine = <T extends ImportLine["type"]>(
  lines: ReadonlyArray<ImportLine>,
  type: T,
): ImportLineOf<T> | undefined => lines.find((line): line is ImportLineOf<T> => line.type === type);

const decodeImportLine = Schema.decodeUnknownOption(Schema.fromJsonString(ImportLine));

type RelaunchServices = Effect.Services<
  ReturnType<DesktopLifecycle.DesktopLifecycle["Service"]["relaunch"]>
>;

interface CliOutcome {
  readonly lines: ReadonlyArray<ImportLine>;
  readonly exitCode: number;
  readonly stderr: string;
}

export class DesktopT3CodeImport extends Context.Service<
  DesktopT3CodeImport,
  {
    readonly probe: Effect.Effect<DesktopT3CodeImportProbeResult>;
    /** Resolves `Imported` once the relaunch onto the imported data is requested. */
    readonly run: (
      onProgress: (progress: DesktopT3CodeImportProgress) => Effect.Effect<void>,
    ) => Effect.Effect<DesktopT3CodeImportRunResult>;
  }
>()("@t3tools/desktop/backend/DesktopT3CodeImport") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const appSettings = yield* DesktopAppSettings.DesktopAppSettings;
  const pool = yield* DesktopBackendPool.DesktopBackendPool;
  const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
  const relaunchContext = yield* Effect.context<RelaunchServices>();
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const homeOwnerContext = yield* Effect.context<
    FileSystem.FileSystem | Path.Path | DesktopEnvironment.DesktopEnvironment
  >();
  const sourceBaseDir = Option.getOrElse(yield* DesktopConfig.trimmedString("T3CODE_HOME"), () =>
    environment.path.join(environment.homeDirectory, ".t3"),
  );
  const running = yield* Ref.make(false);

  const unavailableReason = Effect.gen(function* () {
    const settings = yield* appSettings.get;
    if (!settings.localEnvironmentEnabled) return "local-environment-disabled" as const;
    if (settings.wslOnly && settings.wslBackendEnabled) return "wsl-primary" as const;
    if (environment.stateDir !== environment.path.join(environment.baseDir, "userdata")) {
      return "development-home" as const;
    }
    return null;
  });

  const runCli = Effect.fn("DesktopT3CodeImport.runCli")(function* (
    flags: ReadonlyArray<string>,
    onLine: (line: ImportLine) => Effect.Effect<void>,
  ) {
    const command = ChildProcess.make(
      process.execPath,
      [
        ...(environment.isPackaged ? ["--require", environment.compileCachePath] : []),
        environment.backendEntryPath,
        "import-t3-code",
        "--json",
        "--base-dir",
        environment.baseDir,
        "--from",
        sourceBaseDir,
        ...flags,
      ],
      {
        cwd: environment.backendCwd,
        env: { ELECTRON_RUN_AS_NODE: "1", T3CODE_HOME: undefined },
        extendEnv: true,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        // No forceKillAfter: the CLI rolls back on SIGTERM, so a quit waits for it, never SIGKILL.
        killSignal: "SIGTERM",
      },
    );
    const handle = yield* spawner.spawn(command);
    const lines: Array<ImportLine> = [];
    const [, stderr, exitCode] = yield* Effect.all(
      [
        handle.stdout.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((raw) =>
            Option.match(decodeImportLine(raw.trim()), {
              onNone: () => Effect.void,
              onSome: (line) => {
                lines.push(line);
                return onLine(line);
              },
            }),
          ),
        ),
        handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
        handle.exitCode,
      ],
      { concurrency: "unbounded" },
    );
    return {
      lines,
      exitCode: Number(exitCode),
      stderr: stderr.trim().slice(-STDERR_TAIL_CHARS),
    } satisfies CliOutcome;
  }, Effect.scoped);

  const probe = Effect.gen(function* () {
    const reason = yield* unavailableReason;
    if (reason !== null) return unavailable(reason, null);
    const outcome = yield* runCli(["--probe"], () => Effect.void);
    const line = findLine(outcome.lines, "probe");
    if (line === undefined) return unavailable("probe-failed", cliFailureMessage(outcome));
    const { type: _type, ...found } = line;
    return { _tag: "Probed", probe: found } satisfies DesktopT3CodeImportProbeResult;
  }).pipe(
    Effect.catch((error) =>
      logWarning("T3 Code import probe failed", { error: error.message }).pipe(
        Effect.as(unavailable("probe-failed", error.message)),
      ),
    ),
    Effect.withSpan("DesktopT3CodeImport.probe"),
  );

  const importAndRelaunch = Effect.fn("DesktopT3CodeImport.importAndRelaunch")(function* (
    onProgress: (progress: DesktopT3CodeImportProgress) => Effect.Effect<void>,
  ) {
    const reason = yield* unavailableReason;
    if (reason !== null) {
      return failed("Unavailable", m(msg("This BlueCode setup cannot import from T3 Code.")));
    }
    const primary = yield* pool.primary;
    yield* logInfo("stopping the local backend for a T3 Code import", { sourceBaseDir });
    yield* primary.stop();
    const restart = primary.start;
    const released = yield* DesktopHomeOwner.awaitHomeOwnershipRelease().pipe(
      Effect.provideContext(homeOwnerContext),
    );
    if (!released) {
      yield* restart;
      return failed(
        "DestinationInUse",
        m(msg("BlueCode's server did not stop in time. Nothing was changed. Try again.")),
      );
    }
    const outcome = yield* runCli([], (line) =>
      line.type === "progress"
        ? onProgress({ phase: line.phase, message: line.message })
        : Effect.void,
    ).pipe(
      Effect.catch((error) =>
        Effect.succeed({ lines: [], exitCode: -1, stderr: error.message } satisfies CliOutcome),
      ),
    );
    const summary = findLine(outcome.lines, "summary");
    if (summary !== undefined && outcome.exitCode === 0) {
      yield* logInfo("T3 Code import finished; relaunching", summary.counts);
      yield* lifecycle.relaunch("t3-code-import").pipe(Effect.provideContext(relaunchContext));
      return {
        _tag: "Imported",
        projects: summary.counts.projects,
        threads: summary.counts.threads,
      } satisfies DesktopT3CodeImportRunResult;
    }
    yield* logWarning("T3 Code import failed; restarting the local backend", {
      exitCode: outcome.exitCode,
    });
    yield* restart;
    const error = findLine(outcome.lines, "error");
    return error === undefined
      ? failed("ImportExited", cliFailureMessage(outcome))
      : failed(error.error, error.message);
  });

  return DesktopT3CodeImport.of({
    probe,
    run: Effect.fn("DesktopT3CodeImport.run")(function* (onProgress) {
      if (yield* Ref.getAndSet(running, true)) {
        return { _tag: "Busy" } satisfies DesktopT3CodeImportRunResult;
      }
      const result = yield* importAndRelaunch(onProgress).pipe(
        Effect.onInterrupt(() => Ref.set(running, false)),
      );
      // Imported stays held: the app is relaunching and must not start a second import.
      if (result._tag !== "Imported") yield* Ref.set(running, false);
      return result;
    }),
  });
});

const unavailable = (
  reason: DesktopT3CodeImportUnavailableReason,
  message: string | null,
): DesktopT3CodeImportProbeResult => ({ _tag: "Unavailable", reason, message });

const failed = (error: string, message: string): DesktopT3CodeImportRunResult => ({
  _tag: "Failed",
  error,
  message,
});

const cliFailureMessage = (outcome: CliOutcome): string =>
  outcome.stderr.length > 0
    ? outcome.stderr
    : m(msg("The import stopped without a result (exit code {code})."), {
        code: String(outcome.exitCode),
      });

export const layer = Layer.effect(DesktopT3CodeImport, make);
