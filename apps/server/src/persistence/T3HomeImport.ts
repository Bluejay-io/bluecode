// @effect-diagnostics-next-line nodeBuiltinImport:off -- Effect has no free-space query.
import * as NodeFSP from "node:fs/promises";

import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import type * as Digest from "effect/crypto/Digest";
import type * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import { markNoCopyOnWrite } from "../noCopyOnWrite.ts";
import * as EffectOutbox from "../orchestration-v2/EffectOutbox.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as EventStore from "../orchestration-v2/EventStore.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProviderRuntimeRecovery from "../orchestration-v2/ProviderRuntimeRecoveryService.ts";
import type * as ProcessRunner from "../processRunner.ts";
import * as ServerOwnership from "../serverOwnership.ts";
import { readLiveServerRuntimeState } from "../serverRuntimeState.ts";
import * as ServerSettings from "../serverSettings.ts";
import {
  foreignKeyClosure,
  LIVE_STATE_TABLES,
  stopPullRequestWatches,
  stopSettleScripts,
} from "./copiedDatabaseScrub.ts";
import {
  BUILD_MIGRATION_HEAD,
  databaseCompatibility,
  type DatabaseCompatibility,
  recordedMigrations,
} from "./databaseMigrationHead.ts";
import { snapshotDatabase } from "./initializeV2Database.ts";
import * as SqlitePersistence from "./Sqlite.ts";
import {
  encodeT3ImportMarker,
  T3_IMPORT_MARKER_FILE,
  type T3ImportMarker,
} from "./t3ImportMarker.ts";

export class T3HomeImportSourceMissingError extends Schema.TaggedError<T3HomeImportSourceMissingError>()(
  "T3HomeImportSourceMissingError",
  { stateDir: Schema.String },
) {
  override get message(): string {
    return `No T3 Code data was found in ${this.stateDir}.`;
  }
}

export class T3HomeImportSameHomeError extends Schema.TaggedError<T3HomeImportSameHomeError>()(
  "T3HomeImportSameHomeError",
  { sourceStateDir: Schema.String, destinationStateDir: Schema.String },
) {
  override get message(): string {
    return `The T3 Code data in ${this.sourceStateDir} overlaps this data directory (${this.destinationStateDir}). Import into a separate data directory. Nothing was changed.`;
  }
}

export class T3HomeImportDestinationInUseError extends Schema.TaggedError<T3HomeImportDestinationInUseError>()(
  "T3HomeImportDestinationInUseError",
  { stateDir: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    return `A server is running on ${this.stateDir}. Quit the app or stop that server, then import again. Nothing was changed.`;
  }
}

export class T3HomeImportDestinationNotEmptyError extends Schema.TaggedError<T3HomeImportDestinationNotEmptyError>()(
  "T3HomeImportDestinationNotEmptyError",
  {
    databasePath: Schema.String,
    projects: Schema.NullOr(Schema.Int),
    threads: Schema.NullOr(Schema.Int),
  },
) {
  override get message(): string {
    const holds =
      this.projects === null || this.threads === null
        ? "already has a database this import could not read"
        : `already has ${this.projects} projects and ${this.threads} threads`;
    return `${this.databasePath} ${holds}. To import over it, run the import again with --replace; that database is kept next to it as a backup. Nothing was changed.`;
  }
}

export class T3HomeImportDestinationBusyError extends Schema.TaggedError<T3HomeImportDestinationBusyError>()(
  "T3HomeImportDestinationBusyError",
  { databasePath: Schema.String, cause: Schema.optional(Schema.Defect()) },
) {
  override get message(): string {
    return `Another program has ${this.databasePath} open. Close it, then import again. Nothing was changed.`;
  }
}

export class T3HomeImportSourceUnreadableError extends Schema.TaggedError<T3HomeImportSourceUnreadableError>()(
  "T3HomeImportSourceUnreadableError",
  { databasePath: Schema.String },
) {
  override get message(): string {
    return `Could not read the T3 Code database at ${this.databasePath}. Nothing was imported.`;
  }
}

export class T3HomeImportSourceNewerError extends Schema.TaggedError<T3HomeImportSourceNewerError>()(
  "T3HomeImportSourceNewerError",
  { databasePath: Schema.String, newestMigration: Schema.String },
) {
  override get message(): string {
    return `The T3 Code database at ${this.databasePath} was written by a newer T3 Code than this build supports (migration ${this.newestMigration}). Update BlueCode first, then import again. Nothing was imported.`;
  }
}

export class T3HomeImportSourceDivergentError extends Schema.TaggedError<T3HomeImportSourceDivergentError>()(
  "T3HomeImportSourceDivergentError",
  { databasePath: Schema.String, skipped: Schema.Array(Schema.String) },
) {
  override get message(): string {
    return `The T3 Code database at ${this.databasePath} has a migration history this build cannot continue: ${this.skipped.join(", ")}. Nothing was imported.`;
  }
}

export class T3HomeImportDiskSpaceError extends Schema.TaggedError<T3HomeImportDiskSpaceError>()(
  "T3HomeImportDiskSpaceError",
  { directory: Schema.String, neededBytes: Schema.Number, freeBytes: Schema.Number },
) {
  override get message(): string {
    return `The import needs about ${formatBytes(this.neededBytes)} free in ${this.directory}, but only ${formatBytes(this.freeBytes)} is free. Nothing was changed.`;
  }
}

