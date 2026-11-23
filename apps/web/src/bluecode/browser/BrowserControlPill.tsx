import {
  previewStreamControlLabel,
  type PreviewStreamControl,
} from "@t3tools/client-runtime/preview/server-browser-stream";
import { T, useGT, useMessages } from "gt-react";
import { EyeIcon, SquareMousePointerIcon, UsersIcon } from "lucide-react";

// Who drives a streamed browser page, floating over its bottom edge like a screen-share bar.
export function BrowserControlPill(props: {
  readonly control: PreviewStreamControl | null;
  readonly onChange: (take: boolean) => void;
}) {
  const gt = useGT();
  const resolve = useMessages();
  const { control, onChange } = props;
  if (control === null) return null;
  const yours = control.controller === "you";
  const canTake = control.canOperate && control.controller !== "another-viewer";
  const Icon = yours
    ? SquareMousePointerIcon
    : control.controller === "another-viewer"
      ? UsersIcon
      : EyeIcon;
  const status = yours
    ? gt("You're in control")
    : canTake
      ? gt("Watching", { $context: "preview stream status, viewing without control" })
      : previewStreamControlLabel(control, resolve);
  return (
    <div data-browser-control-pill>
      <span role="status">
        <Icon className="size-4 shrink-0" aria-hidden />
        {status}
      </span>
      {canTake ? (
        <button type="button" data-yours={yours || undefined} onClick={() => onChange(!yours)}>
          {yours ? (
            <T context="browser control bar, hand the page back">Stop</T>
          ) : (
            <T>Take control</T>
          )}
        </button>
      ) : null}
    </div>
  );
}
