import { MousePointer2 } from "lucide-react";
import { resolveProviderInstanceDisplayName } from "@t3tools/client-runtime/state/provider-instance-display";

import { ProviderInstanceIcon } from "~/components/chat/ProviderInstanceIcon";
import { observeVisibleAnimation } from "~/lib/visibleAnimation";
import { useEnvironmentProviders } from "~/state/environments";

import type { AgentDriving } from "./agentBrowserActivity";

/**
 * The driving agent's provider logo inside a thin accent ring that turns while it works. Only the
 * ring's transform animates, and only while the badge is on screen in a visible window.
 */
export function AgentDrivingBadge(props: { readonly driving: AgentDriving }) {
  const provider = useEnvironmentProviders()
    .get(props.driving.environmentId)
    ?.find((candidate) => candidate.instanceId === props.driving.providerInstanceId);
  return (
    <span
      className="relative inline-flex size-4.5 shrink-0 items-center justify-center"
      data-agent-driving-badge
      aria-hidden
    >
      {provider ? (
        <ProviderInstanceIcon
          driverKind={provider.driver}
          displayName={resolveProviderInstanceDisplayName(provider)}
          accentColor={provider.accentColor}
          acpRegistryIconUrl={provider.iconUrl}
          className="!size-3 z-auto"
          iconClassName="!size-3"
        />
      ) : (
        <MousePointer2 className="!size-3 text-primary" />
      )}
      <svg
        viewBox="0 0 18 18"
        data-agent-ring
        ref={observeVisibleAnimation}
        className="pointer-events-none absolute inset-0 !size-4.5 text-primary motion-safe:visible-animate-spin"
      >
        <circle cx="9" cy="9" r="8.25" fill="none" stroke="currentColor" strokeOpacity="0.18" />
        <circle
          data-agent-ring-arc
          cx="9"
          cy="9"
          r="8.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="30 70"
        />
      </svg>
    </span>
  );
}

/** A static accent frame inside the page an agent drives; always mounted so it fades both ways. */
export function AgentDrivingFrame(props: { readonly active: boolean }) {
  return <div data-agent-frame data-active={props.active || undefined} aria-hidden />;
}
