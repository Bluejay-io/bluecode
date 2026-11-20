// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
// Proves the update chain after a release: starts an installed older BlueCode, has it find,
// download and install the new release through its own updater, and checks the app on disk
// became that version. macOS only applies an update signed like the installed app, so this
// fails when a release would strand existing installs.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";
import * as NodeUtil from "node:util";
import { _electron, type ElectronApplication, type Page } from "playwright-core";

interface UpdateState {
  readonly status: string;
  readonly currentVersion: string;
  readonly availableVersion: string | null;
  readonly downloadedVersion: string | null;
  readonly message: string | null;
}
interface UpdateBridge {
  readonly getUpdateState: () => Promise<UpdateState>;
  readonly checkForUpdate: () => Promise<{ readonly state: UpdateState }>;
  readonly downloadUpdate: () => Promise<{ readonly state: UpdateState }>;
  readonly installUpdate: (expectedVersion?: string) => Promise<unknown>;
}
// Functions passed to page.evaluate run in the app's window, so each reads the bridge itself.
type AppWindow = { readonly desktopBridge: UpdateBridge };

const STEP_TIMEOUT_MS = 60_000;
const POLL_MS = 2_000;
const DOWNLOAD_POLLS = 300;
const INSTALL_POLLS = 150;

const { values } = NodeUtil.parseArgs({
  options: { app: { type: "string" }, "expect-version": { type: "string" } },
});
const appPath = values.app;
const expected = values["expect-version"];
if (!appPath || !expected) {
  throw new Error("Usage: bluecode-update-check.ts --app <BlueCode.app> --expect-version <x.y.z>");
}
const plist = NodePath.join(appPath, "Contents/Info.plist");
const installedVersion = () =>
  NodeChildProcess.execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleShortVersionString", plist],
    { encoding: "utf8" },
  ).trim();
const executable = NodePath.join(
  appPath,
  "Contents/MacOS",
  NodeChildProcess.execFileSync(
    "/usr/libexec/PlistBuddy",
    ["-c", "Print :CFBundleExecutable", plist],
    {
      encoding: "utf8",
    },
  ).trim(),
);

const startVersion = installedVersion();
const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "bluecode-update-check-"));
let step = "launching the installed app";
let app: ElectronApplication | undefined;
// Read at launch: Playwright drops the process handle once the app quits to install.
let child: NodeChildProcess.ChildProcess | undefined;

const pageWithBridge = async (launched: ElectronApplication): Promise<Page> => {
  for (let poll = 0; poll < STEP_TIMEOUT_MS / 500; poll++) {
    for (const page of launched.windows()) {
      if (await page.evaluate(() => "desktopBridge" in globalThis).catch(() => false)) return page;
    }
    await NodeTimersPromises.setTimeout(500);
  }
  throw new Error("No window exposed the desktop bridge.");
};

try {
  console.log(`Installed ${startVersion}, expecting an update to ${expected}.`);
  app = await _electron.launch({
    executablePath: executable,
    // HOME stays real: a fake HOME has no login keychain (see smoke-desktop-app.ts).
    env: { ...process.env, BLUECODE_HOME: home, T3CODE_TELEMETRY_ENABLED: "false" },
    timeout: STEP_TIMEOUT_MS,
  });
  child = app.process();
  step = "waiting for a window";
  const page = await pageWithBridge(app);

  // A release can take a moment to show up in the feed the updater reads.
  step = `finding ${expected} in the update feed`;
  let state = await page.evaluate(() =>
    (globalThis as unknown as AppWindow).desktopBridge.getUpdateState(),
  );
  for (let attempt = 0; attempt < 6 && state.availableVersion !== expected; attempt++) {
    if (attempt > 0) await NodeTimersPromises.setTimeout(20_000);
    state = (
      await page.evaluate(() => (globalThis as unknown as AppWindow).desktopBridge.checkForUpdate())
    ).state;
    console.log(
      `check ${attempt + 1}: ${state.status} ${state.availableVersion ?? state.message ?? ""}`,
    );
  }
  if (state.availableVersion !== expected) {
    throw new Error(
      `The updater offered ${state.availableVersion ?? "nothing"}: ${state.message ?? state.status}`,
    );
  }

  step = "downloading the update";
  void page
    .evaluate(() => (globalThis as unknown as AppWindow).desktopBridge.downloadUpdate())
    .catch(() => {});
  for (let poll = 0; state.status !== "downloaded"; poll++) {
    if (state.status === "error") throw new Error(`Download failed: ${state.message}`);
    if (poll >= DOWNLOAD_POLLS) throw new Error(`Download timed out in ${state.status}.`);
    await NodeTimersPromises.setTimeout(POLL_MS);
    state = await page.evaluate(() =>
      (globalThis as unknown as AppWindow).desktopBridge.getUpdateState(),
    );
  }

  // Installing quits the app, so the call never answers.
  step = "installing the update";
  void page
    .evaluate(
      (version) => (globalThis as unknown as AppWindow).desktopBridge.installUpdate(version),
      expected,
    )
    .catch(() => {});
  for (let poll = 0; installedVersion() !== expected; poll++) {
    if (poll >= INSTALL_POLLS) throw new Error(`The app on disk is still ${installedVersion()}.`);
    await NodeTimersPromises.setTimeout(POLL_MS);
  }
  console.log(`Update check passed: ${startVersion} updated itself to ${expected}.`);
} catch (error) {
  console.error(`Update check failed while ${step}.`);
  console.error(error instanceof Error ? error.message : error);
  const logsDir = NodePath.join(home, "userdata/logs");
  const appLogs = NodeFS.existsSync(logsDir)
    ? NodeFS.readdirSync(logsDir).map((name) => NodePath.join(logsDir, name))
    : [];
  for (const log of [
    ...appLogs,
    NodePath.join(NodeOS.homedir(), "Library/Caches/io.bluejay.bluecode.ShipIt/ShipIt_stderr.log"),
  ]) {
    if (!NodeFS.existsSync(log) || !NodeFS.statSync(log).isFile()) continue;
    console.error(`\nLast lines of ${log}:`);
    console.error(NodeFS.readFileSync(log, "utf8").split("\n").slice(-40).join("\n"));
  }
  process.exitCode = 1;
} finally {
  if (app) {
    const closed = app.close().catch(() => {});
    await Promise.race([closed, NodeTimersPromises.setTimeout(10_000, undefined, { ref: false })]);
    child?.kill("SIGKILL");
  }
}
