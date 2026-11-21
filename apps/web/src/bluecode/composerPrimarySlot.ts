import { createContext, type ReactNode } from "react";

/**
 * BlueCode: with nothing to send, ComposerPrimaryActions hands its primary slot to the mic it was
 * given as children. The value is the idle send, which the mic renders whenever it hides itself,
 * so the slot is never empty. Null outside that state.
 */
export const ComposerPrimarySlot = createContext<ReactNode>(null);
