import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  DEFAULT_CLIENT_SETTINGS,
  type DeviceServiceState,
  type EnvironmentId,
  type PreviewSessionSnapshot,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { setAgentBrowserScreenForTests } from "../../bluecode/agentTakeoverPanel";
import { __setClientSettingsForTests } from "../../hooks/useSettings";

import { browserMiniPlayerSource, usePreviewMiniPlayerStore } from "../../previewMiniPlayerStore";
import {
  __testing as previewStateTesting,
  applyPreviewServerEvent,
  applyPreviewServerSnapshot,
  beginPreviewSessionClose,
  cancelPreviewSessionClose,
  reconcilePreviewServerSessions,
  resetPreviewStateForTests,
} from "../../previewStateStore";
import { useRightPanelStore } from "../../rightPanelStore";
import {
  applyDeviceSnapshot,
  followPreviewSessions,
  resetDeviceSessionBaselinesForTests,
  revealServerTabs,
  startAgentOpenedPreviews,
} from "./agentOpenedPreviews";

vi.mock("../../state/entities", () => ({
  readEnvironmentSupportsServerBrowser: () => true,
}));

const ref = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-1"));
const threadKey = scopedThreadKey(ref);

const device = {
  hostId: "local",
  id: "pixel",
  platform: "android",
  name: "Pixel 8",
  version: "15",
  booted: true,
  physical: false,
} as const;

const session = {
  threadId: ref.threadId,
  hostId: "local",
  deviceId: "pixel",
  platform: "android",
  openedAt: "2026-01-01T00:00:00.000Z",
} as const;

const deviceState = (input: {
  readonly sessions?: ReadonlyArray<
    Omit<typeof session, "openedAt"> & { readonly openedAt: string }
  >;
  readonly devices?: ReadonlyArray<typeof device>;
}) =>
  ({
    hosts: [],
    hostStatus: "ready",
    hostStatuses: {},
    devices: input.devices ?? [device],
    sessions: input.sessions ?? [],
    onboardingCompleted: true,
    agentAccessEnabled: true,
    hubBasePath: "/api/device-hub",
    revision: 0,
  }) as unknown as DeviceServiceState;

const layout = { sheetLayout: false };

function setup() {
  resetPreviewStateForTests();
  resetDeviceSessionBaselinesForTests();
  usePreviewMiniPlayerStore.setState({ byThreadKey: {} });
  useRightPanelStore.setState({ byThreadKey: {} });
  __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
  setAgentBrowserScreenForTests(null);
}

const miniPlayerSource = () => usePreviewMiniPlayerStore.getState().byThreadKey[threadKey]?.source;
const deviceTargets = (key = threadKey) =>
  useRightPanelStore
    .getState()
    .byThreadKey[key]?.surfaces.filter((surface) => surface.kind === "device")
    .map((surface) => surface.target) ?? [];

