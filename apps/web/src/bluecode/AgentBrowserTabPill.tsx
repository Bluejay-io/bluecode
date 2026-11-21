import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ThreadId, type PreviewSessionSnapshot } from "@t3tools/contracts";
import { useGT } from "gt-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";

import type { AgentDriving } from "./agentBrowserActivity";
import { AgentDrivingBadge } from "./AgentDrivingBadge";

function sessionLabel(session: PreviewSessionSnapshot): string | null {
  if (session.navStatus._tag === "Idle") return null;
  if (session.navStatus.title.trim()) return session.navStatus.title;
  try {
    return new URL(session.navStatus.url).host || null;
  } catch {
    return null;
  }
}

/**
 * Agents open their browser tabs without a panel tab, so the tab an agent is driving gets this
 * pill in the tab row instead; it opens the tab in the panel, where its own tab takes over.
 */
export function AgentBrowserTabPill(props: {
  readonly session: PreviewSessionSnapshot;
  readonly driving: AgentDriving;
  readonly noDrag: boolean;
}) {
  const gt = useGT();
  const { session, driving } = props;
  const label = sessionLabel(session) ?? gt("Browser");
  const hint = gt("Agent is using this tab");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={gt("Open {title} in the panel", { title: label })}
            aria-description={hint}
            onClick={() =>
              useRightPanelStore
                .getState()
                .openBrowser(
                  scopeThreadRef(driving.environmentId, ThreadId.make(session.threadId)),
                  session.tabId,
                )
            }
            className={cn(
              "flex h-7 max-w-44 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border pr-2.5 pl-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              props.noDrag && "[-webkit-app-region:no-drag]",
            )}
          />
        }
      >
        <AgentDrivingBadge driving={driving} />
        <span className="truncate">{label}</span>
      </TooltipTrigger>
      <TooltipPopup side="bottom">{hint}</TooltipPopup>
    </Tooltip>
  );
}
