import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  EventId,
  MessageId,
  type OrchestrationV2AppThread,
  type OrchestrationV2Run,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderSessionId,
  ProviderThreadId,
  RunId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as EffectOutbox from "../orchestration-v2/EffectOutbox.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as EventStore from "../orchestration-v2/EventStore.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProviderRuntimeRecovery from "../orchestration-v2/ProviderRuntimeRecoveryService.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as ServerOwnership from "../serverOwnership.ts";
import * as ServerSettings from "../serverSettings.ts";
import { BUILD_MIGRATION_HEAD } from "./databaseMigrationHead.ts";
import { runMigrations } from "./Migrations.ts";
import * as SqlitePersistence from "./Sqlite.ts";
import * as T3HomeImport from "./T3HomeImport.ts";

const providerInstanceId = ProviderInstanceId.make("codex");
const driver = ProviderDriverKind.make("codex");
const modelSelection = { instanceId: providerInstanceId, model: "gpt-5.4" };
const projectId = ProjectId.make("project:import");

const withDatabase = <A, E, R>(
  databasePath: string,
  effect: Effect.Effect<A, E, R | SqlClient.SqlClient>,
) => effect.pipe(Effect.provide(NodeSqliteClient.layer({ filename: databasePath })));

const count = (sql: SqlClient.SqlClient, table: string, where = "1") =>
  sql
    .unsafe<{ count: number }>(`SELECT COUNT(*) AS count FROM "${table}" WHERE ${where}`)
    .pipe(Effect.map((rows) => Number(rows[0]?.count ?? 0)));

const makeHomes = Effect.fn("test.makeHomes")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "t3-home-import-" }));
  const source = path.join(root, "t3");
  const destination = path.join(root, "bluecode");
  yield* fs.makeDirectory(path.join(source, "userdata"), { recursive: true });
  return {
    root,
    source,
    destination,
    sourceDatabase: path.join(source, "userdata", "statev2.sqlite"),
    destinationDatabase: path.join(destination, "userdata", "statev2.sqlite"),
  };
});

const insertProject = (sql: SqlClient.SqlClient, id: string, scripts = "[]") =>
  sql`INSERT INTO projection_projects
    (project_id, title, workspace_root, scripts_json, created_at, updated_at)
    VALUES (${id}, ${id}, ${`/work/${id}`}, ${scripts}, '2026-08-01', '2026-08-01')`;

