import { useRef, useState, type PointerEvent } from "react";

const CLOSE_DELAY_MS = 250;

// A collapsed sidebar slides over the page while the mouse rests at the window's left edge.
// React's enter/leave follow the React tree, so moving into a menu the sidebar opened in a
// portal does not count as leaving.
export function useSidebarPeek(enabled: boolean) {
  const [peeking, setPeeking] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  if (!enabled && peeking) setPeeking(false);

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  return {
    peeking: enabled && peeking,
    edgeProps: {
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        cancelClose();
        setPeeking(true);
      },
    },
    panelProps: {
      onPointerEnter: cancelClose,
      onPointerLeave: () => {
        cancelClose();
        closeTimer.current = window.setTimeout(() => setPeeking(false), CLOSE_DELAY_MS);
      },
    },
  };
}
