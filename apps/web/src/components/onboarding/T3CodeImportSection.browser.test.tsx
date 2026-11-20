import { RegistryContext } from "@effect/atom-react";
import type {
  DesktopT3CodeImportProbe,
  DesktopT3CodeImportProgress,
  DesktopT3CodeImportRunResult,
} from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import { useRef } from "react";
import { expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../../test/render";
import { T3CodeImportSection, useT3CodeImport } from "./T3CodeImportSection";

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
  serverRunning: true,
};

function Harness() {
  const holdPageRef = useRef(false);
  const t3CodeImport = useT3CodeImport({ enabled: true, holdPageRef });
  return <T3CodeImportSection t3CodeImport={t3CodeImport} />;
}

function fakeBridge(found: DesktopT3CodeImportProbe) {
  let progressListener: ((progress: DesktopT3CodeImportProgress) => void) | null = null;
  const runs: Array<(result: DesktopT3CodeImportRunResult) => void> = [];
  const bridge = {
    probe: vi.fn(async () => ({ _tag: "Probed" as const, probe: found })),
    run: vi.fn(
      () =>
        new Promise<DesktopT3CodeImportRunResult>((resolve) => {
          runs.push(resolve);
        }),
    ),
    onProgress: vi.fn((listener: (progress: DesktopT3CodeImportProgress) => void) => {
      progressListener = listener;
      return () => {
        progressListener = null;
      };
    }),
  };
  return {
    bridge,
    progress: (progress: DesktopT3CodeImportProgress) => progressListener?.(progress),
    settle: (result: DesktopT3CodeImportRunResult) => runs.shift()?.(result),
  };
}

async function mount(found: DesktopT3CodeImportProbe) {
  const fake = fakeBridge(found);
  const stub = stubGlobal("desktopBridge", { t3CodeImport: fake.bridge });
  const registry = AtomRegistry.make();
  const screen = await render(
    <RegistryContext.Provider value={registry}>
      <Harness />
    </RegistryContext.Provider>,
  );
  return {
    fake,
    screen,
    async [Symbol.asyncDispose]() {
      await screen[Symbol.asyncDispose]();
      registry.dispose();
      stub[Symbol.dispose]();
    },
  };
}

it("imports with live progress, then shows the failure with a retry", async () => {
  await using mounted = await mount(probe);
  const { fake, screen } = mounted;

  await expect.element(screen.getByText("3 projects, 12 threads")).toBeVisible();
  await expect
    .element(screen.getByText("T3 Code can stay open. Work running there arrives stopped."))
    .toBeVisible();
  await screen.getByRole("button", { name: "Import" }).click();

  await expect.element(screen.getByRole("status")).toHaveTextContent("Stopping BlueCode's server…");
  await expect.element(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
  await act(async () => fake.progress({ phase: "snapshot", message: "copying" }));
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Copying the T3 Code database…");

  await act(async () =>
    fake.settle({ _tag: "Failed", error: "DestinationNotEmpty", message: "Already has data." }),
  );
  await expect.element(screen.getByRole("alert")).toHaveTextContent("Already has data.");
  await screen.getByRole("button", { name: "Retry" }).click();
  expect(fake.bridge.run).toHaveBeenCalledTimes(2);
  await expect.element(screen.getByRole("status")).toHaveTextContent("Stopping BlueCode's server…");

  await act(async () => fake.settle({ _tag: "Imported", projects: 3, threads: 12 }));
  await expect.element(screen.getByRole("status")).toHaveTextContent("Restarting BlueCode…");
});

it("explains a newer T3 Code and offers no import", async () => {
  await using mounted = await mount({
    ...probe,
    importable: false,
    migrationHead: 41,
    blockedReason: "Written by a newer T3 Code.",
  });
  const { screen } = mounted;

  await expect
    .element(
      screen.getByText("This T3 Code is newer than BlueCode. Update BlueCode to import from it."),
    )
    .toBeVisible();
  expect(screen.container.querySelector("button")).toBeNull();
});
