import { msg } from "gt-react";

import {
  hasUnseenCompletion,
  resolveSidebarRowStatus,
  type SidebarThreadStatus,
} from "~/components/Sidebar.logic";
import type { SidebarThreadSummary } from "~/types";

/**
 * Everything a thread's agent can be doing, as one value every surface draws the same way:
 * busy states move, states that need the user hold still in colour, and a finished turn the
 * user has not opened is a message dot.
 */
export type AgentState =
  | "idle"
  | "starting"
  | "working"
  | "waiting"
  | "approval"
  | "input"
  | "request"
  | "limited"
  | "failed"
  | "unread"
  | "woke";

export function agentStateOf(
  status: SidebarThreadStatus,
  flags: { readonly isUnread: boolean; readonly isWoke: boolean },
): AgentState {
  switch (status) {
    case "preparing":
      return "starting";
    case "ready":
      return flags.isWoke ? "woke" : flags.isUnread ? "unread" : "idle";
    default:
      return status;
  }
}

/** For surfaces that hold only the shell, such as tabs: snooze wakes belong to the sidebar. */
export function agentStateOfShell(
  shell: SidebarThreadSummary,
  lastVisitedAt: string | undefined,
): AgentState {
  const thread = { ...shell, lastVisitedAt };
  return agentStateOf(resolveSidebarRowStatus(thread), {
    isUnread: hasUnseenCompletion(thread),
    isWoke: false,
  });
}

// Reuses the sidebar's existing strings so every locale already has them.
export const AGENT_STATE_LABELS = {
  starting: msg("Connecting"),
  working: msg("Working"),
  waiting: msg("Waiting"),
  approval: msg("Pending Approval"),
  input: msg("Awaiting Input"),
  request: msg("Guest Request"),
  limited: msg("Limited", { $context: "thread status: usage limited" }),
  failed: msg("Failed"),
  unread: msg("Completed"),
  woke: msg("Woke", { $context: "thread status: woke from snooze" }),
} as const satisfies Record<Exclude<AgentState, "idle">, string>;
