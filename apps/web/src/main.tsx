import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./index.css";
import "./bluecode/theme.css";
// BlueCode: Sedula's default palette, painted over index.css's stock tokens.
import "./bluecode/default-palette.css";
import "./bluecode/menus.css";
import "./bluecode/buttons.css";
import "./bluecode/composer.css";
import "./bluecode/layout.css";
import "./bluecode/agent-activity.css";
import "./bluecode/thread-details.css";
import "./bluecode/timeline-accents.css";
import "./bluecode/model-card.css";
import "./bluecode/terminal.css";

import { trackKeyboardLayout } from "./keyboardLayout";
import { hasCloudPublicConfig } from "./cloud/publicConfig";
import { isElectron } from "./env";
import { startAppServices } from "./appInit";
import { AppRoot } from "./AppRoot";
import { whenLocaleReady } from "./i18n/runtime";
import { chunkLoadState } from "./lib/chunkReloadGuard";

const stopTrackingKeyboardLayout = trackKeyboardLayout();
import.meta.hot?.dispose(stopTrackingKeyboardLayout);

const router = startAppServices();

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const app = <AppRoot router={router} />;

// Split by runtime to keep Clerk out of local startup and clerk-js out of browser builds.
const managedAuthShellModule =
  clerkPublishableKey && hasCloudPublicConfig()
    ? isElectron
      ? import("./components/clerk/ElectronManagedAuthShell")
      : import("./components/clerk/BrowserManagedAuthShell")
    : null;

// BlueCode: a dev-only page with every panel around the composer open; see bluecode/dev.
const composerPanelsHarness =
  import.meta.env.DEV && window.location.pathname === "/__bluecode/composer-panels";
if (composerPanelsHarness) {
  void import("./bluecode/dev/ComposerPanelsHarness").then((module) =>
    module.mountComposerPanelsHarness(),
  );
}

// BlueCode: a dev-only gallery of agent state indicators; see bluecode/dev.
const agentStatesGallery =
  import.meta.env.DEV && window.location.pathname === "/__bluecode/agent-states";
if (agentStatesGallery) {
  void import("./bluecode/dev/AgentStatesGallery").then((module) =>
    module.mountAgentStatesGallery(),
  );
}
const devHarness = composerPanelsHarness || agentStatesGallery;

export const startup = Promise.all([
  managedAuthShellModule?.then((module) => module.default) ?? null,
  // Chained so settings have usually hydrated; English resolves without a chunk load.
  devHarness ? null : router.load().then(whenLocaleReady),
])
  .then(([ManagedAuthShell]) => {
    // Route chunk failures resolve router.load() and surface later through the error boundary.
    if (chunkLoadState.reloadScheduled || devHarness) return;
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        {ManagedAuthShell && clerkPublishableKey ? (
          <ManagedAuthShell publishableKey={clerkPublishableKey}>{app}</ManagedAuthShell>
        ) : (
          app
        )}
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    if (chunkLoadState.reloadScheduled) return;
    throw error;
  });