const STEP_LABELS = {
  inspect: "inspecting the data directories",
  snapshot: "copying the T3 Code database",
  migrate: "updating the copied database",
  scrub: "stopping T3 Code's live work in the copy",
  stage: "copying settings, secrets and attachments",
  publish: "moving the import into place",
} as const;

export class T3HomeImportStepError extends Schema.TaggedError<T3HomeImportStepError>()(
  "T3HomeImportStepError",
  {
    step: Schema.Literals(["inspect", "snapshot", "migrate", "scrub", "stage", "publish"]),
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return this.step === "publish"
      ? `The import failed while ${STEP_LABELS[this.step]} at ${this.path}. Check that data directory before you start the app.`
      : `The import failed while ${STEP_LABELS[this.step]} at ${this.path}. Nothing was changed.`;
  }
}

export type T3HomeImportError =
  | T3HomeImportSourceMissingError
  | T3HomeImportSameHomeError
  | T3HomeImportDestinationInUseError
  | T3HomeImportDestinationNotEmptyError
  | T3HomeImportDestinationBusyError
  | T3HomeImportSourceUnreadableError
  | T3HomeImportSourceNewerError
  | T3HomeImportSourceDivergentError
  | T3HomeImportDiskSpaceError
  | T3HomeImportStepError
  | ServerOwnership.OlderBootServiceError
  | ServerOwnership.ServerOwnershipError;

export type T3HomeImportPhase =
  | "preflight"
  | "snapshot"
  | "migrate"
  | "scrub"
  | "stage"
  | "publish";

export interface T3HomeImportProgress {
  readonly phase: T3HomeImportPhase;
  readonly message: string;
}

export interface T3HomeImportProbe {
  readonly sourceBaseDir: string;
  readonly found: boolean;
  readonly databaseKind: "v2" | "v1" | null;
  /** The database and its write-ahead log. */
  readonly databaseBytes: number;
  readonly migrationHead: number | null;
  readonly buildMigrationHead: number;
  readonly importable: boolean;
  readonly blockedReason: string | null;
  /** Not deleted; threads include archived ones. Null when the database cannot be read. */
  readonly projects: number | null;
  readonly threads: number | null;
  /** A T3 Code server owns the source; the import still copies a consistent snapshot. */
  readonly serverRunning: boolean;
}

export interface T3HomeImportScrub {
  readonly clearedRows: Readonly<Record<string, number>>;
  readonly scheduledTasksPaused: number;
  readonly runsStopped: number;
  readonly sessionsStopped: number;
  readonly queuedRunsHeld: number;
  readonly steersCancelled: number;
  readonly delegatedDeliveriesStopped: number;
  readonly limitResumesOff: number;
}

export interface T3HomeImportSummary {
  readonly sourceBaseDir: string;
  readonly destinationBaseDir: string;
  readonly databasePath: string;
  readonly databaseKind: "v2" | "v1";
  readonly sourceMigrationHead: number;
  readonly executedMigrations: ReadonlyArray<string>;
  readonly counts: T3ImportMarker["counts"];
  readonly scrub: T3HomeImportScrub;
  readonly files: {
    readonly copied: ReadonlyArray<string>;
    readonly skipped: ReadonlyArray<string>;
  };
  readonly secrets: { readonly copied: number; readonly skipped: number };
  readonly attachments: { readonly added: number; readonly existing: number };
  readonly themes: { readonly added: number; readonly existing: number };
  readonly backups: ReadonlyArray<string>;
}

export interface T3HomeImportInput {
  readonly sourceBaseDir: string;
  readonly destinationBaseDir: string;
  /** Import over a destination database that holds more than the first-run project and thread. */
  readonly replace: boolean;
  readonly onProgress?: (progress: T3HomeImportProgress) => Effect.Effect<void>;
}

export class T3HomeImport extends Context.Service<
  T3HomeImport,
  {
    /** Reads the source only, read-only; never takes its lock. */
    readonly probe: (sourceBaseDir: string) => Effect.Effect<T3HomeImportProbe>;
    /** Leaves the destination untouched unless it completes, except for a hard kill mid-publish. */
    readonly run: (
      input: T3HomeImportInput,
    ) => Effect.Effect<T3HomeImportSummary, T3HomeImportError>;
  }
>()("t3/persistence/T3HomeImport") {}

const COPIED_FILES = [
  "settings.json",
  "keybindings.json",
  "keybindings-migrations",
  "client-settings.json",
] as const;
const MERGED_DIRECTORIES = ["themes", "attachments"] as const;
// Settings secrets only. Signing keys, environment identity and T3 Connect state stay with T3 Code.
const COPIED_SECRET_PREFIXES = [
  "provider-env-",
  "provider-config-",
  "text-generator-",
  "usage-limit-source-",
  "voice-cloud-",
  "source-control-",
  "device-host-",
  "simlock-device-host-",
] as const;
const IMPORT_CLEARED_TABLES: ReadonlyArray<string> = [
  ...LIVE_STATE_TABLES,
  "auth_connect_devices",
  "scheduled_task_webhook_pending",
  "scheduled_task_webhook_deliveries",
  "scheduled_task_webhook_relay_deliveries",
  "scheduled_task_webhook_replay_keys",
];
const STAGING_PREFIX = ".t3-import-";
const BACKUP_SUFFIX = ".pre-t3-import-";

