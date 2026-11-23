import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { ThreadId, type EnvironmentId, type PreviewSessionSnapshot } from "@t3tools/contracts";

import { type DesktopPreviewOverlay, useThreadPreviewState } from "~/previewStateStore";
import { useQuietThreadShell } from "~/state/entities";

type AgentRunShell = Pick<
  EnvironmentThreadShell,
  "runtime" | "latestRun" | "hasPendingApprovals" | "hasPendingUserInput"
>;

/**
 * The tab the agent acted on (`agentActiveAt`) most recently in the running turn, through its
 * thinking, as the server's PreviewAgentActivity sees it. Nothing is driven while the agent waits
 * on the user, or while a person holds the tab (`humanControlled`, or a desktop view's controller).
 */
export function agentDrivenPreviewTabId(
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
  shell: AgentRunShell | null,
  desktopByTabId: Readonly<Record<string, Pick<DesktopPreviewOverlay, "controller">>> = {},
): string | null {
  if (shell === null || !threadRuntimeIsActive(shell.runtime)) return null;
  if (shell.hasPendingApprovals || shell.hasPendingUserInput) return null;
  const runStartedAt = shell.latestRun?.startedAt ?? shell.latestRun?.requestedAt;
  if (!runStartedAt) return null;
  const since = Date.parse(runStartedAt);
  let driven: { session: PreviewSessionSnapshot; at: number } | null = null;
  for (const session of Object.values(sessions)) {
    if (session.agentActiveAt === undefined) continue;
    const at = Date.parse(session.agentActiveAt);
    if (!(at >= since) || (driven !== null && at <= driven.at)) continue;
    driven = { session, at };
  }
  if (driven === null || driven.session.humanControlled) return null;
  return desktopByTabId[driven.session.tabId]?.controller === "human" ? null : driven.session.tabId;
}

export interface AgentDriving {
  readonly tabId: string;
  readonly environmentId: EnvironmentId;
}

// DEV only: `?agentDriving` forces the newest browser tab to read as driven, for visual checks
// without a real agent.
const forceDriving = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("agentDriving");
})();

/** A thread's preview sessions all share its id, so the sessions name the thread to watch. */
export function useAgentDriving(
  environmentId: EnvironmentId | null,
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
): AgentDriving | null {
  let agentSession: PreviewSessionSnapshot | undefined;
  for (const session of Object.values(sessions)) {
    if (session.agentActiveAt !== undefined || forceDriving) agentSession = session;
  }
  const threadRef =
    environmentId === null || agentSession === undefined
      ? null
      : scopeThreadRef(environmentId, ThreadId.make(agentSession.threadId));
  const shell = useQuietThreadShell(threadRef);
  const { desktopByTabId } = useThreadPreviewState(threadRef);
  if (environmentId === null || shell === null) return null;
  const tabId =
    forceDriving && agentSession !== undefined
      ? agentSession.tabId
      : agentDrivenPreviewTabId(sessions, shell, desktopByTabId);
  return tabId === null ? null : { tabId, environmentId };
}
