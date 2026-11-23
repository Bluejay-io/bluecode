import { MousePointer2 } from "lucide-react";

import { observeVisibleAnimation } from "~/lib/visibleAnimation";

/** The agent's cursor: marks a browser tab, or the chip for it, as the one an agent drives. */
export function AgentDrivingBadge() {
  return (
    <MousePointer2 data-agent-driving-badge className="fill-current text-primary" aria-hidden />
  );
}

/**
 * A light circling the border of its positioned parent while an agent drives a tab. `inside` draws
 * the ring within the parent's edge, for a parent with no border of its own.
 */
export function AgentOrbit(props: { readonly inside?: boolean }) {
  return (
    <span data-agent-orbit data-inside={props.inside || undefined} aria-hidden>
      <span data-agent-orbit-light ref={observeVisibleAnimation} />
    </span>
  );
}
