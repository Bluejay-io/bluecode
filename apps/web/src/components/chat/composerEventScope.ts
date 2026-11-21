import { type FocusEvent, useRef } from "react";

import { useComposerHandleContext } from "../../composerHandleContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";

const COMPOSER_FLOATING_LAYER_SELECTOR = [
  '[data-composer-drawer-layer="true"]',
  '[data-chat-composer-floating-layer="true"]',
].join(",");

export const composerFloatingLayerProps = {
  "data-chat-composer-floating-layer": "true",
} as const;

// BlueCode: the key behind the latest input, or null after a pointer press: tells a keyboard open from a click.
let lastKey: string | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => (lastKey = event.key), true);
  window.addEventListener("pointerdown", () => (lastKey = null), true);
}

export function useComposerMenuProps() {
  const composerRef = useComposerHandleContext();
  const isCoarsePointer = useMediaQuery({ pointer: "coarse" });
  // The control a keyboard user opened the menu from; undefined until focus first enters it.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);

  return {
    ...composerFloatingLayerProps,
    onFocusCapture: (event: FocusEvent<HTMLElement>) => {
      if (openerRef.current !== undefined) return;
      const from = event.relatedTarget;
      openerRef.current =
        lastKey !== null && from instanceof HTMLElement && !from.isContentEditable ? from : null;
    },
    // Focusing the editor on a touch device opens the on-screen keyboard, so the menu keeps its own focus return.
    finalFocus:
      composerRef && !isCoarsePointer
        ? () => {
            const opener = openerRef.current;
            openerRef.current = undefined;
            // Escape cancels: a menu opened from the keyboard hands focus back to its trigger.
            // Some popups close themselves on Escape, so the key is read here, not the close type.
            if (lastKey === "Escape" && opener?.isConnected) {
              return opener;
            }
            const activeElement = document.activeElement;
            if (activeElement !== document.body && !isInsideComposerFloatingLayer(activeElement)) {
              return false;
            }
            composerRef.current?.focusAtEnd();
            return false;
          }
        : undefined,
  };
}

function isInsideComposerFloatingLayer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(COMPOSER_FLOATING_LAYER_SELECTOR) !== null;
}

export function isInsideCollapsedComposerControls(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-chat-composer-collapsed-controls="true"]') !== null
  );
}

export function isInsideRestingComposerControlScope(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    (target.closest('[data-chat-composer-resting-controls="true"]') !== null ||
      target.closest('[data-chat-composer-resting-images="true"]') !== null ||
      target.closest("[data-composer-context-control]") !== null ||
      isInsideComposerFloatingLayer(target))
  );
}

/**
 * composer.mode marks the trigger it opens; the menu's onOpenChangeComplete then moves focus
 * to the checked permission in that menu's own popup, after the menu placed its own focus.
 */
export function markOpenToPermissions(trigger: HTMLElement): void {
  trigger.dataset.openToPermissions = "true";
}

export function focusRequestedPermission(open: boolean, trigger: HTMLElement | null): void {
  if (!trigger?.dataset.openToPermissions) return;
  delete trigger.dataset.openToPermissions;
  if (open) focusCheckedPermission(trigger);
}

/** Focuses the checked permission in the menu this trigger opened. */
function focusCheckedPermission(trigger: HTMLElement | null): void {
  const popupId = trigger?.getAttribute("aria-controls");
  const popup = popupId ? document.getElementById(popupId) : null;
  popup
    ?.querySelector<HTMLElement>("[data-composer-permissions] [aria-checked='true']")
    ?.focus({ preventScroll: true });
}

/**
 * composer.effort marks the model picker trigger it opens; the picker then moves focus to the
 * selected effort level once its popup is open.
 */
export function markOpenToEffort(trigger: HTMLElement): void {
  trigger.dataset.openToEffort = "true";
}

/** Reads and clears an open-to mark: effort from composer.effort, permissions from composer.mode. */
export function takeOpenTarget(trigger: HTMLElement | null): "effort" | "permissions" | null {
  if (trigger?.dataset.openToEffort) {
    delete trigger.dataset.openToEffort;
    return "effort";
  }
  if (trigger?.dataset.openToPermissions) {
    delete trigger.dataset.openToPermissions;
    return "permissions";
  }
  return null;
}
