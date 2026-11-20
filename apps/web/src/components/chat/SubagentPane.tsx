import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { useEffect } from "react";

import { ComposerHandleContext } from "../../composerHandleContext";
import type { SideChatParentPanel } from "../../lib/sideChatPane";
import { hostRightPanel } from "../../rightPanelStore";
import ChatView from "../ChatView";
import { BackgroundThreadContext } from "./backgroundThread";

/** BlueCode: a subagent tab. Its conversation is read-only; the parent thread drives it. */
export default function SubagentPane(props: {
  readonly parentRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly parentPanel: SideChatParentPanel;
}) {
  const { parentRef, environmentId, threadId } = props;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the parent panel as host in the panel store, so links in the subagent open as the parent's tabs
  useEffect(
    () => hostRightPanel(scopeThreadRef(environmentId, threadId), parentRef),
    [parentRef, environmentId, threadId],
  );
  return (
    <div data-side-chat-pane={threadId} className="flex h-full min-h-0 flex-col">
      <BackgroundThreadContext value>
        <ComposerHandleContext value={null}>
          <ChatView
            environmentId={environmentId}
            threadId={threadId}
            routeKind="server"
            embedded={props.parentPanel}
            readOnly
          />
        </ComposerHandleContext>
      </BackgroundThreadContext>
    </div>
  );
}
