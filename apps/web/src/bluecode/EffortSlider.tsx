import { selectableProviderOptionChoices } from "@t3tools/client-runtime/model-traits";
import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { useMessages } from "gt-react";
import { type CSSProperties, useRef, useState } from "react";

import type { TraitsSelection } from "../components/chat/ComposerModelEffort";
import { ULTRATHINK_IN_BODY_NOTE } from "../components/chat/TraitsPicker";
import { effortKeyStep } from "./modelCard.logic";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

/**
 * The levels as one slider, after Codex's: an accent pill with a dot at each level and a round
 * thumb (effort-slider.css). Click or drag to a level; the arrow and page keys step. The card's
 * block above it names the level.
 */
export function EffortSlider(props: {
  descriptor: SelectDescriptor;
  traits: TraitsSelection;
  locked: boolean;
  /** Takes the card's focus when the slider can move. */
  focusRef?: ((node: HTMLElement | null) => void) | undefined;
}) {
  const messages = useMessages();
  const { descriptor, traits, locked } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  // While dragging, the fill follows the pointer at once instead of waiting on the saved level.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const value = traits.selectValue(descriptor);
  const choices = selectableProviderOptionChoices(descriptor);
  const last = choices.length - 1;
  // An "Ultrathink:" prefix selects a level the slider does not offer, so nothing fills.
  const selectedIndex = dragIndex ?? choices.findIndex((option) => option.id === value);
  const current = choices[selectedIndex];
  // Levels sit between the thumb's half-widths, so the thumb never leaves the track.
  const at = (index: number) => (last <= 0 ? 1 : index / last);
  const dots = choices.map((option, index) => (
    <span key={option.id} data-effort-dot style={{ "--effort-dot": at(index) } as CSSProperties} />
  ));
  const pick = (index: number) => {
    const option = choices[Math.min(Math.max(index, 0), last)];
    if (!option || locked || option.id === value) return;
    traits.changeSelect(descriptor, option.id);
  };
  const levelAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || last <= 0) return 0;
    // The thumb is as wide as the track is tall.
    const thumb = rect.height;
    const fraction = (clientX - rect.left - thumb / 2) / (rect.width - thumb);
    return Math.round(Math.min(Math.max(fraction, 0), 1) * last);
  };
  const drag = (clientX: number) => {
    const index = levelAt(clientX);
    setDragIndex(index);
    pick(index);
  };
  return (
    <>
      {locked ? (
        <div className="px-2 pt-1.5 text-center text-muted-foreground/80 text-xs">
          {messages(ULTRATHINK_IN_BODY_NOTE)}
        </div>
      ) : null}
      <div className="px-0.5 pt-2 pb-1">
        <div
          ref={(node) => {
            trackRef.current = node;
            props.focusRef?.(node);
            return () => {
              trackRef.current = null;
              props.focusRef?.(null);
            };
          }}
          data-effort-slider
          data-dragging={dragIndex !== null || undefined}
          style={{ "--effort-at": at(Math.max(selectedIndex, 0)) } as CSSProperties}
          role="slider"
          aria-label={descriptor.label}
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={Math.max(selectedIndex, 0)}
          aria-valuetext={current?.label}
          aria-disabled={locked || undefined}
          // Locked, it leaves the tab order; the note above says why.
          tabIndex={locked ? -1 : 0}
          // Its height is the thumb's size, --effort-thumb in effort-slider.css.
          className="@container relative cursor-pointer touch-none rounded-full bg-foreground/8 outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-64"
          onPointerDown={(event) => {
            if (locked || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag(event.clientX);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) drag(event.clientX);
          }}
          onPointerUp={() => setDragIndex(null)}
          onPointerCancel={() => setDragIndex(null)}
          onKeyDown={(event) => {
            const next = effortKeyStep(event.key, Math.max(selectedIndex, 0), last);
            if (next === null) return;
            event.preventDefault();
            event.stopPropagation();
            pick(next);
          }}
        >
          {dots}
          {selectedIndex >= 0 ? (
            <>
              {/* The fill carries its own tinted dots, so they appear exactly where it reaches. */}
              <span aria-hidden="true" data-effort-fill>
                {dots}
              </span>
              <span aria-hidden="true" data-effort-thumb />
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
