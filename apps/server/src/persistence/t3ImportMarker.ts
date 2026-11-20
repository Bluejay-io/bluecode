import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export const T3_IMPORT_MARKER_FILE = "t3-import.json";

export const T3ImportMarker = Schema.Struct({
  version: Schema.Literal(1),
  importedAt: Schema.String,
  source: Schema.Struct({
    baseDir: Schema.String,
    databaseKind: Schema.Literals(["v2", "v1"]),
    migrationHead: Schema.Number,
    environmentId: Schema.NullOr(Schema.String),
  }),
  counts: Schema.Struct({
    projects: Schema.Number,
    threads: Schema.Number,
    archivedThreads: Schema.Number,
    deletedThreads: Schema.Number,
  }),
});
export type T3ImportMarker = typeof T3ImportMarker.Type;

export const encodeT3ImportMarker = Schema.encodeEffect(Schema.fromJsonString(T3ImportMarker));
const decodeT3ImportMarker = Schema.decodeUnknownEffect(Schema.fromJsonString(T3ImportMarker));

/**
 * A home holding an import of T3 Code's database shares T3 Code's worktrees and checkpoint refs.
 * `importedAt` is null when the marker exists but cannot be read; treat everything as shared then.
 */
export const readT3ImportMarker = Effect.fn("t3ImportMarker.read")(function* (stateDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const markerPath = path.join(stateDir, T3_IMPORT_MARKER_FILE);
  if (!(yield* fs.exists(markerPath).pipe(Effect.orElseSucceed(() => true)))) {
    return Option.none<{ readonly importedAt: string | null }>();
  }
  const importedAt = yield* fs.readFileString(markerPath).pipe(
    Effect.flatMap(decodeT3ImportMarker),
    Effect.map((marker) => marker.importedAt),
    Effect.orElseSucceed(() => null),
  );
  return Option.some({ importedAt });
});
