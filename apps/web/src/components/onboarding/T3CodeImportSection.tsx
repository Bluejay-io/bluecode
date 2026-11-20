import type { DesktopT3CodeImportPhase } from "@t3tools/contracts";
import { DownloadIcon } from "lucide-react";
import { msg, T, useGT, useMessages } from "gt-react";
import { useState, type RefObject } from "react";

import {
  isT3CodeImportBusy,
  nextT3CodeImportState,
  resolveT3CodeImportOffer,
  T3_CODE_IMPORT_IDLE,
  type T3CodeImportEvent,
} from "../../onboarding/t3CodeImport.logic";
import {
  desktopT3CodeImportProbeAtom,
  getDesktopT3CodeImportBridge,
} from "../../state/desktopT3CodeImport";
import { useEnvironmentQuery } from "../../state/query";
import { Button } from "../ui/button";
import { RowIcon, WelcomeSection } from "./welcomeLayout";

const PHASE_MESSAGES = {
  preflight: msg("Checking your T3 Code data…"),
  snapshot: msg("Copying the T3 Code database…"),
  migrate: msg("Updating the copy for BlueCode…"),
  scrub: msg("Stopping work that was running in the copy…"),
  stage: msg("Copying settings, secrets and attachments…"),
  publish: msg("Moving the import into place…"),
} satisfies Record<DesktopT3CodeImportPhase, unknown>;

/** The desktop app's T3 Code import: what it found, and the run that replaces this page's data. */
export function useT3CodeImport({
  enabled,
  holdPageRef,
}: {
  readonly enabled: boolean;
  readonly holdPageRef: RefObject<boolean>;
}) {
  const bridge = enabled ? getDesktopT3CodeImportBridge() : undefined;
  const probe = useEnvironmentQuery(bridge ? desktopT3CodeImportProbeAtom : null);
  const [state, setState] = useState(T3_CODE_IMPORT_IDLE);
  const dispatch = (event: T3CodeImportEvent) =>
    setState((current) => nextT3CodeImportState(current, event));
  const busy = isT3CodeImportBusy(state);

  const start = () => {
    if (bridge === undefined || busy) return;
    // The backend stops for the import, so nothing else on this page can work until it ends.
    holdPageRef.current = true;
    dispatch({ type: "start" });
    const unsubscribe = bridge.onProgress((progress) => dispatch({ type: "progress", progress }));
    const release = () => {
      unsubscribe();
      holdPageRef.current = false;
    };
    void bridge.run().then(
      (result) => {
        if (result._tag === "Failed") release();
        dispatch({ type: "settled", result });
      },
      () => {
        release();
        dispatch({ type: "rejected" });
      },
    );
  };

  return { offer: resolveT3CodeImportOffer(probe.data), state, busy, start };
}

export function T3CodeImportSection({
  t3CodeImport,
}: {
  readonly t3CodeImport: ReturnType<typeof useT3CodeImport>;
}) {
  const gt = useGT();
  const m = useMessages();
  const { offer, state, busy, start } = t3CodeImport;
  if (offer.kind === "hidden") return null;
  // Retrying cannot get past data BlueCode already has; only the CLI's --replace can.
  const destinationUsed =
    state.status === "failed" && state.error === "T3HomeImportDestinationNotEmptyError";

  const detail =
    offer.kind === "newer"
      ? gt("This T3 Code is newer than BlueCode. Update BlueCode to import from it.")
      : offer.kind === "blocked"
        ? (offer.reason ?? gt("This T3 Code data cannot be imported."))
        : state.status === "running"
          ? state.phase === null
            ? gt("Stopping BlueCode's server…")
            : m(PHASE_MESSAGES[state.phase])
          : state.status === "restarting"
            ? gt("Restarting BlueCode…")
            : gt(
                "{projects, plural, one {{projects} project} other {{projects} projects}}, {threads, plural, one {{threads} thread} other {{threads} threads}}",
                { projects: offer.projects, threads: offer.threads },
              );

  return (
    // Product names stay untranslated.
    <WelcomeSection title="T3 Code">
      <div className="flex min-h-10 items-center gap-3 py-1">
        <RowIcon>
          <DownloadIcon className="size-4" />
        </RowIcon>
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            <T>Import from T3 Code</T>
          </span>
          <p
            className="text-xs leading-relaxed break-words text-muted-foreground"
            role={busy ? "status" : undefined}
          >
            {detail}
          </p>
        </div>
        {offer.kind === "importable" && !destinationUsed ? (
          <div className="shrink-0">
            <Button size="xs" variant="outline" disabled={busy} onClick={start}>
              {busy ? gt("Importing…") : state.status === "failed" ? gt("Retry") : gt("Import")}
            </Button>
          </div>
        ) : null}
      </div>
      {offer.kind === "importable" && state.status !== "restarting" ? (
        <div className="space-y-1 pb-1 pl-8 text-xs leading-relaxed text-muted-foreground">
          <p>
            <T>
              BlueCode restarts with your projects, threads, settings and attachments. Paired
              devices, saved remote connections and the T3 Connect sign-in stay in T3 Code.
              Scheduled tasks arrive paused, and queued messages are held.
            </T>
          </p>
          {offer.serverRunning ? (
            <p>
              <T>T3 Code can stay open. Work running there arrives stopped.</T>
            </p>
          ) : null}
        </div>
      ) : null}
      {state.status === "failed" ? (
        <p role="alert" className="pt-1 pl-8 text-sm break-words text-destructive">
          {destinationUsed
            ? gt(
                "BlueCode already has projects or threads, so nothing was imported. To import over them, quit BlueCode and run `t3 import-t3-code --replace`.",
              )
            : (state.message ?? gt("The import did not finish."))}
        </p>
      ) : null}
    </WelcomeSection>
  );
}
