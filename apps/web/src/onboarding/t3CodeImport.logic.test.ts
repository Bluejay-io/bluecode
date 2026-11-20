import type { DesktopT3CodeImportProbe } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  nextT3CodeImportState,
  resolveT3CodeImportOffer,
  T3_CODE_IMPORT_IDLE,
  type T3CodeImportEvent,
  type T3CodeImportRunState,
} from "./t3CodeImport.logic";

const probe: DesktopT3CodeImportProbe = {
  sourceBaseDir: "/home/test/.t3",
  found: true,
  databaseKind: "v2",
  databaseBytes: 4096,
  migrationHead: 40,
  buildMigrationHead: 40,
  importable: true,
  blockedReason: null,
  projects: 3,
  threads: 12,
  serverRunning: false,
};

describe("resolveT3CodeImportOffer", () => {
  it.each([
    ["no bridge", null, { kind: "hidden" }],
    [
      "an unavailable primary",
      { _tag: "Unavailable", reason: "wsl-primary", message: null },
      { kind: "hidden" },
    ],
    ["no T3 Code data", { _tag: "Probed", probe: { ...probe, found: false } }, { kind: "hidden" }],
    [
      "an empty T3 Code home",
      { _tag: "Probed", probe: { ...probe, projects: 0, threads: 0 } },
      { kind: "hidden" },
    ],
    [
      "importable data",
      { _tag: "Probed", probe: { ...probe, serverRunning: true } },
      { kind: "importable", projects: 3, threads: 12, serverRunning: true },
    ],
    [
      "a newer T3 Code",
      {
        _tag: "Probed",
        probe: { ...probe, importable: false, migrationHead: 41, blockedReason: "Newer." },
      },
      { kind: "newer" },
    ],
    [
      "an unreadable database",
      {
        _tag: "Probed",
        probe: { ...probe, importable: false, migrationHead: null, blockedReason: "Unreadable." },
      },
      { kind: "blocked", reason: "Unreadable." },
    ],
  ] as const)("%s", (_name, result, expected) => {
    expect(resolveT3CodeImportOffer(result)).toEqual(expected);
  });
});

describe("nextT3CodeImportState", () => {
  const run = (events: ReadonlyArray<T3CodeImportEvent>, from = T3_CODE_IMPORT_IDLE) =>
    events.reduce<T3CodeImportRunState>(nextT3CodeImportState, from);

  it("follows progress and ends restarting after an import", () => {
    expect(run([{ type: "start" }])).toEqual({ status: "running", phase: null });
    expect(
      run([
        { type: "start" },
        { type: "progress", progress: { phase: "snapshot", message: "Copying" } },
        { type: "progress", progress: { phase: "migrate", message: "Migrating" } },
      ]),
    ).toEqual({ status: "running", phase: "migrate" });
    expect(
      run([
        { type: "start" },
        { type: "settled", result: { _tag: "Imported", projects: 3, threads: 12 } },
        { type: "progress", progress: { phase: "publish", message: "Late" } },
        { type: "start" },
      ]),
    ).toEqual({ status: "restarting" });
  });

  it("keeps the failure message, ignores stray progress, and retries from a failure", () => {
    const failed = run([
      { type: "start" },
      { type: "settled", result: { _tag: "Failed", error: "Busy", message: "In use." } },
      { type: "progress", progress: { phase: "stage", message: "Late" } },
    ]);
    expect(failed).toEqual({ status: "failed", error: "Busy", message: "In use." });
    expect(run([{ type: "start" }], failed)).toEqual({ status: "running", phase: null });
    expect(run([{ type: "start" }, { type: "rejected" }])).toEqual({
      status: "failed",
      error: null,
      message: null,
    });
  });

  it("stays running when the app reports an import already under way", () => {
    expect(
      run([
        { type: "start" },
        { type: "progress", progress: { phase: "scrub", message: "Scrubbing" } },
        { type: "settled", result: { _tag: "Busy" } },
      ]),
    ).toEqual({ status: "running", phase: "scrub" });
    expect(run([{ type: "progress", progress: { phase: "scrub", message: "Early" } }])).toEqual(
      T3_CODE_IMPORT_IDLE,
    );
  });
});
