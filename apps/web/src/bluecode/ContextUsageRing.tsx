import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { useGT, useLocale, useMessages } from "gt-react";

import { formatContextWindowCompactionMessage } from "../components/chat/compaction.logic";
import { Button } from "../components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../components/ui/popover";
import { formatContextWindowTokens } from "../lib/contextWindow";
import { cn } from "../lib/utils";

const RADIUS = 5.25;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * BlueCode: the thread's context window as a small ring in the composer footer, as in Codex. It
 * fills as context is used and warms at 80% and 90%. Hover, focus, or a tap opens the token counts.
 */
export function ContextUsageRing({ usage }: { readonly usage: ContextWindowSnapshot }) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const maxTokens = usage.maxTokens != null && usage.maxTokens > 0 ? usage.maxTokens : null;
  const used =
    maxTokens !== null && usage.usedPercentage !== null
      ? Math.round(Math.max(0, Math.min(100, usage.usedPercentage)))
      : null;
  const threshold = usage.autoCompactThreshold ?? null;
  const usedTokens = formatContextWindowTokens(usage.usedTokens);
  const label =
    used !== null
      ? gt("Context: {used}% used", { used })
      : gt("Context: {usedTokens} tokens used", { usedTokens });
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={0}
        closeDelay={120}
        render={
          <Button aria-label={label} data-composer-context-ring size="icon-sm" variant="quiet" />
        }
      >
        <svg
          viewBox="0 0 14 14"
          className={cn(
            "size-3.5 -rotate-90",
            used !== null && used >= 90
              ? "text-destructive"
              : used !== null && used >= 80
                ? "text-warning"
                : "text-muted-foreground",
          )}
          aria-hidden="true"
        >
          <circle
            cx="7"
            cy="7"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeWidth="1.5"
          />
          {used !== null && used > 0 ? (
            <circle
              cx="7"
              cy="7"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={`${(CIRCUMFERENCE * used) / 100} ${CIRCUMFERENCE}`}
            />
          ) : null}
        </svg>
      </PopoverTrigger>
      <PopoverPopup side="top" tooltipStyle className="max-w-64">
        <span className="block text-foreground">{label}</span>
        {maxTokens !== null ? (
          <span className="block text-muted-foreground">
            {gt("{used} of {max} tokens", {
              used: usage.usedTokens.toLocaleString(locale),
              max: maxTokens.toLocaleString(locale),
            })}
          </span>
        ) : null}
        {threshold !== null && threshold > 0 ? (
          <span className="block text-muted-foreground">
            {formatContextWindowCompactionMessage(threshold, m)}
          </span>
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}