describe("applyDeviceSnapshot", () => {
  it("treats the first snapshot as a baseline and opens a panel tab for sessions that start later", () => {
    setup();
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), layout);
    expect(deviceTargets()).toEqual([]);

    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [] }), layout);
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), layout);
    expect(deviceTargets()).toMatchObject([{ deviceId: "pixel" }]);
    expect(miniPlayerSource()).toBeUndefined();
  });

  it("opens a session once its device summary arrives", () => {
    setup();
    applyDeviceSnapshot(ref.environmentId, deviceState({}), layout);
    applyDeviceSnapshot(
      ref.environmentId,
      deviceState({ sessions: [session], devices: [] }),
      layout,
    );
    expect(deviceTargets()).toEqual([]);

    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), layout);
    expect(deviceTargets()).toMatchObject([{ name: "Pixel 8" }]);
  });

  it("opens a panel tab once, and nothing in sheet layouts", () => {
    setup();
    const sheet = { sheetLayout: true };
    applyDeviceSnapshot(ref.environmentId, deviceState({}), sheet);
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), sheet);
    expect(useRightPanelStore.getState().byThreadKey[threadKey]).toBeUndefined();

    applyDeviceSnapshot(ref.environmentId, deviceState({}), layout);
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), layout);
    applyDeviceSnapshot(ref.environmentId, deviceState({}), layout);
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), layout);
    expect(deviceTargets()).toHaveLength(1);
    expect(miniPlayerSource()).toBeUndefined();
  });

  it("closes a floating device when its session ends, even before a baseline", () => {
    setup();
    usePreviewMiniPlayerStore.getState().open(ref, {
      kind: "device",
      hostId: "local",
      deviceId: "pixel",
      platform: "android",
      name: "Pixel 8",
    });
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), layout);
    expect(miniPlayerSource()).toMatchObject({ kind: "device" });

    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [] }), layout);
    expect(miniPlayerSource()).toBeUndefined();
  });

  it("opens a session that ended and reopened between two snapshots", () => {
    setup();
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), layout);
    expect(deviceTargets()).toEqual([]);

    const reopened = { ...session, openedAt: "2026-01-01T00:05:00.000Z" };
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [reopened] }), layout);
    expect(deviceTargets()).toMatchObject([{ deviceId: "pixel" }]);
  });

  it("opens a device for a thread that had no sessions when the baseline was taken", () => {
    setup();
    const otherRef = scopeThreadRef(ref.environmentId, ThreadId.make("thread-2"));
    applyDeviceSnapshot(ref.environmentId, deviceState({ sessions: [session] }), layout);
    applyDeviceSnapshot(
      ref.environmentId,
      deviceState({ sessions: [session, { ...session, threadId: otherRef.threadId }] }),
      layout,
    );
    expect(deviceTargets()).toEqual([]);
    expect(deviceTargets(scopedThreadKey(otherRef))).toMatchObject([{ deviceId: "pixel" }]);
  });
});

