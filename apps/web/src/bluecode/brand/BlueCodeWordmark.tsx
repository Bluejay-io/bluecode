import { cn } from "~/lib/utils";

/**
 * BlueCode's text wordmark. "Blue" carries the weight and "Code" steps back, so it reads in any
 * theme without a brand color of its own.
 */
export function BlueCodeWordmark({
  className,
  codeClassName,
}: {
  className?: string;
  /** Tone for "Code"; defaults to muted text. */
  codeClassName?: string;
}) {
  return (
    <span
      role="img"
      aria-label="BlueCode"
      className={cn("inline-flex items-baseline tracking-tight", className)}
    >
      {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
      <span className="font-semibold">{"Blue"}</span>
      {/* oxlint-disable-next-line t3code/no-untranslated-copy -- product wordmark */}
      <span className={cn("font-normal text-muted-foreground", codeClassName)}>{"Code"}</span>
    </span>
  );
}
