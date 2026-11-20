import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useAtomValue } from "@effect/atom-react";
import { T, useGT } from "gt-react";
import { EllipsisIcon } from "lucide-react";
import { useState } from "react";

import { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { threadEnvironment } from "../../state/threads";
import { readEnvironmentScope } from "../../state/session";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { canShareWithGuestAtom } from "./guestShareAvailability";

/**
 * BlueCode: the top-right "…" thread menu. With the chat as a tab there is no header title to
 * edit in place, so Rename asks in a dialog; the chat tab's double-click opens the same one.
 */
export function ThreadActionsButton(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly title: string;
  readonly projectCwd: string | null;
  readonly onFind?: ((threadRef: ScopedThreadRef) => void) | undefined;
  readonly renameOpen: boolean;
  readonly onRenameOpenChange: (open: boolean) => void;
}) {
  const gt = useGT();
  const { threadRef, onRenameOpenChange } = props;
  const canShareWithGuest = useAtomValue(canShareWithGuestAtom(props.environmentId));
  const { openMenu } = useThreadActionMenu({
    threadRef,
    projectCwd: props.projectCwd,
    onStartRename: () => onRenameOpenChange(true),
    onFind: props.onFind,
    canShareWithGuest,
  });
  if (threadRef === null) return null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={false}
              aria-label={gt("Thread actions for {title}", { title: props.title })}
              aria-haspopup="menu"
              variant="ghost"
              size="sm"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
            />
          }
        >
          <EllipsisIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          <T>Thread actions</T>
        </TooltipPopup>
      </Tooltip>
      <ThreadRenameDialog
        threadRef={threadRef}
        title={props.title}
        open={props.renameOpen}
        onOpenChange={onRenameOpenChange}
      />
    </>
  );
}

function ThreadRenameDialog(props: {
  readonly threadRef: ScopedThreadRef;
  readonly title: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const gt = useGT();
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const [draft, setDraft] = useState<{ open: boolean; title: string }>({
    open: false,
    title: props.title,
  });
  if (draft.open !== props.open) setDraft({ open: props.open, title: props.title });
  const submit = () => {
    const title = draft.title.trim();
    if (title.length === 0) {
      toastManager.add({ type: "warning", title: gt("Thread title cannot be empty") });
      return;
    }
    props.onOpenChange(false);
    if (title === props.title) return;
    const { environmentId, threadId } = props.threadRef;
    if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    void updateThreadMetadata({ environmentId, input: { threadId, title } }).then((result) => {
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: gt("Failed to rename thread"),
          description: error instanceof Error ? error.message : gt("An error occurred."),
        });
      }
    });
  };
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <T>Rename thread</T>
          </DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <Input
            autoFocus
            aria-label={gt("Thread title")}
            value={draft.title}
            onChange={(event) => setDraft({ open: true, title: event.currentTarget.value })}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
          />
        </DialogPanel>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => props.onOpenChange(false)}
          >
            <T>Cancel</T>
          </Button>
          <Button size="sm" onClick={submit}>
            <T>Rename</T>
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