describe("revealServerTabs", () => {
  const tab = (tabId: string, force?: boolean): PreviewSessionSnapshot => ({
    threadId: "thread-1",
    tabId,
    navStatus: { _tag: "Loading", url: "http://localhost:5173/", title: "" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    runtime: "server",
    reveal: true,
    ...(force === undefined ? {} : { revealRequest: { id: "r1", force } }),
  });
  const floatingTabId = () => {
    const source = miniPlayerSource();
    return source?.kind === "browser" ? source.tabId : null;
  };

  it("never floats; a forced reveal opens its panel tab", () => {
    setup();
    const userActionRevision = useRightPanelStore.getState().getUserActionRevision(ref);
    revealServerTabs(ref, [tab("tab_plain")]);
    expect(floatingTabId()).toBeNull();
    expect(useRightPanelStore.getState().byThreadKey[threadKey]).toBeUndefined();
    setAgentBrowserScreenForTests({ threadKey, beside: false });
    revealServerTabs(ref, [tab("tab_forced", true)]);
    expect(floatingTabId()).toBeNull();
    expect(useRightPanelStore.getState().byThreadKey[threadKey]).toMatchObject({
      isOpen: true,
      activeSurfaceId: "browser:tab_forced",
    });
    expect(useRightPanelStore.getState().getUserActionRevision(ref)).toBe(userActionRevision);
  });

  const panel = () => useRightPanelStore.getState().byThreadKey[threadKey];
  const besideChat = { threadKey, beside: true };

  it("an agent's reveal opens the panel on its tab only beside the thread on screen", () => {
    setup();
    const userActionRevision = useRightPanelStore.getState().getUserActionRevision(ref);
    setAgentBrowserScreenForTests({ threadKey: "env-1:other-thread", beside: true });
    revealServerTabs(ref, [tab("tab_a", false)]);
    expect(panel()).toBeUndefined();

    // Full width and sheet layouts would cover the chat; the tab-row pill shows the agent instead.
    setAgentBrowserScreenForTests({ threadKey, beside: false });
    revealServerTabs(ref, [tab("tab_a", false)]);
    expect(panel()).toBeUndefined();

    setAgentBrowserScreenForTests(besideChat);
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      browserAutoShowFloatingPreview: false,
    });
    revealServerTabs(ref, [tab("tab_a", false)]);
    expect(panel()).toBeUndefined();

    __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
    revealServerTabs(ref, [tab("tab_a", false)]);
    expect(panel()).toMatchObject({ isOpen: true, activeSurfaceId: "browser:tab_a" });
    expect(useRightPanelStore.getState().getUserActionRevision(ref)).toBe(userActionRevision);
  });

  it("keeps a tab the user closed, or closed the panel on, shut to later reveals", () => {
    setup();
    setAgentBrowserScreenForTests(besideChat);
    revealServerTabs(ref, [tab("tab_a", false)]);
    useRightPanelStore.getState().close(ref);
    revealServerTabs(ref, [tab("tab_a", false)]);
    expect(panel()?.isOpen).toBe(false);
    // The dismissal is saved with the panel, so a reload mid-run does not reopen it.
    const saved = useRightPanelStore.persist
      .getOptions()
      .partialize?.(useRightPanelStore.getState());
    expect(saved).toMatchObject({
      byThreadKey: { [threadKey]: { dismissedDeviceSurfaceIds: ["browser:tab_a"] } },
    });

    revealServerTabs(ref, [tab("tab_b", false)]);
    useRightPanelStore.getState().closeSurface(ref, "browser:tab_b");
    revealServerTabs(ref, [tab("tab_b", false)]);
    expect(panel()?.activeSurfaceId).not.toBe("browser:tab_b");

    // An explicit `open: true` still shows it, and showing it again lifts the dismissal.
    revealServerTabs(ref, [tab("tab_a", true)]);
    expect(panel()).toMatchObject({ isOpen: true, activeSurfaceId: "browser:tab_a" });
    useRightPanelStore.getState().openBrowser(ref, "tab_a");
    expect(panel()?.dismissedDeviceSurfaceIds).toEqual(["browser:tab_b"]);
  });

  it("lets a thread opened on its chat at full width reveal its browser again in split view", () => {
    setup();
    setAgentBrowserScreenForTests(besideChat);
    revealServerTabs(ref, [tab("tab_a", false)]);
    // Full width, arriving from a thread with its panel hidden hides this one: navigation, not a dismissal.
    setAgentBrowserScreenForTests({ threadKey, beside: false });
    const from = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-2"));
    useRightPanelStore.getState().open(from, "diff");
    useRightPanelStore.getState().close(from);
    useRightPanelStore.getState().carryPanel(from, ref, true);
    expect(panel()?.isOpen).toBe(false);

    setAgentBrowserScreenForTests(besideChat);
    revealServerTabs(ref, [tab("tab_a", false)]);
    expect(panel()).toMatchObject({ isOpen: true, activeSurfaceId: "browser:tab_a" });
  });

  it("lifts a dismissal when the user brings the tab back by minimizing, without moving focus", () => {
    setup();
    setAgentBrowserScreenForTests(besideChat);
    revealServerTabs(ref, [tab("tab_a", false)]);
    useRightPanelStore.getState().close(ref);
    expect(panel()?.dismissedDeviceSurfaceIds).toEqual(["browser:tab_a"]);

    const userActionRevision = useRightPanelStore.getState().getUserActionRevision(ref);
    useRightPanelStore.getState().restoreSurface(ref, "browser:tab_a");
    expect(panel()).toMatchObject({ isOpen: true, activeSurfaceId: "browser:tab_a" });
    expect(panel()?.dismissedDeviceSurfaceIds ?? []).toEqual([]);
    expect(useRightPanelStore.getState().getUserActionRevision(ref)).toBe(userActionRevision);
  });

  it("a forced reveal never changes the panel of a thread that is not on screen", () => {
    setup();
    useRightPanelStore.getState().openBrowser(ref, "tab_a");
    useRightPanelStore.getState().open(ref, "diff");
    useRightPanelStore.getState().close(ref);
    const before = panel();

    // Settings or another thread is in front, so no thread, or another one, is registered.
    for (const screen of [null, { threadKey: "env-1:other-thread", beside: true }]) {
      setAgentBrowserScreenForTests(screen);
      revealServerTabs(ref, [tab("tab_a", true), tab("tab_b", true)]);
      expect(panel()).toBe(before);
    }
  });

  it("focuses a tab already in the panel when forced", () => {
    setup();
    setAgentBrowserScreenForTests({ threadKey, beside: false });
    useRightPanelStore.getState().openBrowser(ref, "tab_a");
    const browserSurfaceId = useRightPanelStore.getState().byThreadKey[threadKey]?.activeSurfaceId;
    useRightPanelStore.getState().open(ref, "diff");

    revealServerTabs(ref, [tab("tab_a", false)]);
    expect(useRightPanelStore.getState().byThreadKey[threadKey]?.activeSurfaceId).not.toBe(
      browserSurfaceId,
    );
    const userActionRevision = useRightPanelStore.getState().getUserActionRevision(ref);
    revealServerTabs(ref, [tab("tab_a", true)]);
    expect(useRightPanelStore.getState().byThreadKey[threadKey]?.activeSurfaceId).toBe(
      browserSurfaceId,
    );
    expect(floatingTabId()).toBeNull();
    // A user action moves keyboard focus into the panel; an agent reveal must not.
    expect(useRightPanelStore.getState().getUserActionRevision(ref)).toBe(userActionRevision);
  });
});