function formatBytes(bytes: number): string {
  return bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GiB`
    : bytes >= 1024 ** 2
      ? `${(bytes / 1024 ** 2).toFixed(1)} MiB`
      : `${Math.ceil(bytes / 1024)} KiB`;
}

const compatibilityError = (compatibility: DatabaseCompatibility, databasePath: string) => {
  switch (compatibility.status) {
    case "unreadable":
      return new T3HomeImportSourceUnreadableError({ databasePath });
    case "newer":
      return new T3HomeImportSourceNewerError({
        databasePath,
        newestMigration: compatibility.unknown.at(-1) ?? "",
      });
    case "divergent":
      return new T3HomeImportSourceDivergentError({ databasePath, skipped: compatibility.skipped });
    case "compatible":
      return undefined;
  }
};

const tableNames = Effect.fn("T3HomeImport.tableNames")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table'`;
  return new Set(rows.map((row) => row.name));
});

const countRows = <E, R>(query: Effect.Effect<ReadonlyArray<{ count: number }>, E, R>) =>
  Effect.map(query, (rows) => Number(rows[0]?.count ?? 0));

// V1 threads the server has not imported yet still count; it imports them at boot.
const readThreadCounts = Effect.fn("T3HomeImport.readThreadCounts")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* tableNames();
  const v2 = tables.has("orchestration_v2_projection_threads");
  const v1 = tables.has("projection_threads");
  const projects = tables.has("projection_projects")
    ? yield* countRows(
        sql`SELECT COUNT(*) AS count FROM projection_projects WHERE deleted_at IS NULL`,
      )
    : 0;
  const v2Threads = v2
    ? yield* countRows(
        sql`SELECT COUNT(*) AS count FROM orchestration_v2_projection_threads WHERE deleted_at IS NULL`,
      )
    : 0;
  const legacyThreads = !v1
    ? 0
    : v2
      ? yield* countRows(sql`SELECT COUNT(*) AS count FROM projection_threads legacy
            WHERE legacy.deleted_at IS NULL AND NOT EXISTS (
              SELECT 1 FROM orchestration_v2_projection_threads current
              WHERE current.thread_id = legacy.thread_id)`)
      : yield* countRows(
          sql`SELECT COUNT(*) AS count FROM projection_threads WHERE deleted_at IS NULL`,
        );
  const archivedThreads = v2
    ? yield* countRows(sql`SELECT COUNT(*) AS count FROM orchestration_v2_projection_threads
          WHERE deleted_at IS NULL AND archived_at IS NOT NULL`)
    : 0;
  const deletedThreads = v2
    ? yield* countRows(
        sql`SELECT COUNT(*) AS count FROM orchestration_v2_projection_threads WHERE deleted_at IS NOT NULL`,
      )
    : 0;
  return { projects, threads: v2Threads + legacyThreads, archivedThreads, deletedThreads };
});

// Mirrors isFreshFirstRunWorkspace: at most the first-run project and one thread that never ran.
const readDestinationState = Effect.fn("T3HomeImport.readDestinationState")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* tableNames();
  if (tables.size === 0) return { fresh: true, projects: 0, threads: 0 };
  const required = [
    "projection_projects",
    "orchestration_v2_projection_threads",
    "orchestration_v2_projection_runs",
    "orchestration_v2_projection_messages",
    "orchestration_v2_projection_provider_sessions",
  ];
  if (!required.every((table) => tables.has(table))) {
    return { fresh: false, projects: null, threads: null };
  }
  const [row] = yield* sql<{ projects: number; threads: number; used: number }>`
    SELECT
      (SELECT COUNT(*) FROM projection_projects WHERE deleted_at IS NULL) AS projects,
      (SELECT COUNT(*) FROM orchestration_v2_projection_threads WHERE deleted_at IS NULL) AS threads,
      (SELECT COUNT(*) FROM orchestration_v2_projection_threads t
        WHERE t.deleted_at IS NULL AND (
          t.project_id NOT IN (SELECT project_id FROM projection_projects WHERE deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM orchestration_v2_projection_runs r WHERE r.thread_id = t.thread_id)
          OR EXISTS (SELECT 1 FROM orchestration_v2_projection_messages m
            WHERE m.thread_id = t.thread_id AND m.role = 'user')
          OR EXISTS (SELECT 1 FROM orchestration_v2_projection_provider_sessions s
            WHERE s.thread_id = t.thread_id))) AS used`;
  const projects = Number(row?.projects ?? 0);
  const threads = Number(row?.threads ?? 0);
  return {
    fresh: projects <= 1 && threads <= 1 && Number(row?.used ?? 0) === 0,
    projects,
    threads,
  };
});

