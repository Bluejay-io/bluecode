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

import { hasCloudPublicConfig } from "./cloud/publicConfig";
import { isElectron } from "./env";
import { startAppServices } from "./appInit";
import { AppRoot } from "./AppRoot";
import { whenLocaleReady } from "./i18n/runtime";
import { reloadOnceForChunkLoadError } from "./lib/chunkReloadGuard";

const router = startAppServices();

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

let reloadScheduled = false;
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForChunkLoadError()) {
    reloadScheduled = true;
    event.preventDefault();
  }
});

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

export const startup = Promise.all([
  managedAuthShellModule?.then((module) => module.default) ?? null,
  // Chained so settings have usually hydrated; English resolves without a chunk load.
  composerPanelsHarness ? null : router.load().then(whenLocaleReady),
])
  .then(([ManagedAuthShell]) => {
    // Route chunk failures resolve router.load() and surface later through the error boundary.
    if (reloadScheduled || composerPanelsHarness) return;
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
    if (reloadScheduled) return;
    throw error;
  });
