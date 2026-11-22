import { useMessages } from "gt-react";
import type { ReactNode } from "react";

import { observeVisibleAnimation } from "~/lib/visibleAnimation";

import { AGENT_STATE_LABELS, type AgentState } from "./agentState";
import "./agent-state.css";

// Cut out of a filled disc, in a 12-unit box centred on 6,6.
const BADGE_GLYPHS: Partial<Record<AgentState, ReactNode>> = {
  approval: (
    <>
      <path d="M6 3.6V6.3" />
      <circle cx="6" cy="8.1" r="0.55" data-dot />
    </>
  ),
  input: (
    <>
      <path d="M4.75 4.7a1.3 1.3 0 1 1 1.85 1.2c-.4.2-.6.45-.6.95" />
      <circle cx="6" cy="8.3" r="0.55" data-dot />
    </>
  ),
  request: (
    <>
      <circle cx="6" cy="4.8" r="1.05" />
      <path d="M4 8.3a2.1 1.9 0 0 1 4 0" />
    </>
  ),
  limited: <path d="M5 4.3v3.4M7 4.3v3.4" />,
  failed: <path d="M4.5 4.5l3 3M7.5 4.5l-3 3" />,
  unread: <path d="M4.1 6.15l1.3 1.3 2.5-2.75" />,
  woke: <path d="M6 3.9V6l1.5.9" />,
};

/**
 * One glyph for what an agent is doing. Busy states are a core inside a ring that turns while
 * working; states that need the user, and an unread finished turn, are a filled disc with an
 * icon cut out of it. The ring animates only while the glyph is on screen.
 */
export function AgentStateIndicator(props: {
  readonly state: AgentState;
  /** Leave false where visible text already says the state. */
  readonly labelled?: boolean | undefined;
  readonly className?: string | undefined;
}) {
  const m = useMessages();
  if (props.state === "idle") return null;
  const glyph = BADGE_GLYPHS[props.state];
  return (
    <span
      ref={glyph === undefined ? observeVisibleAnimation : undefined}
      data-agent-state={props.state}
      {...(props.labelled
        ? { role: "img", "aria-label": m(AGENT_STATE_LABELS[props.state]) }
        : { "aria-hidden": true })}
      className={props.className}
    >
      {glyph === undefined ? (
        <>
          <svg viewBox="0 0 12 12" data-agent-ring>
            <circle cx="6" cy="6" r="5.25" data-track />
            <circle cx="6" cy="6" r="5.25" pathLength="100" data-arc />
          </svg>
          <i />
        </>
      ) : (
        <svg viewBox="0 0 12 12" data-agent-badge>
          {props.state === "unread" ? null : <circle cx="6" cy="6" r="5.6" data-halo />}
          <circle cx="6" cy="6" r={props.state === "unread" ? 4.3 : 4.6} data-disc />
          <g data-glyph>{glyph}</g>
        </svg>
      )}
    </span>
  );
}
