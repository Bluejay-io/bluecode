/* oxlint-disable t3code/no-untranslated-copy -- dev-only fixture text; production builds drop this page. */
/**
 * BlueCode: a dev-only page that opens every panel around the composer at once, so their
 * surfaces can be reviewed on each theme. main.tsx mounts it at /__bluecode/composer-panels in
 * dev builds only; `?theme=<id>&mode=light|dark` picks the paint. Panels are the real
 * components with fixture data; the composer card copies ChatView's and ChatComposer's markup.
 */
import {
  EnvironmentId,
  RuntimeRequestId,
  ThreadId,
  type RuntimeMode,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  AlertTriangleIcon,
  CloudIcon,
  GitBranchIcon,
  InfoIcon,
  ListTreeIcon,
  MonitorIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import ReactDOM from "react-dom/client";

import { ContextUsageRing } from "../ContextUsageRing";
import {
  ComposerAttachButton,
  ComposerAttachmentFileList,
} from "../../components/chat/ComposerAttachmentStrip";
import { ComposerBanner } from "../../components/chat/ComposerBanner";
import {
  ComposerBannerStack,
  type ComposerBannerStackItem,
} from "../../components/chat/ComposerBannerStack";
import {
  ComposerCommandMenu,
  type ComposerCommandItem,
} from "../../components/chat/ComposerCommandMenu";
import { ComposerCommandMenuLayer } from "../../components/chat/ComposerCommandMenuLayer";
import { ComposerControl } from "../../components/chat/ComposerControl";
import {
  ComposerFooterModeControls,
  type RuntimeModeOption,
} from "../../components/chat/ComposerFooterControls";
import { ComposerPendingUserInputPanel } from "../../components/chat/ComposerPendingUserInputPanel";
import { ComposerPrimaryActions } from "../../components/chat/ComposerPrimaryActions";
import {
  ComposerSpeechButton,
  ComposerSpeechRecordingPill,
} from "../../components/chat/ComposerSpeechButton";
import { ComposerSurface } from "../../components/chat/ComposerSurface";
import { resolveRuntimeModeOptions } from "../../components/chat/runtimeModeConfig";
import { Button } from "../../components/ui/button";
import type { ComposerFileAttachment } from "../../composerDraftStore";
import { DraftId } from "../../composerDraftStore";
import { I18nProvider } from "../../i18n/I18nProvider";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import type { PendingUserInput } from "../../session-logic";
import { applyThemePalette } from "../../themePalette";

const params = new URLSearchParams(window.location.search);
const THEME = params.get("theme") ?? "system";
const MODE = params.get("mode") === "dark" ? "dark" : "light";
const ENVIRONMENT_ID = EnvironmentId.make("harness");
const THREAD_REF: ScopedThreadRef = {
  environmentId: ENVIRONMENT_ID,
  threadId: ThreadId.make("harness"),
};
const DRAFT = DraftId.make("harness");
const noop = () => {};
const RECORDING_STARTED_AT = Date.now() - 7_000;

function paint() {
  applyThemePalette(THEME, MODE);
  document.documentElement.classList.toggle("dark", MODE === "dark");
}

const MODES: RuntimeMode[] = ["approval-required", "auto-accept-edits", "auto", "full-access"];

const CONTEXT = {
  usedTokens: 132_000,
  maxTokens: 200_000,
  usedPercentage: 66,
  autoCompactThreshold: 180_000,
  updatedAt: "2026-11-21T00:00:00.000Z",
} as unknown as Parameters<typeof ContextUsageRing>[0]["usage"];

const FILES = [
  {
    type: "file",
    id: "harness-file-a",
    name: "release-notes.md",
    mimeType: "text/markdown",
    sizeBytes: 4_812,
    file: null,
  },
  {
    type: "file",
    id: "harness-file-b",
    name: "crash-report.log",
    mimeType: "text/plain",
    sizeBytes: 92_330,
    file: null,
  },
] as unknown as ComposerFileAttachment[];

const QUESTION: PendingUserInput = {
  requestId: RuntimeRequestId.make("harness-question"),
  createdAt: "2026-11-21T00:00:00.000Z",
  dismissible: true,
  responseCapability: "live",
  questions: [
    {
      id: "rollout",
      header: "Rollout",
      question: "How should this ship?",
      options: [
        { label: "Incremental", description: "One module at a time" },
        { label: "All at once", description: "A single release" },
      ],
      multiSelect: false,
    },
  ],
};

const COMMAND_ITEMS = [
  {
    id: "slash-model",
    type: "slash-command",
    command: "model",
    label: "/model",
    description: "Switch the model for this thread",
  },
  {
    id: "slash-side",
    type: "slash-command",
    command: "side",
    label: "/side",
    description: "Ask a side question",
  },
  {
    id: "slash-clear",
    type: "slash-command",
    command: "clear",
    label: "/clear",
    description: "Start a fresh session",
  },
] as unknown as ComposerCommandItem[];

const BANNERS: ComposerBannerStackItem[] = [
  {
    id: "env",
    group: "environment",
    variant: "error",
    icon: <CloudIcon />,
    title: "Machine disconnected",
    description: "Reconnecting to studio-mac…",
    actions: (
      <Button size="xs" variant="ghost">
        Retry
      </Button>
    ),
  },
  {
    id: "fallback",
    variant: "warning",
    icon: <AlertTriangleIcon />,
    title: "Using GPT-5.5 until the Claude limit resets",
    actions: (
      <Button size="xs" variant="ghost">
        Use default
      </Button>
    ),
    dismissLabel: "Dismiss",
    onDismiss: noop,
  },
  {
    id: "queued",
    variant: "default",
    icon: <ListTreeIcon />,
    title: "2 queued messages",
    children: (
      <ComposerBanner.Children>
        <ComposerBanner.Row>
          <ComposerBanner.Icon>
            <ComposerBanner.Dot />
          </ComposerBanner.Icon>
          <ComposerBanner.Content>Also update the changelog</ComposerBanner.Content>
        </ComposerBanner.Row>
        <ComposerBanner.Row>
          <ComposerBanner.Icon>
            <ComposerBanner.Dot />
          </ComposerBanner.Icon>
          <ComposerBanner.Content>Then open a pull request</ComposerBanner.Content>
        </ComposerBanner.Row>
      </ComposerBanner.Children>
    ),
  },
  {
    id: "plan",
    variant: "info",
    icon: <InfoIcon />,
    title: "Plan ready",
    description: "4 steps · review before it runs",
    actions: (
      <Button size="xs" variant="ghost">
        Open plan
      </Button>
    ),
  },
];

function Specimen(props: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function Footer(props: { modeOptions: RuntimeModeOption[]; state: "empty" | "text" | "running" }) {
  const [mode, setMode] = useState<RuntimeMode>("auto");
  return (
    <div
      data-chat-composer-footer="true"
      className="flex min-w-0 flex-nowrap items-center overflow-visible px-2 pb-2"
    >
      <div className="me-2">
        <ComposerAttachButton addComposerAttachments={async () => false} focusComposer={noop} />
      </div>
      <div
        data-chat-composer-actions="right"
        className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2"
      >
        <div
          data-chat-composer-footer-controls="true"
          className="relative flex min-w-0 flex-1 items-center justify-end gap-0.5"
        >
          <div data-resting-block="mode" className="flex w-max min-w-max shrink-0 items-center">
            <ComposerFooterModeControls
              runtimeMode={mode}
              runtimeModeOptions={props.modeOptions}
              onRuntimeModeChange={setMode}
            />
          </div>
          <span aria-hidden="true" className="min-w-0 flex-1" />
          <ContextUsageRing usage={CONTEXT} />
          <ComposerControl
            data-chat-provider-model-picker="true"
            className="group/model-trigger min-w-13"
          >
            <span data-chat-provider-model-picker-label="true">GPT-5.5</span>
            <span className="-ms-0.5 text-muted-foreground">High</span>
          </ComposerControl>
        </div>
        <ComposerPrimaryActions
          compact={false}
          canOperateThread
          pendingAction={null}
          isRunning={props.state === "running"}
          canInterrupt={props.state === "running"}
          isSendBusy={false}
          sendDisabledReason={null}
          isEnvironmentUnavailable={false}
          isPreparingWorktree={false}
          hasSendableContent={props.state === "text"}
          onPreviousPendingQuestion={noop}
          onInterrupt={noop}
        >
          <ComposerSpeechButton
            state={{ phase: "idle", error: null, errorAction: null }}
            onStart={noop}
          />
        </ComposerPrimaryActions>
      </div>
    </div>
  );
}

/** ChatView's shell and host around ChatComposer's form and card. */
function Composer(props: {
  above?: ReactNode;
  body?: ReactNode;
  prompt?: string;
  footer: ReactNode;
  contextStrip?: boolean;
  onBody?: (node: HTMLDivElement | null) => void;
  after?: ReactNode;
}) {
  return (
    <div className="relative">
      <ComposerSurface.Shell contextRow={props.contextStrip ?? false}>
        <ComposerSurface.Host>
          <div className="relative z-10">
            <form
              data-chat-composer-form="true"
              className="mx-auto w-full min-w-0 max-w-(--chat-content-max-width)"
              onSubmit={(event) => event.preventDefault()}
            >
              {props.above}
              <div className="relative">
                <ComposerSurface.Main>
                  <div data-chat-composer-surface="true" className="rounded-2xl">
                    <div
                      ref={(node) => props.onBody?.(node)}
                      data-chat-composer-body="true"
                      className="relative px-4 pt-3.5 pb-2 sm:pt-4"
                    >
                      {props.body}
                      <div
                        className={
                          props.prompt
                            ? "composer-tiptap text-sm leading-relaxed"
                            : "composer-tiptap text-placeholder text-sm leading-relaxed"
                        }
                      >
                        {props.prompt ?? "Ask anything..."}
                      </div>
                    </div>
                    {props.footer}
                  </div>
                </ComposerSurface.Main>
              </div>
            </form>
          </div>
        </ComposerSurface.Host>
        {props.contextStrip ? (
          <div className="min-h-0">
            <div className="relative z-0">
              <ComposerSurface.ContextStrip className="gap-1 font-normal text-foreground/70 text-xs dark:text-muted-foreground">
                <ComposerControl size="xs">
                  <MonitorIcon />
                  Local
                </ComposerControl>
                <ComposerControl size="xs">
                  <GitBranchIcon />
                  main
                </ComposerControl>
              </ComposerSurface.ContextStrip>
            </div>
          </div>
        ) : null}
      </ComposerSurface.Shell>
      {props.after}
    </div>
  );
}

function Harness() {
  const modeOptions = resolveRuntimeModeOptions(MODES, undefined) as RuntimeModeOption[];
  const [menuAnchor, setMenuAnchor] = useState<HTMLDivElement | null>(null);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-(--chat-content-max-width) flex-col gap-10 px-4 py-8 [--chat-content-max-width:46rem]">
        <header className="flex items-center gap-2 text-sm">
          <InfoIcon className="size-4 text-muted-foreground" />
          <span>
            Composer panels · <b>{THEME}</b> · {MODE}
          </span>
        </header>

        <Specimen title="Thread: banners, question drawer, attachments, context strip">
          <Composer
            contextStrip
            above={
              <ComposerBanner.Dock>
                <ComposerBanner.Column>
                  <ComposerBannerStack items={BANNERS} />
                  <ComposerBanner.Attachment>
                    <ComposerBanner.Root data-chat-composer-top-drawer="true" variant="info">
                      <ComposerPendingUserInputPanel
                        pendingUserInputs={[QUESTION]}
                        threadRef={THREAD_REF}
                        cwd={undefined}
                        respondingRequestIds={[]}
                        answers={{}}
                        questionIndex={0}
                        onToggleOption={noop}
                        onAdvance={noop}
                        onDismiss={noop}
                      />
                    </ComposerBanner.Root>
                  </ComposerBanner.Attachment>
                </ComposerBanner.Column>
              </ComposerBanner.Dock>
            }
            body={
              <ComposerAttachmentFileList
                files={FILES}
                resolvedTheme={MODE}
                supportsAttachmentUploads
                maxFileAttachmentBytes={10_000_000}
                fileStagingLimit={null}
                environmentId={ENVIRONMENT_ID}
                attachmentDraftTarget={DRAFT}
                canOperateThread
                onPreviewFile={noop}
                onRemoveFile={noop}
              />
            }
            prompt="Answer the question above, then ship it"
            footer={<Footer modeOptions={modeOptions} state="text" />}
          />
        </Specimen>

        <Specimen title="Slash menu open over an empty composer">
          <div className="h-56" />
          <Composer
            onBody={setMenuAnchor}
            prompt="/"
            body={
              menuAnchor ? (
                <ComposerCommandMenuLayer anchor={menuAnchor}>
                  <ComposerCommandMenu
                    listId="harness-commands"
                    items={COMMAND_ITEMS}
                    resolvedTheme={MODE}
                    isLoading={false}
                    triggerKind="slash-command"
                    activeItemId="slash-model"
                    onHighlightedItemChange={noop}
                    onSelect={noop}
                  />
                </ComposerCommandMenuLayer>
              ) : null
            }
            footer={<Footer modeOptions={modeOptions} state="empty" />}
          />
        </Specimen>

        <Specimen title="Running, dictating">
          <Composer
            prompt="Steer: also cover the mobile layout"
            body={
              <div
                aria-label="Live transcription"
                className="mb-3 flex max-h-32 flex-col-reverse overflow-y-auto rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm leading-relaxed"
              >
                <div>
                  <span>also cover the mobile </span>
                  <span className="text-muted-foreground">layout please</span>
                </div>
              </div>
            }
            footer={
              <div
                data-chat-composer-footer="true"
                className="flex min-w-0 flex-nowrap items-center justify-end gap-2 overflow-visible px-2 pb-2"
              >
                <ComposerSpeechRecordingPill
                  state={{ phase: "recording", error: null, errorAction: null }}
                  progress={null}
                  level={0.4}
                  recordingStartedAt={RECORDING_STARTED_AT}
                  onStart={noop}
                  onStop={noop}
                  onCancel={noop}
                  onSkipPostProcessing={noop}
                />
                <ComposerPrimaryActions
                  compact={false}
                  canOperateThread
                  pendingAction={null}
                  isRunning
                  canInterrupt
                  isSendBusy={false}
                  sendDisabledReason={null}
                  isEnvironmentUnavailable={false}
                  isPreparingWorktree={false}
                  hasSendableContent={false}
                  onPreviousPendingQuestion={noop}
                  onInterrupt={noop}
                />
              </div>
            }
          />
        </Specimen>

        <Specimen title="Start page notices (detached)">
          <Composer
            footer={<Footer modeOptions={modeOptions} state="empty" />}
            after={
              <div className="flex flex-col gap-1 pt-4">
                <ComposerBannerStack items={BANNERS.slice(1, 2)} detached />
              </div>
            }
          />
        </Specimen>
      </div>
    </div>
  );
}

export function mountComposerPanelsHarness() {
  paint();
  // App services repaint the saved theme once settings hydrate; the harness keeps its own.
  window.setTimeout(paint, 500);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <I18nProvider>
      <AppAtomRegistryProvider>
        <Harness />
      </AppAtomRegistryProvider>
    </I18nProvider>,
  );
}
