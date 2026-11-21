import type { RuntimeModeOption } from "../components/chat/ComposerFooterControls";

/**
 * BlueCode: the permission modes read as Capy's menu rows wherever they are chosen: a muted icon,
 * the mode's name and a trailing check, with no colour per mode.
 */
export function PermissionModeName(props: { option: RuntimeModeOption }) {
  const Icon = props.option.icon;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-(--contrast-icon-muted)" />
      <span className="min-w-0 truncate">{props.option.label}</span>
    </span>
  );
}

export const PERMISSION_MODES_LABEL =
  "flex min-h-5.5 items-center px-2 font-medium text-muted-foreground text-xs";

/**
 * What the shown mode allows, under the rows, so the choice reads without hovering. A managed
 * policy's reason follows when it rules modes out. Screen readers get each row's own description.
 */
export function PermissionModeCaption(props: {
  options: ReadonlyArray<RuntimeModeOption>;
  shown: RuntimeModeOption;
  descriptionId: string;
}) {
  const lockedReason = props.options.find((option) => option.disabledReason)?.disabledReason;
  return (
    <>
      {props.options.map((option) => (
        <span key={option.mode} id={`${props.descriptionId}-${option.mode}`} className="sr-only">
          {option.disabledReason ?? option.description}
        </span>
      ))}
      <div aria-hidden="true" className="grid gap-1 px-2 pt-1 pb-1 text-muted-foreground text-xs">
        {/* Two lines reserved, so moving between modes never resizes the card. */}
        <p className="min-h-8 leading-4">{props.shown.description}</p>
        {lockedReason ? <p className="leading-4">{lockedReason}</p> : null}
      </div>
    </>
  );
}
