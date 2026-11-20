import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

/** Another server's in-flight work and identity; a copied database must not act on these rows. */
export const LIVE_STATE_TABLES: ReadonlyArray<string> = [
  "orchestration_v2_effect_outbox",
  "orchestration_v2_thread_launch_workflows",
  "orchestration_command_receipts",
  "provider_session_runtime",
  "auth_sessions",
  "auth_pairing_links",
  "peer_environment_links",
];

/**
 * The tables plus every table whose rows reference one of them, however far down the chain a
 * newer migration added it: a row pointing into a cleared table cannot stay.
 */
export const foreignKeyClosure = Effect.fn("copiedDatabaseScrub.foreignKeyClosure")(function* (
  tables: ReadonlyArray<string>,
  schema: "main" | "src",
) {
  const sql = yield* SqlClient.SqlClient;
  const references = yield* sql<{ name: string; parent: string }>`
    SELECT m.name, f."table" AS parent
    FROM ${sql(schema)}.sqlite_master m, pragma_foreign_key_list(m.name, ${schema}) f
    WHERE m.type = 'table'`;
  const cleared = new Set(tables);
  for (let grew = true; grew;) {
    grew = false;
    for (const { name, parent } of references) {
      if (cleared.has(parent) && !cleared.has(name)) {
        cleared.add(name);
        grew = true;
      }
    }
  }
  return cleared;
});

/** Copied pull request links keep their history but stop being watched. */
export const stopPullRequestWatches = Effect.fn("copiedDatabaseScrub.stopPullRequestWatches")(
  function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`UPDATE orchestration_v2_projection_threads
      SET payload_json = json_set(payload_json, '$.pullRequests', json((
        SELECT json_group_array(json_remove(link.value, '$.watch') ORDER BY link.key)
        FROM json_each(payload_json, '$.pullRequests') AS link)))
      WHERE EXISTS (
        SELECT 1 FROM json_each(payload_json, '$.pullRequests') AS link
        WHERE json_extract(link.value, '$.watch') IS NOT NULL)`;
  },
);

/** Copied threads keep their real worktree paths, where a settle script would run. */
export const stopSettleScripts = Effect.fn("copiedDatabaseScrub.stopSettleScripts")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`UPDATE projection_projects
    SET scripts_json = (
      SELECT json_group_array(json_remove(script.value, '$.runOnSettle') ORDER BY script.key)
      FROM json_each(scripts_json) AS script)
    WHERE EXISTS (
      SELECT 1 FROM json_each(scripts_json) AS script
      WHERE json_extract(script.value, '$.runOnSettle') IS NOT NULL)`;
});
