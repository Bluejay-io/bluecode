// @effect-diagnostics nodeBuiltinImport:off - read synchronously by the preflight subprocess and at startup.
import * as NodeFS from "node:fs";
import * as NodeSqlite from "node:sqlite";

import { migrationManifest, skippedV2Migrations } from "./Migrations.ts";
import { reconciledV2PreviewHistory } from "./reconcileV2PreviewMigration.ts";

export const BUILD_MIGRATION_HEAD = Math.max(...migrationManifest.map(([id]) => id));

/** Migrations the database records, read-only. A missing or new database records none; one that
 * exists but cannot be read is null, since its history is unknown. */
export function recordedMigrations(
  databasePath: string,
): ReadonlyArray<{ readonly id: number; readonly name: string }> | null {
  let db: NodeSqlite.DatabaseSync;
  try {
    db = new NodeSqlite.DatabaseSync(databasePath, { readOnly: true });
  } catch {
    return NodeFS.existsSync(databasePath) ? null : [];
  }
  try {
    const hasTable = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'",
      )
      .get();
    if (hasTable === undefined) return [];
    return db
      .prepare("SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id")
      .all()
      .map((row) => ({ id: Number(row.migration_id), name: String(row.name) }));
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      // A read-only handle has nothing to flush; the result above already stands.
    }
  }
}

/** Highest migration the database holds once this build's startup migrations have run. A newer
 * build may have recorded more than this build knows. Undefined when the database is unreadable. */
export function databaseMigrationHead(databasePath: string): number | undefined {
  const recorded = recordedMigrations(databasePath);
  return recorded === null
    ? undefined
    : Math.max(BUILD_MIGRATION_HEAD, ...recorded.map(({ id }) => id));
}

export type DatabaseCompatibility =
  | { readonly status: "compatible"; readonly head: number }
  | { readonly status: "unreadable" }
  | { readonly status: "newer"; readonly head: number; readonly unknown: ReadonlyArray<string> }
  | {
      readonly status: "divergent";
      readonly head: number;
      readonly skipped: ReadonlyArray<string>;
    };

/** Whether this build can run on the database, from its recorded history, read-only. `unknown`
 * lists migrations a newer build wrote, oldest first. */
export function databaseCompatibility(databasePath: string): DatabaseCompatibility {
  const recorded = recordedMigrations(databasePath);
  if (recorded === null) return { status: "unreadable" };
  const head = Math.max(0, ...recorded.map(({ id }) => id));
  const unknown = recorded
    .filter(({ id }) => id > BUILD_MIGRATION_HEAD)
    .map(({ id, name }) => `${id}_${name}`);
  if (unknown.length > 0) return { status: "newer", head, unknown };
  // Startup reconciles V2 preview ids before it checks the history, so check what it will see.
  const reconciled = reconciledV2PreviewHistory(recorded);
  const skipped =
    reconciled === null ? ["an unexpected V2 preview history"] : skippedV2Migrations(reconciled);
  return skipped.length > 0
    ? { status: "divergent", head, skipped }
    : { status: "compatible", head };
}
