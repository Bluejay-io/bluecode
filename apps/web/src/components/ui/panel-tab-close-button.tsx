import { X } from "lucide-react";
import type { ReactNode } from "react";
import { SharedTooltipTrigger } from "~/components/ui/shared-tooltip";
import { cn } from "~/lib/utils";

interface PanelTabCloseButtonProps {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tooltip?: string;
  size?: "default" | "lg";
}

export function PanelTabCloseButton({
  children,
  label,
  onClick,
  tooltip,
  size = "default",
}: PanelTabCloseButtonProps) {
  const large = size === "lg";
  const button = (
    <button
      type="button"
      className={cn(
        "cursor-pointer group/close relative flex shrink-0 items-center justify-center rounded-sm hover:bg-muted",
        large ? "size-4.5" : "size-4",
      )}
      aria-label={label}
      onClick={onClick}
    >
      <span
        className={cn(
          "relative flex items-center justify-center group-hover/tab:hidden group-focus-visible/close:hidden",
          large ? "size-3.5 [&_img]:size-3.5 [&_svg]:size-3.5" : "size-3",
        )}
      >
        {children}
      </span>
      <X
        className={cn(
          "hidden group-hover/tab:block group-focus-visible/close:block",
          large ? "size-3.5" : "size-3",
        )}
      />
    </button>
  );

  if (!tooltip) return button;

  return <SharedTooltipTrigger render={button} label={tooltip} />;
}
