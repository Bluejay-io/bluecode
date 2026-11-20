import {
  previewStreamControlLabel,
  type PreviewStreamControl,
} from "@t3tools/client-runtime/preview/server-browser-stream";
import { T, useMessages } from "gt-react";
import { BotIcon, EyeIcon, MousePointer2Icon, UsersIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

// Who drives a streamed browser page, as one control in the address row instead of a status bar.
export function BrowserControlButton({
  control,
  onChange,
}: {
  readonly control: PreviewStreamControl | null;
  readonly onChange: (take: boolean) => void;
}) {
  const resolve = useMessages();
  if (control === null) return null;
  const status = previewStreamControlLabel(control, resolve);

  if (!control.canOperate || control.controller === "another-viewer") {
    const Icon = control.canOperate ? UsersIcon : EyeIcon;
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              role="status"
              aria-label={status}
              className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground"
            />
          }
        >
          <Icon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup>{status}</TooltipPopup>
      </Tooltip>
    );
  }

  if (control.controller === "you") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="secondary"
              size="icon-sm"
              type="button"
              aria-pressed="true"
              onClick={() => onChange(false)}
            />
          }
        >
          <MousePointer2Icon />
          <span className="sr-only">
            <T>Release control</T>
          </span>
        </TooltipTrigger>
        <TooltipPopup>{status}</TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="outline" size="sm" type="button" onClick={() => onChange(true)} />}
      >
        {control.controller === "agent" ? <BotIcon /> : <MousePointer2Icon />}
        <T>Take control</T>
      </TooltipTrigger>
      <TooltipPopup>{status}</TooltipPopup>
    </Tooltip>
  );
}
