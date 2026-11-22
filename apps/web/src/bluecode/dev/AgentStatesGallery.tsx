/* oxlint-disable t3code/no-untranslated-copy -- dev-only fixture text; production builds drop this page. */
/**
 * BlueCode: a dev-only page with every agent state AgentStateIndicator draws, next to the icons it
 * replaced, in a sidebar row and a main-area tab strip, since most states are hard to reach live. main.tsx mounts
 * it at /__bluecode/agent-states; `?theme=<id>&mode=light|dark` picks the paint.
 */
import {
  AlarmClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotDashedIcon,
  GlobeIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
  SquareTerminalIcon,
  UserRoundIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import ReactDOM from "react-dom/client";

import { AgentStateIndicator } from "../agentState/AgentStateIndicator";
import type { AgentState } from "../agentState/agentState";
import { I18nProvider } from "../../i18n/I18nProvider";
import { cn } from "../../lib/utils";
import { applyThemePalette } from "../../themePalette";
import { ChatIcon, SideChatIcon } from "../icons/SideChatIcon";

const params = new URLSearchParams(window.location.search);
const THEME = params.get("theme") ?? "system";
const MODE = params.get("mode") === "dark" ? "dark" : "light";

function paint() {
  applyThemePalette(THEME, MODE);
  document.documentElement.classList.toggle("dark", MODE === "dark");
}

const STATES: ReadonlyArray<{
  state: Exclude<AgentState, "idle">;
  label: string;
  meaning: string;
  tone: string;
  current: ReactNode;
}> = [
  {
    state: "starting",
    label: "Setting up",
    meaning: "Session is starting",
    tone: "text-info-foreground",
    current: <CircleDashedIcon className="size-3" />,
  },
  {
    state: "working",
    label: "Working",
    meaning: "Agent is running a turn",
    tone: "text-info-foreground",
    current: <CircleDashedIcon className="size-3" />,
  },
  {
    state: "waiting",
    label: "Waiting",
    meaning: "Blocked on a subagent or background task",
    tone: "text-muted-foreground",
    current: <CircleDotDashedIcon className="size-3" />,
  },
  {
    state: "approval",
    label: "Approval",
    meaning: "Needs you to approve a command",
    tone: "text-warning-foreground",
    current: <ShieldQuestionIcon className="size-3" />,
  },
  {
    state: "input",
    label: "Input",
    meaning: "Asked you a question",
    tone: "text-indigo-600 dark:text-indigo-300",
    current: <MessageCircleQuestionIcon className="size-3" />,
  },
  {
    state: "request",
    label: "Request",
    meaning: "A guest is waiting on you",
    tone: "text-guest-foreground",
    current: <UserRoundIcon className="size-3" />,
  },
  {
    state: "limited",
    label: "Limited",
    meaning: "Hit a usage limit",
    tone: "text-warning-foreground",
    current: <CircleAlertIcon className="size-3" />,
  },
  {
    state: "failed",
    label: "Failed",
    meaning: "The turn errored",
    tone: "text-error-foreground",
    current: <CircleAlertIcon className="size-3" />,
  },
  {
    state: "unread",
    label: "Done",
    meaning: "Finished, and you haven't read it",
    tone: "text-(--agent-unread)",
    current: <CircleCheckIcon className="size-3 text-success-foreground" />,
  },
  {
    state: "woke",
    label: "Woke",
    meaning: "Back from snooze",
    tone: "text-warning-foreground",
    current: <AlarmClockIcon className="size-3" />,
  },
];

function Section(props: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
        {props.note ? <p className="text-xs text-muted-foreground">{props.note}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

function StateMatrix() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-3 py-2 font-medium">Before</th>
            <th className="px-3 py-2 font-medium">Orbit</th>
          </tr>
        </thead>
        <tbody>
          {STATES.map((row) => (
            <tr key={row.state} className="border-t border-border">
              <td className="px-3 py-2">
                <div className={cn("font-medium", row.tone)}>{row.label}</div>
                <div className="text-muted-foreground">{row.meaning}</div>
              </td>
              <td className={cn("px-3 py-2", row.tone)}>
                <div className="flex items-center gap-3">
                  {row.current}
                  <span className="inline-flex [zoom:2.5]">{row.current}</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <AgentStateIndicator state={row.state} labelled />
                  <span className="inline-flex [zoom:2.5]">
                    <AgentStateIndicator state={row.state} />
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SIDEBAR_ROWS: ReadonlyArray<{ title: string; state: AgentState; ago: string }> = [
  { title: "Refactor provider registry", state: "working", ago: "now" },
  { title: "Fix flaky checkpoint test", state: "approval", ago: "2m" },
  { title: "Which auth flow for mobile?", state: "input", ago: "4m" },
  { title: "Add usage page export", state: "unread", ago: "9m" },
  { title: "Bump effect to 4.1", state: "failed", ago: "12m" },
  { title: "Investigate websocket backpressure", state: "waiting", ago: "15m" },
  { title: "Write release notes", state: "idle", ago: "1h" },
];

function SidebarMock() {
  return (
    <div className="flex w-72 flex-col gap-0.5 rounded-xl border border-border bg-sidebar p-1.5">
      {SIDEBAR_ROWS.map((row) => {
        const meta = STATES.find((entry) => entry.state === row.state);
        return (
          <div
            key={row.title}
            className={cn(
              "flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5",
              row.state === "approval" && "bg-accent",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  row.state === "unread" ? "font-semibold text-foreground" : "text-foreground/90",
                )}
              >
                {row.title}
              </span>
              {meta ? (
                <span className={cn("inline-flex", meta.tone)}>
                  <AgentStateIndicator state={row.state} className="[--agent-size:1rem]" />
                </span>
              ) : (
                <span className="text-2xs text-muted-foreground">{row.ago}</span>
              )}
            </div>
            <div className="flex h-4 items-center gap-1.5 text-2xs">
              <span className="text-muted-foreground">main · bluecode</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tab(props: { icon: ReactNode; title: string; active?: boolean }) {
  return (
    <div
      className={cn(
        "flex h-7 max-w-44 items-center gap-1.5 rounded-md px-2 text-xs",
        props.active ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        {props.icon}
      </span>
      <span className="truncate">{props.title}</span>
    </div>
  );
}

function TabStripMock(props: { chatState: AgentState }) {
  return (
    <div className="flex h-10 w-[34rem] items-center gap-1 rounded-xl border border-border bg-background px-1.5">
      <div className="relative flex size-7 items-center justify-center rounded-md text-muted-foreground">
        {props.chatState === "idle" ? (
          <ChatIcon className="size-3.5" />
        ) : (
          <AgentStateIndicator state={props.chatState} labelled />
        )}
      </div>
      <Tab icon={<GlobeIcon className="size-3" />} title="localhost:5733" active />
      <Tab icon={<AgentStateIndicator state="working" />} title="Explore: find callers" />
      <Tab icon={<AgentStateIndicator state="input" />} title="Side chat: naming" />
      <Tab icon={<SideChatIcon className="size-3" />} title="Side chat: idea" />
      <Tab icon={<SquareTerminalIcon className="size-3" />} title="Terminal" />
    </div>
  );
}

function Gallery() {
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold">Agent states</h1>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <li>Moving means the agent is busy. Nothing that needs you moves.</li>
            <li>
              Colour means it's your move: amber approve, indigo answer, pink guest, red broke.
            </li>
            <li>A blue dot means a finished turn you haven't read.</li>
          </ul>
        </header>

        <Section title="Every state" note="Real size, then ×2.5. Before is the old sidebar icon.">
          <StateMatrix />
        </Section>

        <Section title="In place">
          <div className="flex flex-wrap items-start gap-6">
            <SidebarMock />
            <div className="flex flex-col gap-2">
              <p className="text-2xs text-muted-foreground">
                Main area, chat behind another tab, working:
              </p>
              <TabStripMock chatState="working" />
              <p className="text-2xs text-muted-foreground">…then finished, unread:</p>
              <TabStripMock chatState="unread" />
              <p className="text-2xs text-muted-foreground">…or waiting on your approval:</p>
              <TabStripMock chatState="approval" />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

export function mountAgentStatesGallery() {
  paint();
  window.setTimeout(paint, 500);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <I18nProvider>
      <Gallery />
    </I18nProvider>,
  );
}
