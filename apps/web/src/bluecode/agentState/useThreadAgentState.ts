import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { resolveThreadLastVisitedAt } from "~/components/Sidebar.logic";
import { useQuietThreadShell } from "~/state/entities";
import { useUiStateStore } from "~/uiStateStore";

import { agentStateOfShell, type AgentState } from "./agentState";

export function useThreadAgentState(threadRef: ScopedThreadRef | null): AgentState {
  const shell = useQuietThreadShell(threadRef);
  const localLastVisitedAt = useUiStateStore((state) =>
    threadRef === null ? undefined : state.threadLastVisitedAtById[scopedThreadKey(threadRef)],
  );
  if (shell === null) return "idle";
  return agentStateOfShell(
    shell,
    resolveThreadLastVisitedAt(shell.lastVisitedAt, localLastVisitedAt),
  );
}