/** A T3 Code database as a running server leaves it: live turns, pending work and identity. */
const seedLiveDatabase = Effect.fn("test.seedLiveDatabase")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const store = yield* ProjectionStore.ProjectionStoreV2;
  const now = yield* DateTime.now;
  const createThread = Effect.fnUntraced(function* (
    name: string,
    overrides: Partial<OrchestrationV2AppThread> = {},
  ) {
    const threadId = ThreadId.make(`thread:${name}`);
    yield* store.apply({
      id: EventId.make(`event:${name}:created`),
      type: "thread.created",
      threadId,
      occurredAt: now,
      payload: {
        createdBy: "user",
        creationSource: "web",
        id: threadId,
        projectId,
        title: name,
        providerInstanceId,
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        activeProviderThreadId: null,
        lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
        forkedFrom: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        lastVisitedAt: null,
        deletedAt: null,
        ...overrides,
      },
    });
    return threadId;
  });
  const createRun = Effect.fnUntraced(function* (
    threadId: ThreadId,
    status: OrchestrationV2Run["status"],
    overrides: Partial<OrchestrationV2Run> = {},
  ) {
    const ordinal = overrides.ordinal ?? 1;
    const runId = RunId.make(`run:${threadId}:${ordinal}`);
    yield* store.apply({
      id: EventId.make(`event:${runId}:created`),
      type: "run.created",
      threadId,
      runId,
      occurredAt: now,
      payload: {
        id: runId,
        threadId,
        ordinal,
        providerInstanceId,
        modelSelection,
        providerThreadId: null,
        userMessageId: MessageId.make(`message:${runId}`),
        rootNodeId: null,
        activeAttemptId: null,
        status,
        requestedAt: now,
        startedAt: now,
        completedAt: status === "running" || status === "queued" ? null : now,
        checkpointId: null,
        contextHandoffId: null,
        ...overrides,
      },
    });
    return runId;
  });

  yield* insertProject(
    sql,
    projectId,
    JSON.stringify([
      {
        id: "teardown",
        name: "Teardown",
        command: "./teardown",
        icon: "configure",
        runOnWorktreeCreate: false,
        runOnSettle: true,
      },
    ]),
  );

  // Mid-turn in T3 Code: a running run, a live session and an active provider thread.
  const running = yield* createThread("running");
  yield* createRun(running, "running");
  yield* store.apply({
    id: EventId.make("event:running:session"),
    type: "provider-session.attached",
    threadId: running,
    driver,
    providerInstanceId,
    occurredAt: now,
    payload: {
      id: ProviderSessionId.make("session:running"),
      driver,
      providerInstanceId,
      status: "ready",
      cwd: "/work/project",
      model: modelSelection.model,
      capabilities: CodexProviderCapabilitiesV2,
      createdAt: now,
      updatedAt: now,
      lastError: null,
    },
  });
  yield* store.apply({
    id: EventId.make("event:running:provider-thread"),
    type: "provider-thread.updated",
    threadId: running,
    occurredAt: now,
    payload: {
      id: ProviderThreadId.make("provider-thread:running"),
      appThreadId: running,
      ownerNodeId: null,
      driver,
      providerInstanceId,
      providerSessionId: null,
      nativeThreadRef: null,
      nativeConversationHeadRef: null,
      status: "active",
      firstRunOrdinal: null,
      lastRunOrdinal: null,
      handoffIds: [],
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
    },
  });

  // A user message waiting behind a finished turn.
  const queued = yield* createThread("queued");
  yield* createRun(queued, "completed");
  const queuedMessageId = MessageId.make("message:queued");
  const queuedRunId = yield* createRun(queued, "queued", {
    ordinal: 2,
    userMessageId: queuedMessageId,
    startedAt: null,
    queuePosition: 1,
  });
  yield* store.apply({
    id: EventId.make("event:queued:message"),
    type: "message.updated",
    threadId: queued,
    runId: queuedRunId,
    occurredAt: now,
    payload: {
      id: queuedMessageId,
      threadId: queued,
      runId: queuedRunId,
      nodeId: null,
      role: "user",
      text: "Queued work",
      attachments: [],
      streaming: false,
      createdAt: now,
      updatedAt: now,
      createdBy: "user",
      creationSource: "web",
    },
  });

  // One usage-limited thread the worker has not armed yet, one it armed to resume.
  for (const name of ["limited", "armed"]) {
    const threadId = yield* createThread(name);
    const runId = yield* createRun(threadId, "failed");
    yield* store.apply({
      id: EventId.make(`event:${name}:limit`),
      type: "turn-item.updated",
      threadId,
      occurredAt: now,
      payload: {
        id: TurnItemId.make(`item:${name}:limit`),
        threadId,
        runId,
        nodeId: null,
        providerThreadId: null,
        providerTurnId: null,
        nativeItemRef: null,
        parentItemId: null,
        ordinal: 1,
        status: "failed",
        title: "Usage limit reached",
        startedAt: now,
        completedAt: now,
        updatedAt: now,
        type: "error",
        failure: {
          class: "usage_limit",
          message: "Plan limit reached.",
          resetAt: "2099-01-01T00:00:00.000Z",
          code: "usageLimitExceeded",
          retryable: null,
        },
      },
    });
    if (name === "armed") {
      yield* sql`UPDATE orchestration_v2_projection_threads
        SET payload_json = json_set(payload_json, '$.limitRecovery', json(${JSON.stringify({
          runId,
          resetAt: "2099-01-01T00:00:00.000Z",
          autoResume: true,
          requestId: "command:limit",
        })}))
        WHERE thread_id = ${threadId}`;
    }
  }

  // Settled work holding a watched pull request, an unread steer and undelivered results.
  const idle = yield* createThread("idle");
  const idleRunId = yield* createRun(idle, "completed", {
    delegatedCompletion: {
      disposition: "open",
      nextGeneration: 2,
      delivery: { generation: 1, messageId: MessageId.make("message:delivery"), taskIds: [] },
    },
  });
  const spawningRunId = yield* createRun(idle, "completed", { ordinal: 2 });
  yield* sql`UPDATE orchestration_v2_projection_threads
    SET payload_json = json_set(payload_json, '$.pullRequests', json(${JSON.stringify([
      { number: 7, url: "https://github.com/owner/repo/pull/7", watch: { wakes: 0 } },
    ])}))
    WHERE thread_id = ${idle}`;
  yield* sql`INSERT INTO orchestration_v2_projection_turn_items
    (turn_item_id, thread_id, run_id, ordinal, type, status, updated_at, payload_json)
    VALUES ('item:steer', ${idle}, ${idleRunId}, 2, 'user_message', 'pending', '2026-08-01',
      '{"inputIntent":"steer","status":"pending"}')`;
  yield* sql`INSERT INTO orchestration_v2_projection_subagents
    (subagent_id, thread_id, run_id, parent_node_id, provider, origin, status, updated_at, payload_json)
    VALUES ('task:remote', ${idle}, ${spawningRunId}, 'node:parent', 'codex', 'app_owned', 'running',
      '2026-08-01', '{"remoteChild":{"environmentId":"peer"},"result":null}')`;

  yield* createThread("archived", { archivedAt: now });
  yield* createThread("deleted", { deletedAt: now });

  // Identity and pending work that belong to T3 Code's server.
  yield* sql`INSERT INTO orchestration_v2_effect_outbox
    (effect_id, command_id, thread_id, effect_type, payload_json, status, available_at, created_at, updated_at)
    VALUES ('effect:start', 'command:start', ${queued}, 'provider-turn.start', '{}', 'pending',
      '2026-08-01', '2026-08-01', '2026-08-01')`;
  yield* sql`INSERT INTO orchestration_v2_thread_launch_workflows
    (command_id, thread_id, project_id, status, title, created_at, updated_at)
    VALUES ('command:launch', 'thread:launching', ${projectId}, 'running', 'Launch', '2026-08-01', '2026-08-01')`;
  yield* sql`INSERT INTO orchestration_command_receipts
    (command_id, aggregate_kind, aggregate_id, accepted_at, result_sequence, status)
    VALUES ('command:from-t3', 'thread', ${queued}, '2026-08-01', 1, 'accepted')`;
  yield* sql`INSERT INTO provider_session_runtime
    (thread_id, provider_name, adapter_key, status, last_seen_at, resume_cursor_json)
    VALUES (${running}, 'codex', 'codex', 'running', '2026-08-01', '{"threadId":"native"}')`;
  yield* sql`INSERT INTO auth_sessions (session_id, subject, scopes, method, issued_at, expires_at)
    VALUES ('session-1', 'user', '[]', 'pairing', '2026-08-01', '2099-08-01')`;
  yield* sql`INSERT INTO auth_pairing_links (id, credential, method, scopes, subject, created_at, expires_at)
    VALUES ('link-1', 'credential', 'pairing', '[]', 'user', '2026-08-01', '2099-08-01')`;
  yield* sql`INSERT INTO auth_connect_devices (proof_key_thumbprint, approved_at)
    VALUES ('thumbprint', '2026-08-01')`;
  yield* sql`INSERT INTO peer_environment_links
    (environment_id, secret_name, label, urls_json, access, linked_at, expires_at)
    VALUES ('peer', 'peer-link-peer', 'Peer', '["https://peer.example"]', 'auto', '2026-08-01', '2099-08-01')`;
  yield* sql`INSERT INTO scheduled_tasks
    (task_id, title, prompt, enabled, schedule_json, project_id, workspace_strategy_json,
      model_selection_json, runtime_mode, interaction_mode, created_by, creation_source,
      created_at, updated_at, last_run_status, run_count)
    VALUES ('task-1', 'Nightly', 'Run it', 1, '{}', ${projectId}, '{}', '{}',
      'full-access', 'default', 'user', 'user', '2026-08-01', '2026-08-01', 'never', 0)`;
  yield* sql`INSERT INTO scheduled_task_webhook_pending
    (delivery_id, task_id, coalesce_key, due_at, task_json, request_json, delivery_ids_json)
    VALUES ('delivery-1', 'task-1', 'key-1', 1900000000000, '{}', '{}', '[]')`;
  yield* sql`INSERT INTO scheduled_task_webhook_replay_keys (task_id, replay_key, delivery_id, expires_at)
    VALUES ('task-1', 'replay-1', 'delivery-1', 1900000000000)`;
  yield* sql`INSERT INTO scheduled_task_webhook_deliveries
    (delivery_id, task_id, received_at, method, query, headers_json, body, body_bytes,
      body_truncated, outcome, signature_verified, missing_fields_json)
    VALUES ('delivery-1', 'task-1', '2026-08-01', 'POST', '', '{}', '', 0, 0, 'queued', 1, '[]')`;
  yield* sql`INSERT INTO scheduled_task_webhook_relay_deliveries (relay_delivery_id, task_id, seen_at)
    VALUES ('relay-1', 'task-1', '2026-08-01')`;
  return { running, queued, idle, idleRunId, spawningRunId };
});

