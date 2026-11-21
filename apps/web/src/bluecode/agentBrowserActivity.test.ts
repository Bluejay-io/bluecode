import type { PreviewSessionSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { agentDrivenPreviewTabId } from "./agentBrowserActivity";

const RUN_START = "2026-11-21T10:00:00.000Z";
const BEFORE_RUN = "2026-11-21T09:59:00.000Z";

/** `agentActiveAt` is when the agent last acted on the tab; `updatedAt` moves for anyone. */
const session = (
  tabId: string,
  agentActiveAt: string | null,
  updatedAt: string = agentActiveAt ?? BEFORE_RUN,
): PreviewSessionSnapshot => ({
  threadId: "thread-1",
  tabId: tabId as PreviewSessionSnapshot["tabId"],
  navStatus: { _tag: "Idle" },
  canGoBack: false,
  canGoForward: false,
  runtime: "server",
  automationOwner: "agent-1",
  ...(agentActiveAt === null ? {} : { agentActiveAt }),
  updatedAt,
});

const sessions = (...list: PreviewSessionSnapshot[]) =>
  Object.fromEntries(list.map((entry) => [entry.tabId, entry]));

const shell = (overrides: {
  status?: "running" | "waiting" | "idle" | "completed";
  hasPendingApprovals?: boolean;
  hasPendingUserInput?: boolean;
}) =>
  ({
    runtime: { status: overrides.status ?? "running" },
    latestRun: { startedAt: RUN_START, requestedAt: RUN_START },
    hasPendingApprovals: overrides.hasPendingApprovals ?? false,
    hasPendingUserInput: overrides.hasPendingUserInput ?? false,
  }) as unknown as Parameters<typeof agentDrivenPreviewTabId>[1];

describe("agentDrivenPreviewTabId", () => {
  it.each([
    {
      name: "the agent's tab touched this run",
      tabs: sessions(session("a", "2026-11-21T10:00:05.000Z")),
      run: shell({}),
      expected: "a",
    },
    {
      name: "only the most recently touched of several agent tabs",
      tabs: sessions(
        session("a", "2026-11-21T10:00:09.000Z"),
        session("b", "2026-11-21T10:00:05.000Z"),
      ),
      run: shell({}),
      expected: "a",
    },
    {
      name: "not a tab the agent last touched in an earlier run",
      tabs: sessions(session("a", BEFORE_RUN)),
      run: shell({}),
      expected: null,
    },
    {
      name: "an older tab the agent types into without navigating",
      tabs: sessions(session("a", "2026-11-21T10:00:05.000Z", BEFORE_RUN)),
      run: shell({}),
      expected: "a",
    },
    {
      name: "not an agent's older tab a person resizes during the run",
      tabs: sessions(session("a", BEFORE_RUN, "2026-11-21T10:00:05.000Z")),
      run: shell({}),
      expected: null,
    },
    {
      name: "not a tab no agent has acted on",
      tabs: sessions(session("a", null, "2026-11-21T10:00:05.000Z")),
      run: shell({}),
      expected: null,
    },
    {
      name: "nothing once the turn ends",
      tabs: sessions(session("a", "2026-11-21T10:00:05.000Z")),
      run: shell({ status: "idle" }),
      expected: null,
    },
    {
      name: "nothing while the agent waits on an approval",
      tabs: sessions(session("a", "2026-11-21T10:00:05.000Z")),
      run: shell({ hasPendingApprovals: true }),
      expected: null,
    },
    {
      name: "nothing without the thread's shell",
      tabs: sessions(session("a", "2026-11-21T10:00:05.000Z")),
      run: null,
      expected: null,
    },
    {
      name: "nothing while the server says a person controls the agent's tab",
      tabs: sessions(
        { ...session("a", "2026-11-21T10:00:09.000Z"), humanControlled: true },
        session("b", "2026-11-21T10:00:05.000Z"),
      ),
      run: shell({}),
      expected: null,
    },
    {
      name: "the agent's tab again once the server says control is released",
      tabs: sessions({ ...session("a", "2026-11-21T10:00:09.000Z"), humanControlled: false }),
      run: shell({}),
      expected: "a",
    },
    {
      name: "nothing while a person is using the agent's tab in a desktop view",
      tabs: sessions(session("a", "2026-11-21T10:00:09.000Z")),
      run: shell({}),
      desktop: { a: { controller: "human" as const } },
      expected: null,
    },
    {
      name: "the agent's tab while its desktop view is not in a person's hands",
      tabs: sessions(session("a", "2026-11-21T10:00:09.000Z")),
      run: shell({}),
      desktop: { a: { controller: "none" as const } },
      expected: "a",
    },
  ])("$name", ({ tabs, run, expected, ...rest }) => {
    const desktop = "desktop" in rest ? rest.desktop : undefined;
    expect(agentDrivenPreviewTabId(tabs, run, desktop)).toBe(expected);
  });
});
