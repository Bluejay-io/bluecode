import type { ComponentType, ReactNode } from "react";

/** BlueCode: what the thread list shows when nothing is in it, in Capy's quiet style. */
export function SidebarEmptyState(props: {
  readonly icon: ComponentType<{ className?: string }>;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: { readonly label: ReactNode; readonly onClick: () => void };
}) {
  const Icon = props.icon;
  return (
    <div className="flex flex-col items-center px-4 pt-14 pb-6 text-center" data-sidebar-empty>
      <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-sidebar-row-hover text-sidebar-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="text-sm font-medium text-sidebar-foreground">{props.title}</p>
      {props.description ? (
        <p className="mt-1 max-w-48 text-xs text-balance text-sidebar-muted-foreground">
          {props.description}
        </p>
      ) : null}
      {props.action ? (
        <button
          type="button"
          onClick={props.action.onClick}
          className="mt-3 inline-flex cursor-pointer items-center rounded-md px-2 py-1 text-xs font-medium text-sidebar-muted-foreground transition-colors duration-100 outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:brightness-97"
        >
          {props.action.label}
        </button>
      ) : null}
    </div>
  );
}