const seedSource = <A, E>(
  databasePath: string,
  seed: Effect.Effect<A, E, SqlClient.SqlClient | ProjectionStore.ProjectionStoreV2>,
) =>
  seed.pipe(
    Effect.provide(
      ProjectionStore.layer.pipe(Layer.provideMerge(SqlitePersistence.layerFromPath(databasePath))),
    ),
  );

const runImport = (
  input: Omit<T3HomeImport.T3HomeImportInput, "replace"> & { replace?: boolean },
) =>
  T3HomeImport.T3HomeImport.pipe(
    Effect.flatMap((service) => service.run({ replace: false, ...input })),
  );

const layerTest = T3HomeImport.layer.pipe(
  Layer.provide(ProcessRunner.layer),
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
);

// The real home is never read: the ownership check looks for a boot service under it.
const hermetic = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-home-import-user-" });
    return yield* effect.pipe(Effect.provideService(HostProcess.HomeDirectory, home));
  });

it.layer(layerTest)("T3HomeImport", (it) => {
  it.effect.each([
    { name: "an older schema", head: 54, outcome: "imported" },
    { name: "this build's schema", head: undefined, outcome: "imported" },
    { name: "a newer schema", head: "newer", outcome: "T3HomeImportSourceNewerError" },
    { name: "a divergent history", head: "divergent", outcome: "T3HomeImportSourceDivergentError" },
  ] as const)("gates a source with $name", ({ head, outcome }) =>
    hermetic(
      Effect.gen(function* () {
        const homes = yield* makeHomes();
        yield* withDatabase(
          homes.sourceDatabase,
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            yield* runMigrations({
              toMigrationInclusive: typeof head === "number" ? head : undefined,
            });
            yield* insertProject(sql, "project:gate");
            if (head === "newer") {
              yield* sql`INSERT INTO effect_sql_migrations (migration_id, name)
                VALUES (${BUILD_MIGRATION_HEAD + 1}, 'FutureMigration')`;
            }
            if (head === "divergent") {
              yield* sql`UPDATE effect_sql_migrations SET name = 'OtherBuildMigration'
                WHERE migration_id = 60`;
            }
          }),
        );
        const service = yield* T3HomeImport.T3HomeImport;
        const probe = yield* service.probe(homes.source);
        assert.equal(probe.importable, outcome === "imported");
        assert.equal(probe.projects, 1);

        const result = yield* runImport({
          sourceBaseDir: homes.source,
          destinationBaseDir: homes.destination,
        }).pipe(Effect.result);
        if (outcome === "imported") {
          assert.equal(result._tag, "Success");
          if (result._tag === "Success") {
            assert.equal(result.success.counts.projects, 1);
            assert.equal(
              result.success.executedMigrations.includes("55_OrchestrationV2"),
              head === 54,
            );
          }
          return;
        }
        assert.equal(result._tag, "Failure");
        if (result._tag === "Failure") {
          assert.equal(result.failure._tag, outcome);
          assert.equal(probe.blockedReason, result.failure.message);
          if (result.failure._tag === "T3HomeImportSourceNewerError") {
            assert.equal(
              result.failure.newestMigration,
              `${BUILD_MIGRATION_HEAD + 1}_FutureMigration`,
            );
          }
        }
        assert.isFalse(yield* (yield* FileSystem.FileSystem).exists(homes.destinationDatabase));
      }),
    ),
  );

  it.effect("scrubs T3 Code's live work so a server booting on the import resumes nothing", () =>
    hermetic(
      Effect.gen(function* () {
        const homes = yield* makeHomes();
        const seeded = yield* seedSource(homes.sourceDatabase, seedLiveDatabase());

        const summary = yield* runImport({
          sourceBaseDir: homes.source,
          destinationBaseDir: homes.destination,
        });
        assert.deepInclude(summary.scrub, {
          scheduledTasksPaused: 1,
          runsStopped: 1,
          sessionsStopped: 1,
          steersCancelled: 1,
          delegatedDeliveriesStopped: 2,
          limitResumesOff: 2,
        });
        assert.deepInclude(summary.counts, { threads: 6, archivedThreads: 1, deletedThreads: 1 });

        yield* withDatabase(
          summary.databasePath,
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            for (const table of [
              "orchestration_v2_effect_outbox",
              "orchestration_v2_thread_launch_workflows",
              "provider_session_runtime",
              "auth_sessions",
              "auth_pairing_links",
              "auth_connect_devices",
              "peer_environment_links",
              "scheduled_task_webhook_pending",
              "scheduled_task_webhook_replay_keys",
              "scheduled_task_webhook_deliveries",
              "scheduled_task_webhook_relay_deliveries",
            ]) {
              assert.equal(yield* count(sql, table), 0, table);
            }
            assert.equal(
              yield* count(sql, "orchestration_command_receipts", "command_id = 'command:from-t3'"),
              0,
            );
            assert.equal(yield* count(sql, "scheduled_tasks", "enabled = 0"), 1);
            assert.equal(yield* count(sql, "orchestration_v2_projection_threads"), 7);
            const [running] = yield* sql<{ run: string; session: string; providerThread: string }>`
              SELECT
                (SELECT status FROM orchestration_v2_projection_runs WHERE thread_id = ${seeded.running}) AS run,
                (SELECT status FROM orchestration_v2_projection_provider_sessions WHERE thread_id = ${seeded.running}) AS session,
                (SELECT status FROM orchestration_v2_projection_provider_threads WHERE thread_id = ${seeded.running}) AS providerThread`;
            assert.deepEqual(running, {
              run: "cancelled",
              session: "stopped",
              providerThread: "idle",
            });
            assert.equal(
              yield* count(
                sql,
                "orchestration_v2_projection_turn_items",
                `thread_id = '${seeded.running}' AND json_extract(payload_json, '$.title') = 'Server restarted'`,
              ),
              1,
            );
            assert.equal(
              yield* count(
                sql,
                "orchestration_v2_projection_runs",
                "status = 'queued' AND json_extract(payload_json, '$.queueHeld') IS NOT 1",
              ),
              0,
            );
            assert.equal(
              yield* count(
                sql,
                "orchestration_v2_projection_turn_items",
                "turn_item_id = 'item:steer' AND status = 'cancelled'",
              ),
              1,
            );
            assert.equal(
              yield* count(
                sql,
                "orchestration_v2_projection_runs",
                `run_id IN ('${seeded.idleRunId}', '${seeded.spawningRunId}')
                  AND json_extract(payload_json, '$.delegatedCompletion.disposition') = 'stopped'
                  AND json_type(payload_json, '$.delegatedCompletion.delivery') = 'null'`,
              ),
              2,
            );
            const [scrubbedJson] = yield* sql<{ watch: string | null; scripts: string }>`
              SELECT
                (SELECT json_extract(payload_json, '$.pullRequests[0].watch')
                  FROM orchestration_v2_projection_threads WHERE thread_id = ${seeded.idle}) AS watch,
                (SELECT scripts_json FROM projection_projects WHERE project_id = ${projectId}) AS scripts`;
            assert.isNull(scrubbedJson?.watch);
            assert.notInclude(scrubbedJson?.scripts ?? "", "runOnSettle");
          }),
        );

        // Boot as a server with the most eager settings would, and look for anything to start.
        yield* Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const projections = yield* ProjectionStore.ProjectionStoreV2;
          const recovery = yield* ProviderRuntimeRecovery.ProviderRuntimeRecoveryService;
          yield* recovery.recover;
          assert.equal(yield* count(sql, "orchestration_v2_effect_outbox"), 0);
          for (const kind of ["runtime", "delegated-completions", "unread-steers"] as const) {
            assert.deepEqual(yield* projections.getRecoveryThreadIds(kind), [], kind);
          }
          for (const threadId of yield* projections.getRecoveryThreadIds("queued-runs")) {
            assert.isFalse(yield* projections.canStartQueuedRun(threadId), threadId);
          }
          // After the reset, with auto-resume and snooze on, no thread is armed or resumed.
          assert.deepEqual(
            yield* projections.getLimitRecoveryCandidates({
              now: DateTime.makeUnsafe("2099-01-02T00:00:00.000Z"),
              autoResume: true,
              snooze: true,
            }),
            [],
          );
        }).pipe(
          Effect.provide(
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
                ServerSettings.ServerSettingsService.layerTest({
                  continueThreadsAfterServerUpdate: true,
                  autoResumeLimitedThreads: true,
                }),
              ),
              Layer.provideMerge(SqlitePersistence.layerFromPath(summary.databasePath)),
            ),
          ),
        );
      }),
    ),
  );

  it.effect("copies settings, settings secrets and attachments, and nothing tied to T3 Code", () =>
    hermetic(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homes = yield* makeHomes();
        yield* seedSource(
          homes.sourceDatabase,
          SqlClient.SqlClient.pipe(Effect.flatMap((sql) => insertProject(sql, "project:files"))),
        );
        const sourceState = path.join(homes.source, "userdata");
        const write = (relative: string, contents = relative) =>
          Effect.gen(function* () {
            const target = path.join(sourceState, relative);
            yield* fs.makeDirectory(path.dirname(target), { recursive: true });
            yield* fs.writeFileString(target, contents);
          });
        const copied = [
          "settings.json",
          "keybindings.json",
          "keybindings-migrations",
          "client-settings.json",
          "themes/dusk.json",
          "attachments/thread/image.png",
          "secrets/provider-env-Y29kZXg-T1BFTkFJ.bin",
          "secrets/provider-config-Y29kZXg-Y29kZXg-a2V5.bin",
          "secrets/text-generator-ZGVmYXVsdA-YXBpS2V5.bin",
          "secrets/usage-limit-source-b3BlbmFp.bin",
          "secrets/voice-cloud-openai.bin",
          "secrets/source-control-Z2l0aHVi-dG9rZW4.bin",
          "secrets/device-host-bWFj-dG9rZW4.bin",
          "secrets/simlock-device-host-bWFj-dG9rZW4.bin",
        ];
        const leftBehind = [
          "environment-id",
          "anonymous-id",
          "server-owner.sqlite",
          "server-runtime.json",
          "connection-catalog.json",
          "saved-environments.json",
          "desktop-settings.json",
          "model-manifest.json",
          "clerk/session",
          "logs/server.log",
          "browser-artifacts/page.png",
          "provider-processes/codex.json",
          "relay-clients/client.json",
          "opencode-servers/server.json",
          "secrets/server-signing-key.bin",
          "secrets/asset-access-signing-key.bin",
          "secrets/mcp-oauth-signing-key.bin",
          "secrets/secret-request-salt.bin",
          "secrets/cloud-link.bin",
          "secrets/dpop-proof-key.bin",
          "secrets/peer-link-peer.bin",
          "secrets/files/blob",
        ];
        for (const file of [...copied, ...leftBehind]) yield* write(file);

        const summary = yield* runImport({
          sourceBaseDir: homes.source,
          destinationBaseDir: homes.destination,
        });

        const destinationState = path.join(homes.destination, "userdata");
        for (const file of copied) {
          assert.equal(
            yield* fs.readFileString(path.join(destinationState, file)),
            file,
            `${file} is copied`,
          );
        }
        // The destination has its own ownership lock; none of T3 Code's content arrives.
        for (const file of leftBehind) {
          const contents = yield* fs
            .readFileString(path.join(destinationState, file))
            .pipe(Effect.orElseSucceed(() => null));
          assert.notEqual(contents, file, `${file} stays`);
        }
        assert.equal(
          (yield* fs.stat(path.join(destinationState, "secrets/voice-cloud-openai.bin"))).mode &
            0o777,
          0o600,
        );
        // Attachments are hard links on one file system; settings are independent copies.
        const inode = (target: string) =>
          fs.stat(target).pipe(Effect.map((info) => Option.getOrNull(info.ino)));
        assert.equal(
          yield* inode(path.join(destinationState, "attachments/thread/image.png")),
          yield* inode(path.join(sourceState, "attachments/thread/image.png")),
        );
        assert.notEqual(
          yield* inode(path.join(destinationState, "settings.json")),
          yield* inode(path.join(sourceState, "settings.json")),
        );
        assert.deepEqual(summary.secrets, { copied: 8, skipped: 8 });
        assert.includeMembers(
          [...summary.files.skipped],
          ["environment-id", "anonymous-id", "logs"],
        );
        const marker = JSON.parse(
          yield* fs.readFileString(path.join(destinationState, "t3-import.json")),
        ) as {
          source: { environmentId: string | null; baseDir: string };
          counts: { projects: number };
        };
        assert.equal(marker.source.environmentId, "environment-id");
        assert.equal(marker.source.baseDir, homes.source);
        assert.equal(marker.counts.projects, 1);
        assert.deepEqual(
          (yield* fs.readDirectory(destinationState)).filter((entry) =>
            entry.startsWith(".t3-import-"),
          ),
          [],
        );
      }),
    ),
  );

  it.effect.each([
    { name: "a used destination without --replace", projects: 2, replace: false, imported: false },
    { name: "a used destination with --replace", projects: 2, replace: true, imported: true },
    { name: "a first-run destination", projects: 1, replace: false, imported: true },
  ])("handles $name", ({ projects, replace, imported }) =>
    hermetic(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homes = yield* makeHomes();
        yield* seedSource(
          homes.sourceDatabase,
          SqlClient.SqlClient.pipe(Effect.flatMap((sql) => insertProject(sql, "project:t3"))),
        );
        yield* fs.makeDirectory(path.dirname(homes.destinationDatabase), { recursive: true });
        yield* seedSource(
          homes.destinationDatabase,
          SqlClient.SqlClient.pipe(
            Effect.flatMap((sql) =>
              Effect.forEach(
                Array.from({ length: projects }, (_, index) => index),
                (index) => insertProject(sql, `project:own-${index}`),
              ),
            ),
          ),
        );
        const settingsPath = path.join(homes.destination, "userdata", "settings.json");
        yield* fs.writeFileString(settingsPath, "own settings");
        yield* fs.writeFileString(
          path.join(homes.source, "userdata", "settings.json"),
          "t3 settings",
        );
        const before = yield* fs.readFile(homes.destinationDatabase);

        const result = yield* runImport({
          sourceBaseDir: homes.source,
          destinationBaseDir: homes.destination,
          replace,
        }).pipe(Effect.result);

        if (!imported) {
          assert.equal(result._tag, "Failure");
          if (result._tag === "Failure") {
            assert.equal(result.failure._tag, "T3HomeImportDestinationNotEmptyError");
          }
          assert.deepEqual(yield* fs.readFile(homes.destinationDatabase), before);
          assert.equal(yield* fs.readFileString(settingsPath), "own settings");
          return;
        }
        assert.equal(result._tag, "Success");
        if (result._tag !== "Success") return;
        assert.equal(yield* fs.readFileString(settingsPath), "t3 settings");
        const databaseBackup = result.success.backups.find((backup) =>
          backup.startsWith(`${homes.destinationDatabase}.pre-t3-import-`),
        );
        const settingsBackup = result.success.backups.find((backup) =>
          backup.startsWith(`${settingsPath}.pre-t3-import-`),
        );
        assert.isDefined(databaseBackup);
        assert.equal(yield* fs.readFileString(settingsBackup ?? ""), "own settings");
        const kept = yield* withDatabase(
          databaseBackup ?? "",
          SqlClient.SqlClient.pipe(Effect.flatMap((sql) => count(sql, "projection_projects"))),
        );
        assert.equal(kept, projects);
        const now = yield* withDatabase(
          homes.destinationDatabase,
          SqlClient.SqlClient.pipe(
            Effect.flatMap(
              (sql) => sql<{ project_id: string }>`SELECT project_id FROM projection_projects`,
            ),
          ),
        );
        assert.deepEqual(
          now.map((row) => row.project_id),
          ["project:t3"],
        );
      }),
    ),
  );

  it.effect("refuses overlapping homes and a destination a server owns", () =>
    hermetic(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const homes = yield* makeHomes();
        yield* seedSource(
          homes.sourceDatabase,
          SqlClient.SqlClient.pipe(Effect.flatMap((sql) => insertProject(sql, "project:t3"))),
        );
        for (const destination of [homes.source, path.join(homes.source, "userdata", "nested")]) {
          const error = yield* runImport({
            sourceBaseDir: homes.source,
            destinationBaseDir: destination,
          }).pipe(Effect.flip);
          assert.equal(error._tag, "T3HomeImportSameHomeError");
        }

        yield* ServerOwnership.holdServerOwnershipLock(
          path.join(homes.destination, "userdata", "server-runtime.json"),
        );
        const error = yield* runImport({
          sourceBaseDir: homes.source,
          destinationBaseDir: homes.destination,
        }).pipe(Effect.flip);
        assert.equal(error._tag, "T3HomeImportDestinationInUseError");
      }),
    ),
  );
});
