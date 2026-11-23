import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ThreadId, type PreviewSessionSnapshot } from "@t3tools/contracts";
import { useGT } from "gt-react";

import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";

import type { AgentDriving } from "./agentBrowserActivity";
import { AgentDrivingBadge, AgentOrbit } from "./AgentDrivingBadge";
import { siteName } from "./siteName";

function pageTitle(session: PreviewSessionSnapshot): string | null {
  if (session.navStatus._tag === "Idle") return null;
  return session.navStatus.title.trim() || null;
}

/**
 * The site an agent is driving, with a light circling its border while the turn runs. Shown in
 * the chat header while the panel is shut, and in the panel's tab row while that tab has no panel
 * tab of its own; one click opens the tab in the panel.
 */
export function AgentTabChip(props: {
  readonly session: PreviewSessionSnapshot;
  readonly driving: AgentDriving;
  readonly noDrag: boolean;
}) {
  const gt = useGT();
  const { session, driving } = props;
  const site =
    (session.navStatus._tag === "Idle" ? null : siteName(session.navStatus.url)) ?? gt("Browser");
  // The accessible name carries the visible site; the tooltip adds the page's own title.
  const label = gt("Open {title}, the tab the agent is using", { title: site });
  const title = pageTitle(session);
  const hint = title ? gt("Open {title}, the tab the agent is using", { title }) : label;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            data-agent-tab-chip
            onClick={() =>
              useRightPanelStore
                .getState()
                .openBrowser(
                  scopeThreadRef(driving.environmentId, ThreadId.make(session.threadId)),
                  session.tabId,
                )
            }
            className={cn(
              "relative flex h-7 max-w-44 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset pr-2.5 pl-2 text-xs font-medium text-foreground hover:bg-accent/60",
              props.noDrag && "[-webkit-app-region:no-drag]",
            )}
          />
        }
      >
        <AgentOrbit />
        <AgentDrivingBadge />
        <span className="truncate">{site}</span>
      </TooltipTrigger>
      <TooltipPopup side="bottom">{hint}</TooltipPopup>
    </Tooltip>
  );
}
