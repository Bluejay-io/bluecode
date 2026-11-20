import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as References from "effect/References";
import { Command, Flag } from "effect/cli";

import { expandHomePath, resolveBaseDir } from "../os-jank.ts";
import * as T3HomeImport from "../persistence/T3HomeImport.ts";
import * as ProcessRunner from "../processRunner.ts";
import { baseDirFlag } from "./config.ts";

const t3HomeConfig = Config.String("T3CODE_HOME").pipe(
  Config.option,
  Config.map(Option.getOrUndefined),
);

const printJson = (value: object) => Console.log(JSON.stringify(value));

const printSummary = Effect.fn("cli.importT3Code.printSummary")(function* (
  summary: T3HomeImport.T3HomeImportSummary,
) {
  const { counts, scrub } = summary;
  yield* Console.log(`\nImported ${summary.sourceBaseDir} into ${summary.databasePath}.`);
  yield* Console.log(
    `  ${counts.projects} projects, ${counts.threads} threads (${counts.archivedThreads} archived), ${counts.deletedThreads} deleted threads kept for history.`,
  );
  yield* Console.log(
    `  Stopped ${scrub.runsStopped} running turns, held ${scrub.queuedRunsHeld} queued messages, paused ${scrub.scheduledTasksPaused} scheduled tasks.`,
  );
  yield* Console.log(
    `  Copied ${summary.files.copied.join(", ") || "nothing else"} (${summary.secrets.copied} saved secrets, ${summary.attachments.added} new attachments).`,
  );
  yield* Console.log(`  Left behind: ${summary.files.skipped.join(", ") || "nothing"}.`);
  for (const backup of summary.backups) yield* Console.log(`  Kept the previous ${backup}`);
});

const runImportCommand = Effect.fn("cli.importT3Code")(function* (flags: {
  readonly baseDir: Option.Option<string>;
  readonly from: Option.Option<string>;
  readonly replace: boolean;
  readonly probe: boolean;
  readonly json: boolean;
}) {
  const path = yield* Path.Path;
  const service = yield* T3HomeImport.T3HomeImport;
  const sourceBaseDir = Option.isSome(flags.from)
    ? path.resolve(yield* expandHomePath(flags.from.value.trim()))
    : path.join(yield* HostProcess.HomeDirectory, ".t3");
  if (flags.probe) {
    return yield* printJson({ type: "probe", ...(yield* service.probe(sourceBaseDir)) });
  }
  const destinationBaseDir = yield* resolveBaseDir(
    Option.getOrUndefined(flags.baseDir) ?? (yield* t3HomeConfig),
  );
  const run = service.run({
    sourceBaseDir,
    destinationBaseDir,
    replace: flags.replace,
    onProgress: (progress) =>
      flags.json
        ? printJson({ type: "progress", ...progress })
        : Console.log(`${progress.message}...`),
  });
  if (!flags.json) return yield* printSummary(yield* run);
  // The runtime reports a failed command on stdout too; keep stdout to JSON lines.
  yield* run.pipe(
    Effect.matchEffect({
      onSuccess: (summary) => printJson({ type: "summary", ...summary }),
      onFailure: (error) =>
        printJson({ type: "error", error: error._tag, message: error.message }).pipe(
          Effect.andThen(
            Effect.sync(() => {
              process.exitCode = 1;
            }),
          ),
        ),
    }),
  );
});

export const importT3CodeCommand = Command.make("import-t3-code", {
  baseDir: baseDirFlag,
  from: Flag.String("from").pipe(
    Flag.withDescription("T3 Code data directory to import from. Default: ~/.t3."),
    Flag.optional,
  ),
  replace: Flag.Boolean("replace").pipe(
    Flag.withDescription(
      "Import even if this data directory already has projects or threads. Its database is kept next to it as statev2.sqlite.pre-t3-import-<time>.",
    ),
    Flag.withDefault(false),
  ),
  probe: Flag.Boolean("probe").pipe(
    Flag.withDescription(
      "Print, as JSON, what an import would find in --from, and change nothing.",
    ),
    Flag.withDefault(false),
  ),
  json: Flag.Boolean("json").pipe(
    Flag.withDescription("Print progress and the result as JSON lines."),
    Flag.withDefault(false),
  ),
}).pipe(
  Command.withDescription(
    "Copy your T3 Code projects, threads, settings and attachments into this data directory. Run it while no server uses this data directory; T3 Code can keep running.",
  ),
  Command.withHandler((flags) =>
    runImportCommand(flags).pipe(
      Effect.provide(T3HomeImport.layer.pipe(Layer.provide(ProcessRunner.layer))),
      // Migration progress logs would interleave with the JSON lines on stdout.
      Effect.provideService(
        References.MinimumLogLevel,
        flags.json || flags.probe ? "None" : "Warn",
      ),
    ),
  ),
);