const scrubImportedDatabase = Effect.fn("T3HomeImport.scrubImportedDatabase")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const recovery = yield* ProviderRuntimeRecovery.ProviderRuntimeRecoveryService;
  const tables = yield* tableNames();
  const cleared = [...(yield* foreignKeyClosure(IMPORT_CLEARED_TABLES, "main"))].filter((table) =>
    tables.has(table),
  );
  const clearedRows: Record<string, number> = {};
  let scheduledTasksPaused = 0;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      // Children and parents in the closure go together; check their references at commit.
      yield* sql`PRAGMA defer_foreign_keys = ON`;
      for (const table of cleared) {
        clearedRows[table] = yield* countRows(sql`SELECT COUNT(*) AS count FROM ${sql(table)}`);
        yield* sql`DELETE FROM ${sql(table)}`;
      }
      scheduledTasksPaused = yield* countRows(
        sql`SELECT COUNT(*) AS count FROM scheduled_tasks WHERE enabled <> 0`,
      );
      yield* sql`UPDATE scheduled_tasks SET enabled = 0 WHERE enabled <> 0`;
      yield* stopPullRequestWatches();
      yield* stopSettleScripts();
    }),
  );

  // The server's own restart recovery ends the turns T3 Code had in flight, as a crash would.
  // Continuation is off here, so it neither resumes a turn nor resends an unstarted prompt.
  const reconciled = yield* recovery.reconcile("startup");

  // Each remaining path below would wake a provider when the destination's server boots.
  const now = yield* DateTime.now;
  const nowIso = DateTime.formatIso(now);
  const limited = yield* projections.getLimitRecoveryCandidates({
    now,
    autoResume: true,
    snooze: true,
  });
  let queuedRunsHeld = 0;
  let steersCancelled = 0;
  let delegatedDeliveriesStopped = 0;
  let limitResumesOff = 0;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      queuedRunsHeld =
        yield* countRows(sql`SELECT COUNT(*) AS count FROM orchestration_v2_projection_runs
          WHERE status = 'queued' AND json_extract(payload_json, '$.queueHeld') IS NOT 1`);
      yield* sql`UPDATE orchestration_v2_projection_runs
        SET payload_json = json_set(payload_json, '$.queueHeld', json('true'))
        WHERE status = 'queued' AND json_extract(payload_json, '$.queueHeld') IS NOT 1`;

      // Unread steers would be dispatched again as new turns.
      const steers = sql`
        FROM orchestration_v2_projection_turn_items AS item
        WHERE item.type = 'user_message' AND item.status = 'pending'
          AND CASE WHEN json_valid(item.payload_json)
            THEN json_extract(item.payload_json, '$.inputIntent') IN ('steer', 'promoted_queued_to_steer')
            ELSE 0 END
          AND EXISTS (
            SELECT 1 FROM orchestration_v2_projection_runs AS run
            WHERE run.run_id = item.run_id
              AND run.status IN ('completed', 'interrupted', 'failed', 'cancelled'))`;
      steersCancelled = yield* countRows(sql`SELECT COUNT(*) AS count ${steers}`);
      yield* sql`UPDATE orchestration_v2_projection_turn_items
        SET status = 'cancelled', updated_at = ${nowIso},
          payload_json = json_set(payload_json, '$.status', 'cancelled',
            '$.completedAt', ${nowIso}, '$.updatedAt', ${nowIso})
        WHERE turn_item_id IN (SELECT item.turn_item_id ${steers})`;

      // A stopped cohort disposes late subagent results instead of waking the parent's provider,
      // as when the user stops the parent. Spawning runs without a cohort would open a new one.
      const cohorts = sql`
        FROM orchestration_v2_projection_runs
        WHERE json_valid(payload_json) AND (
          json_extract(payload_json, '$.delegatedCompletion.disposition') = 'open'
          OR json_type(payload_json, '$.delegatedCompletion.delivery') = 'object'
          OR (json_type(payload_json, '$.delegatedCompletion') IS NULL AND run_id IN (
            SELECT run_id FROM orchestration_v2_projection_subagents
            WHERE origin = 'app_owned' AND run_id IS NOT NULL)))`;
      delegatedDeliveriesStopped = yield* countRows(sql`SELECT COUNT(*) AS count ${cohorts}`);
      yield* sql`UPDATE orchestration_v2_projection_runs
        SET payload_json = json_set(payload_json, '$.delegatedCompletion', json_object(
          'disposition', 'stopped',
          'nextGeneration', COALESCE(json_extract(payload_json, '$.delegatedCompletion.nextGeneration'), 1),
          'delivery', json('null')))
        WHERE run_id IN (SELECT run_id ${cohorts})`;

      // Removing limitRecovery would let the usage-limit worker arm it again from settings. A
      // recovery for the thread's current failure with autoResume off is never armed or resumed.
      limitResumesOff =
        yield* countRows(sql`SELECT COUNT(*) AS count FROM orchestration_v2_projection_threads
          WHERE json_extract(payload_json, '$.limitRecovery.autoResume') = 1`);
      yield* sql`UPDATE orchestration_v2_projection_threads
        SET payload_json = json_remove(
          json_set(payload_json, '$.limitRecovery.autoResume', json('false')),
          '$.limitRecovery.requestId')
        WHERE json_type(payload_json, '$.limitRecovery') = 'object'`;
      for (const thread of limited) {
        if (thread.latestRunId == null || thread.usageLimitResetAt == null) continue;
        limitResumesOff += 1;
        yield* sql`UPDATE orchestration_v2_projection_threads
          SET payload_json = json_set(payload_json, '$.limitRecovery', json_object(
            'runId', ${thread.latestRunId}, 'resetAt', ${thread.usageLimitResetAt},
            'autoResume', json('false'), 'snooze', json('false')))
          WHERE thread_id = ${thread.id}`;
      }
      // Recovery with continuation off enqueues nothing; clear anything it might in future.
      yield* sql`DELETE FROM orchestration_v2_effect_outbox`;
    }),
  );
  return {
    clearedRows,
    scheduledTasksPaused,
    runsStopped: reconciled.terminalizedRuns,
    sessionsStopped: reconciled.stoppedSessions,
    queuedRunsHeld,
    steersCancelled,
    delegatedDeliveriesStopped,
    limitResumesOff,
  } satisfies T3HomeImportScrub;
});