describe("followPreviewSessions", () => {
  const snapshot = (tabId: string, reveal = true): PreviewSessionSnapshot => ({
    threadId: "thread-1",
    tabId,
    navStatus: { _tag: "Loading", url: "http://localhost:5173/", title: "" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    runtime: "server",
    reveal,
  });
  const previewState = (sessions: ReadonlyArray<PreviewSessionSnapshot>, listLoaded = true) => ({
    ...previewStateTesting.EMPTY_THREAD_PREVIEW_STATE,
    listLoaded,
    sessions: Object.fromEntries(sessions.map((entry) => [entry.tabId, entry])),
  });
  const browserTabs = () =>
    useRightPanelStore
      .getState()
      .byThreadKey[threadKey]?.surfaces.filter((surface) => surface.kind === "preview")
      .map((surface) => surface.id) ?? [];

  it("adds visible sessions as tabs and drops tabs whose session ended", () => {
    setup();
    useRightPanelStore.getState().openBrowser(ref, "tab_gone");
    followPreviewSessions(ref, previewState([snapshot("tab_a"), snapshot("tab_hidden", false)]));
    expect(browserTabs()).toEqual(["browser:tab_a"]);
  });

  it("waits for the first server list before treating missing sessions as closed", () => {
    setup();
    useRightPanelStore.getState().openBrowser(ref, "tab_a");
    usePreviewMiniPlayerStore.getState().open(ref, browserMiniPlayerSource("tab_a"));
    followPreviewSessions(ref, previewState([], false));
    expect(browserTabs()).toEqual(["browser:tab_a"]);
    expect(miniPlayerSource()).toMatchObject({ kind: "browser", tabId: "tab_a" });

    followPreviewSessions(ref, previewState([]));
    expect(browserTabs()).toEqual([]);
    expect(miniPlayerSource()).toBeUndefined();
  });
});

describe("startAgentOpenedPreviews", () => {
  const serverEpoch = "server-a";
  const serverTab = (overrides: Partial<PreviewSessionSnapshot> = {}): PreviewSessionSnapshot => ({
    threadId: "thread-1",
    tabId: "tab_a",
    navStatus: { _tag: "Loading", url: "http://localhost:5173/", title: "" },
    canGoBack: false,
    canGoForward: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
    runtime: "server",
    reveal: true,
    ...overrides,
  });
  const following = () => {
    setup();
    return { [Symbol.dispose]: startAgentOpenedPreviews() };
  };
  const navigated = (revision: number, snapshot: PreviewSessionSnapshot) =>
    applyPreviewServerEvent(ref, {
      type: "navigated",
      threadId: "thread-1",
      tabId: snapshot.tabId,
      createdAt: snapshot.updatedAt,
      snapshot,
      serverEpoch,
      revision,
    });
  const floatingTabId = () => {
    const source = miniPlayerSource();
    return source?.kind === "browser" ? source.tabId : null;
  };
  const browserTabs = (threadKeyToRead = threadKey) =>
    useRightPanelStore
      .getState()
      .byThreadKey[threadKeyToRead]?.surfaces.filter((surface) => surface.kind === "preview")
      .map((surface) => surface.id);

  it("treats the first list as a baseline and gives tabs opened later a panel tab, never a float", () => {
    using _following = following();
    reconcilePreviewServerSessions(ref, {
      sessions: [serverTab({ tabId: "tab_restored" })],
      serverEpoch,
      revision: 1,
    });
    expect(floatingTabId()).toBeNull();
    expect(browserTabs()).toEqual(["browser:tab_restored"]);

    const opened = serverTab({ tabId: "tab_agent" });
    applyPreviewServerEvent(ref, {
      type: "opened",
      threadId: "thread-1",
      tabId: opened.tabId,
      createdAt: opened.updatedAt,
      snapshot: opened,
      serverEpoch,
      revision: 2,
    });
    expect(floatingTabId()).toBeNull();
    expect(browserTabs()).toEqual(["browser:tab_restored", "browser:tab_agent"]);
  });

  it("reveals an existing tab only for a new reveal request", () => {
    using _following = following();
    setAgentBrowserScreenForTests({ threadKey, beside: false });
    const tab = serverTab({ revealRequest: { id: "r1", force: false } });
    reconcilePreviewServerSessions(ref, { sessions: [tab], serverEpoch, revision: 1 });

    navigated(2, { ...tab, updatedAt: "2026-01-01T00:00:01.000Z" });
    expect(floatingTabId()).toBeNull();

    navigated(3, {
      ...tab,
      revealRequest: { id: "r2", force: true },
      updatedAt: "2026-01-01T00:00:02.000Z",
    });
    expect(useRightPanelStore.getState().byThreadKey[threadKey]?.activeSurfaceId).toBe(
      "browser:tab_a",
    );
  });

  it("never opens the panel for a tab an agent opened with `open: false`", () => {
    using _following = following();
    setAgentBrowserScreenForTests({ threadKey, beside: true });
    reconcilePreviewServerSessions(ref, { sessions: [], serverEpoch, revision: 1 });
    const background = serverTab({ reveal: false, automationOwner: "agent-1" });
    applyPreviewServerEvent(ref, {
      type: "opened",
      threadId: "thread-1",
      tabId: background.tabId,
      createdAt: background.updatedAt,
      snapshot: background,
      serverEpoch,
      revision: 2,
    });
    navigated(3, {
      ...background,
      agentActiveAt: "2026-01-01T00:00:03.000Z",
      updatedAt: "2026-01-01T00:00:03.000Z",
    });
    expect(useRightPanelStore.getState().byThreadKey[threadKey]?.isOpen ?? false).toBe(false);
  });

  it("leaves the panel store alone when only a tab's agent activity changes", () => {
    using _following = following();
    const tab = serverTab();
    reconcilePreviewServerSessions(ref, { sessions: [tab], serverEpoch, revision: 1 });
    const writes = vi.fn();
    const unsubscribe = useRightPanelStore.subscribe(writes);
    try {
      navigated(2, {
        ...tab,
        agentActiveAt: "2026-01-01T00:00:03.000Z",
        updatedAt: "2026-01-01T00:00:03.000Z",
      });
      expect(writes).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("never reveals tabs this client opened, desktop tabs, or a tab whose close failed", () => {
    using _following = following();
    const tab = serverTab({ tabId: "tab_closing" });
    reconcilePreviewServerSessions(ref, { sessions: [tab], serverEpoch, revision: 1 });
    applyPreviewServerSnapshot(ref, serverTab({ tabId: "tab_own", reveal: undefined }));
    applyPreviewServerSnapshot(ref, { ...serverTab({ tabId: "tab_desktop" }), runtime: "desktop" });
    beginPreviewSessionClose(ref, tab.tabId);
    cancelPreviewSessionClose(ref, tab, tab.tabId);
    expect(floatingTabId()).toBeNull();
  });

  it("follows background threads and closes the floating browser when its session ends", () => {
    using _following = following();
    const other = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-2"));
    reconcilePreviewServerSessions(other, {
      sessions: [serverTab({ threadId: "thread-2", tabId: "tab_b" })],
      serverEpoch,
      revision: 1,
    });
    expect(browserTabs(scopedThreadKey(other))).toEqual(["browser:tab_b"]);

    reconcilePreviewServerSessions(ref, { sessions: [], serverEpoch, revision: 1 });
    const opened = serverTab();
    applyPreviewServerEvent(ref, {
      type: "opened",
      threadId: "thread-1",
      tabId: opened.tabId,
      createdAt: opened.updatedAt,
      snapshot: opened,
      serverEpoch,
      revision: 2,
    });
    expect(floatingTabId()).toBeNull();
    usePreviewMiniPlayerStore.getState().open(ref, browserMiniPlayerSource("tab_a"));
    applyPreviewServerEvent(ref, {
      type: "closed",
      threadId: "thread-1",
      tabId: opened.tabId,
      createdAt: opened.updatedAt,
      serverEpoch,
      revision: 3,
    });
    expect(floatingTabId()).toBeNull();
  });
});