// The import's own reconcile must never continue a turn, whatever the copied settings say.
const layerScrub = (databasePath: string) =>
  ProviderRuntimeRecovery.layer.pipe(
    Layer.provideMerge(
      EventSink.layer.pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            EventStore.layer,
            ProjectionStore.layer,
            EffectOutbox.layer,
            IdAllocator.layer,
          ),
        ),
      ),
    ),
    Layer.provide(
      ServerSettings.ServerSettingsService.layerTest({ continueThreadsAfterServerUpdate: false }),
    ),
    Layer.provideMerge(SqlitePersistence.layerFromPath(databasePath)),
  );

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const context = yield* Effect.context<
    | FileSystem.FileSystem
    | Path.Path
    | ProcessRunner.ProcessRunner
    | SecureRandom.SecureRandom
    | Digest.Digest
  >();

  const exists = (target: string) => fs.exists(target).pipe(Effect.orElseSucceed(() => false));
  const fileSize = (target: string) =>
    fs.stat(target).pipe(
      Effect.map((info) => Number(info.size)),
      Effect.orElseSucceed(() => 0),
    );
  const inside = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  // The nearest existing ancestor's real path plus the missing components.
  const realLocation = (target: string): Effect.Effect<string> =>
    fs.realPath(target).pipe(
      Effect.catch(() => {
        const parent = path.dirname(target);
        return parent === target
          ? Effect.succeed(target)
          : Effect.map(realLocation(parent), (real) => path.join(real, path.basename(target)));
      }),
    );

  const locateSource = Effect.fn("T3HomeImport.locateSource")(function* (sourceBaseDir: string) {
    const stateDir = path.join(path.resolve(sourceBaseDir), "userdata");
    for (const [kind, file] of [
      ["v2", "statev2.sqlite"],
      ["v1", "state.sqlite"],
    ] as const) {
      const databasePath = path.join(stateDir, file);
      if (yield* exists(databasePath)) return Option.some({ stateDir, databasePath, kind });
    }
    return Option.none<{ stateDir: string; databasePath: string; kind: "v2" | "v1" }>();
  });

  const readSourceCounts = (databasePath: string) =>
    readThreadCounts().pipe(
      Effect.provide(NodeSqliteClient.layer({ filename: databasePath, readonly: true })),
      Effect.option,
      Effect.map(Option.getOrNull),
    );

  const probe = Effect.fn("T3HomeImport.probe")(function* (sourceBaseDir: string) {
    const baseDir = path.resolve(sourceBaseDir);
    const stateDir = path.join(baseDir, "userdata");
    const serverRunning = Option.isSome(
      yield* readLiveServerRuntimeState(path.join(stateDir, "server-runtime.json")).pipe(
        Effect.orElseSucceed(() => Option.none()),
      ),
    );
    const located = yield* locateSource(baseDir);
    if (Option.isNone(located)) {
      return {
        sourceBaseDir: baseDir,
        found: false,
        databaseKind: null,
        databaseBytes: 0,
        migrationHead: null,
        buildMigrationHead: BUILD_MIGRATION_HEAD,
        importable: false,
        blockedReason: new T3HomeImportSourceMissingError({ stateDir }).message,
        projects: null,
        threads: null,
        serverRunning,
      } satisfies T3HomeImportProbe;
    }
    const { databasePath, kind } = located.value;
    const compatibility = databaseCompatibility(databasePath);
    const blocked = compatibilityError(compatibility, databasePath);
    const counts =
      compatibility.status === "unreadable" ? null : yield* readSourceCounts(databasePath);
    return {
      sourceBaseDir: baseDir,
      found: true,
      databaseKind: kind,
      databaseBytes: (yield* fileSize(databasePath)) + (yield* fileSize(`${databasePath}-wal`)),
      migrationHead: compatibility.status === "unreadable" ? null : compatibility.head,
      buildMigrationHead: BUILD_MIGRATION_HEAD,
      importable: blocked === undefined && counts !== null,
      blockedReason:
        blocked?.message ??
        (counts === null ? new T3HomeImportSourceUnreadableError({ databasePath }).message : null),
      projects: counts?.projects ?? null,
      threads: counts?.threads ?? null,
      serverRunning,
    } satisfies T3HomeImportProbe;
  }, Effect.provide(context));

  const freeBytes = (directory: string) =>
    Effect.tryPromise({
      try: () => NodeFSP.statfs(directory),
      catch: (cause) => new T3HomeImportStepError({ step: "inspect", path: directory, cause }),
    }).pipe(Effect.map((stats) => stats.bavail * stats.bsize));

  // Hard links are free and safe for attachments, which are never rewritten in place.
  const linkOrCopy = (from: string, to: string) =>
    fs.link(from, to).pipe(Effect.catch(() => fs.copyFile(from, to)));

  const listFiles = Effect.fn("T3HomeImport.listFiles")(function* (directory: string) {
    if (!(yield* exists(directory))) return [];
    const entries = yield* fs.readDirectory(directory, { recursive: true });
    const files: string[] = [];
    for (const entry of entries) {
      const info = yield* fs.stat(path.join(directory, entry));
      if (info.type === "File") files.push(entry);
    }
    return files;
  });

  const checkpointDestination = Effect.fn("T3HomeImport.checkpointDestination")(function* (
    databasePath: string,
  ) {
    const result = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql.unsafe("PRAGMA busy_timeout = 0").unprepared;
      yield* sql.unsafe("BEGIN IMMEDIATE").unprepared;
      yield* sql.unsafe("ROLLBACK").unprepared;
      return yield* sql.unsafe<{ busy: number }>("PRAGMA wal_checkpoint(TRUNCATE)").unprepared;
    }).pipe(
      Effect.provide(NodeSqliteClient.layer({ filename: databasePath })),
      Effect.mapError((cause) => new T3HomeImportDestinationBusyError({ databasePath, cause })),
    );
    if (result[0] !== undefined && Number(result[0].busy) !== 0) {
      return yield* new T3HomeImportDestinationBusyError({ databasePath });
    }
  });

  const run = Effect.fn("T3HomeImport.run")(
    function* (input: T3HomeImportInput) {
      const report = input.onProgress ?? (() => Effect.void);
      const sourceBaseDir = path.resolve(input.sourceBaseDir);
      const destinationBaseDir = path.resolve(input.destinationBaseDir);
      const destinationStateDir = path.join(destinationBaseDir, "userdata");
      const located = yield* locateSource(sourceBaseDir);
      if (Option.isNone(located)) {
        return yield* new T3HomeImportSourceMissingError({
          stateDir: path.join(sourceBaseDir, "userdata"),
        });
      }
      const source = located.value;
      const [realSource, realDestination] = yield* Effect.all([
        realLocation(source.stateDir),
        realLocation(destinationStateDir),
      ]);
      if (
        realSource === realDestination ||
        inside(realSource, realDestination) ||
        inside(realDestination, realSource)
      ) {
        return yield* new T3HomeImportSameHomeError({
          sourceStateDir: source.stateDir,
          destinationStateDir,
        });
      }

      // Refuse a source this build cannot run on before touching the destination.
      const blocked = compatibilityError(
        databaseCompatibility(source.databasePath),
        source.databasePath,
      );
      if (blocked !== undefined) return yield* blocked;

      yield* report({ phase: "preflight", message: `Checking ${destinationStateDir}` });
      const inspectStep = Effect.mapError(
        (cause: unknown) =>
          new T3HomeImportStepError({ step: "inspect", path: destinationStateDir, cause }),
      );
      yield* fs.makeDirectory(destinationStateDir, { recursive: true }).pipe(inspectStep);
      // As the server keeps it; the import writes secrets here before any server runs.
      yield* fs.chmod(destinationStateDir, 0o700).pipe(Effect.ignore);
      yield* ServerOwnership.acquireServerOwnership(
        path.join(destinationStateDir, "server-runtime.json"),
      ).pipe(
        Effect.catchTags({
          ServerAlreadyRunningError: (cause) =>
            Effect.fail(
              new T3HomeImportDestinationInUseError({ stateDir: destinationStateDir, cause }),
            ),
        }),
      );
      // The lock is held, so no other import is running here: every staging folder is abandoned.
      for (const entry of yield* fs.readDirectory(destinationStateDir).pipe(inspectStep)) {
        if (entry.startsWith(STAGING_PREFIX)) {
          yield* fs
            .remove(path.join(destinationStateDir, entry), { recursive: true, force: true })
            .pipe(inspectStep);
        }
      }

      const databasePath = path.join(destinationStateDir, "statev2.sqlite");
      const destinationHasDatabase = yield* exists(databasePath);
      if (destinationHasDatabase) {
        const state = yield* readDestinationState().pipe(
          Effect.provide(NodeSqliteClient.layer({ filename: databasePath, readonly: true })),
          Effect.orElseSucceed(() => ({ fresh: false, projects: null, threads: null })),
        );
        if (!state.fresh && !input.replace) {
          return yield* new T3HomeImportDestinationNotEmptyError({
            databasePath,
            projects: state.projects,
            threads: state.threads,
          });
        }
        yield* checkpointDestination(databasePath);
      } else {
        // As the server does before it creates a database; a No_COW WAL cannot join a CoW one.
        yield* Effect.promise(() => markNoCopyOnWrite(destinationStateDir));
      }

      const sourceBytes =
        (yield* fileSize(source.databasePath)) + (yield* fileSize(`${source.databasePath}-wal`));
      const [sourceDevice, destinationDevice] = yield* Effect.all([
        fs.stat(source.stateDir).pipe(Effect.map((info) => info.dev)),
        fs.stat(destinationStateDir).pipe(Effect.map((info) => info.dev)),
      ]).pipe(inspectStep);
      let attachmentBytes = 0;
      if (sourceDevice !== destinationDevice) {
        const attachments = path.join(source.stateDir, "attachments");
        for (const file of yield* listFiles(attachments).pipe(inspectStep)) {
          attachmentBytes += yield* fileSize(path.join(attachments, file));
        }
      }
      // Migrations can grow the copy a little; VACUUM INTO writes no other temporary copy.
      const neededBytes = Math.ceil(sourceBytes * 1.1) + attachmentBytes;
      const available = yield* freeBytes(destinationStateDir).pipe(inspectStep);
      if (available < neededBytes) {
        return yield* new T3HomeImportDiskSpaceError({
          directory: destinationStateDir,
          neededBytes,
          freeBytes: available,
        });
      }

      const staging = yield* fs
        .makeTempDirectoryScoped({
          directory: destinationStateDir,
          prefix: `${STAGING_PREFIX}${process.pid}-`,
        })
        .pipe(inspectStep);
      const snapshotPath = path.join(staging, "statev2.sqlite");
      yield* report({
        phase: "snapshot",
        message: `Copying the T3 Code database (${formatBytes(sourceBytes)})`,
      });
      yield* snapshotDatabase(
        source.databasePath,
        snapshotPath,
        (cause) =>
          new T3HomeImportStepError({ step: "snapshot", path: source.databasePath, cause }),
      );
      // T3 Code may have updated between the check above and the copy.
      const snapshotCompatibility = databaseCompatibility(snapshotPath);
      const snapshotBlocked = compatibilityError(snapshotCompatibility, source.databasePath);
      if (snapshotBlocked !== undefined) return yield* snapshotBlocked;
      const sourceMigrationHead =
        snapshotCompatibility.status === "unreadable" ? 0 : snapshotCompatibility.head;
      const recordedBefore = new Set((recordedMigrations(snapshotPath) ?? []).map(({ id }) => id));

      yield* report({ phase: "migrate", message: "Updating the copy to this version's schema" });
      const { scrub, counts } = yield* Effect.gen(function* () {
        const scrubContext = yield* Layer.build(layerScrub(snapshotPath)).pipe(
          Effect.mapError(
            (cause) => new T3HomeImportStepError({ step: "migrate", path: snapshotPath, cause }),
          ),
        );
        return yield* Effect.gen(function* () {
          yield* report({ phase: "scrub", message: "Stopping T3 Code's live work in the copy" });
          const sql = yield* SqlClient.SqlClient;
          const scrub = yield* scrubImportedDatabase();
          const counts = yield* readThreadCounts();
          yield* sql`PRAGMA wal_checkpoint(TRUNCATE)`;
          return { scrub, counts };
        }).pipe(
          Effect.provide(scrubContext),
          Effect.mapError(
            (cause) => new T3HomeImportStepError({ step: "scrub", path: snapshotPath, cause }),
          ),
        );
      }).pipe(Effect.scoped);
      const publishStep = Effect.mapError(
        (cause: unknown) =>
          new T3HomeImportStepError({ step: "publish", path: databasePath, cause }),
      );
      if ((yield* fileSize(`${snapshotPath}-wal`)) > 0) {
        return yield* new T3HomeImportStepError({
          step: "scrub",
          path: snapshotPath,
          cause: new Error("The copy's write-ahead log was not checkpointed."),
        });
      }
      yield* fs.chmod(snapshotPath, 0o600).pipe(publishStep);
      const executedMigrations = (recordedMigrations(snapshotPath) ?? [])
        .filter(({ id }) => !recordedBefore.has(id))
        .map(({ id, name }) => `${id}_${name}`);

      yield* report({ phase: "stage", message: "Copying settings, secrets and attachments" });
      const stageStep = Effect.mapError(
        (cause: unknown) => new T3HomeImportStepError({ step: "stage", path: staging, cause }),
      );
      const replacements: Array<{ readonly staged: string; readonly target: string }> = [];
      const additions: Array<{ readonly staged: string; readonly target: string }> = [];
      const copiedFiles: string[] = [];
      for (const name of COPIED_FILES) {
        const from = path.join(source.stateDir, name);
        if (!(yield* exists(from))) continue;
        const staged = path.join(staging, name);
        yield* fs.copyFile(from, staged).pipe(stageStep);
        replacements.push({ staged, target: path.join(destinationStateDir, name) });
        copiedFiles.push(name);
      }
      let secretsCopied = 0;
      let secretsSkipped = 0;
      const sourceSecrets = path.join(source.stateDir, "secrets");
      if (yield* exists(sourceSecrets)) {
        yield* fs.makeDirectory(path.join(staging, "secrets")).pipe(stageStep);
        for (const entry of yield* fs.readDirectory(sourceSecrets).pipe(stageStep)) {
          const from = path.join(sourceSecrets, entry);
          const isFile = yield* fs.stat(from).pipe(
            Effect.map((info) => info.type === "File"),
            Effect.orElseSucceed(() => false),
          );
          const name = entry.endsWith(".bin") ? entry.slice(0, -4) : null;
          if (
            !isFile ||
            name === null ||
            !COPIED_SECRET_PREFIXES.some((prefix) => name.startsWith(prefix))
          ) {
            secretsSkipped += 1;
            continue;
          }
          const staged = path.join(staging, "secrets", entry);
          yield* fs.copyFile(from, staged).pipe(stageStep);
          yield* fs.chmod(staged, 0o600).pipe(stageStep);
          replacements.push({ staged, target: path.join(destinationStateDir, "secrets", entry) });
          secretsCopied += 1;
        }
        copiedFiles.push("secrets");
      }
      const merged = { themes: { added: 0, existing: 0 }, attachments: { added: 0, existing: 0 } };
      for (const directory of MERGED_DIRECTORIES) {
        const from = path.join(source.stateDir, directory);
        if (!(yield* exists(from))) continue;
        copiedFiles.push(directory);
        for (const file of yield* listFiles(from).pipe(stageStep)) {
          const target = path.join(destinationStateDir, directory, file);
          if (yield* exists(target)) {
            merged[directory].existing += 1;
            continue;
          }
          const staged = path.join(staging, directory, file);
          yield* fs.makeDirectory(path.dirname(staged), { recursive: true }).pipe(stageStep);
          yield* (
            directory === "attachments"
              ? linkOrCopy(path.join(from, file), staged)
              : fs.copyFile(path.join(from, file), staged)
          ).pipe(stageStep);
          additions.push({ staged, target });
          merged[directory].added += 1;
        }
      }
      const skippedFiles = (yield* fs.readDirectory(source.stateDir).pipe(stageStep))
        .filter((entry) => !copiedFiles.includes(entry))
        .sort();

      const sourceEnvironmentId = yield* fs
        .readFileString(path.join(source.stateDir, "environment-id"))
        .pipe(
          Effect.map((value) => value.trim() || null),
          Effect.orElseSucceed(() => null),
        );
      const importedAt = DateTime.formatIso(yield* DateTime.now);
      const marker: T3ImportMarker = {
        version: 1,
        importedAt,
        source: {
          baseDir: sourceBaseDir,
          databaseKind: source.kind,
          migrationHead: sourceMigrationHead,
          environmentId: sourceEnvironmentId,
        },
        counts,
      };
      const stagedMarker = path.join(staging, T3_IMPORT_MARKER_FILE);
      yield* encodeT3ImportMarker(marker).pipe(
        Effect.flatMap((json) => fs.writeFileString(stagedMarker, `${json}\n`)),
        stageStep,
      );

      yield* report({ phase: "publish", message: `Moving the import into ${destinationStateDir}` });
      const stamp = importedAt.replace(/[-:]/g, "").replace(/\.\d+/, "");
      const backups: string[] = [];
      if (destinationHasDatabase && (yield* fileSize(`${databasePath}-wal`)) > 0) {
        return yield* new T3HomeImportDestinationBusyError({ databasePath });
      }
      // Only renames from here on, so this takes moments; the database comes last because its
      // arrival is what makes the import visible. A hard kill here can leave it partial.
      yield* Effect.gen(function* () {
        yield* fs.rename(stagedMarker, path.join(destinationStateDir, T3_IMPORT_MARKER_FILE));
        yield* fs.makeDirectory(path.join(destinationStateDir, "secrets"), { recursive: true });
        yield* fs.chmod(path.join(destinationStateDir, "secrets"), 0o700);
        for (const { staged, target } of replacements) {
          if (yield* exists(target)) {
            const backup = `${target}${BACKUP_SUFFIX}${stamp}`;
            yield* fs.rename(target, backup);
            backups.push(backup);
          }
          yield* fs.rename(staged, target);
        }
        for (const { staged, target } of additions) {
          yield* fs.makeDirectory(path.dirname(target), { recursive: true });
          yield* fs.rename(staged, target);
        }
        if (destinationHasDatabase) {
          const backup = `${databasePath}${BACKUP_SUFFIX}${stamp}`;
          yield* linkOrCopy(databasePath, backup);
          backups.push(backup);
        }
        // A stale log or index must never pair with the new file.
        yield* fs.remove(`${databasePath}-wal`, { force: true });
        yield* fs.remove(`${databasePath}-shm`, { force: true });
        yield* fs.rename(snapshotPath, databasePath);
      }).pipe(publishStep, Effect.uninterruptible);

      return {
        sourceBaseDir,
        destinationBaseDir,
        databasePath,
        databaseKind: source.kind,
        sourceMigrationHead,
        executedMigrations,
        counts,
        scrub,
        files: { copied: copiedFiles, skipped: skippedFiles },
        secrets: { copied: secretsCopied, skipped: secretsSkipped },
        attachments: merged.attachments,
        themes: merged.themes,
        backups,
      } satisfies T3HomeImportSummary;
    },
    Effect.scoped,
    Effect.provide(context),
  );

  return T3HomeImport.of({ probe, run });
});

export const layer = Layer.effect(T3HomeImport, make);
