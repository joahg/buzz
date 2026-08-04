import * as React from "react";

/** Distance from the bottom (px) within which the view stays pinned. */
const PIN_THRESHOLD = 48;

/**
 * Keep a scroll container pinned to the bottom while its content grows
 * (live agent output, replies loading in), unless the user scrolled up.
 * A resetKey change (channel or thread switch) re-pins the view.
 *
 * While `holdPinned` is true (the initial load is still streaming content
 * in), scroll events cannot unpin the view: content reflow fires scroll
 * events through the browser's scroll anchoring that are indistinguishable
 * from user scrolls, and acting on them left the view stranded mid-history.
 * A genuine user gesture (wheel/touch) cancels the hold so the user can
 * still scroll up during a slow load.
 */
export function usePinnedScroll(resetKey: string, holdPinned = false) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);
  const holdRef = React.useRef(holdPinned);
  const holdCancelledRef = React.useRef(false);
  holdRef.current = holdPinned;

  const handleScroll = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (holdRef.current && !holdCancelledRef.current) return;
    pinnedRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < PIN_THRESHOLD;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — a resetKey change re-pins the view to the bottom
  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    holdCancelledRef.current = false;
    node.scrollTop = node.scrollHeight;
    pinnedRef.current = true;
  }, [resetKey]);

  // Releasing the hold (all thread contents loaded) lands one final pin so
  // the settled layout is what the bottom position is computed from.
  React.useLayoutEffect(() => {
    if (holdPinned) return;
    const node = scrollRef.current;
    if (!node) return;
    if (pinnedRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [holdPinned]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    // An upward gesture must unpin directly: when the content is still too
    // short to scroll, no scroll event ever fires, and an intact pin would
    // yank the view back down as soon as more content loads in.
    const handleWheel = (event: WheelEvent) => {
      holdCancelledRef.current = true;
      if (event.deltaY < 0) pinnedRef.current = false;
    };
    let touchStartY: number | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      touchStartY = event.touches[0]?.clientY ?? null;
    };
    const handleTouchMove = (event: TouchEvent) => {
      holdCancelledRef.current = true;
      const y = event.touches[0]?.clientY;
      // Finger moving down drags the content down — scrolling up.
      if (touchStartY !== null && y !== undefined && y > touchStartY) {
        pinnedRef.current = false;
      }
    };
    node.addEventListener("wheel", handleWheel, { passive: true });
    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: true });
    return () => {
      node.removeEventListener("wheel", handleWheel);
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  React.useEffect(() => {
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller) return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    observer.observe(content);
    // The scroller itself resizes when the composer grows (newlines, drag)
    // or the split moves — a pinned view must stay glued to the bottom.
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  return { scrollRef, contentRef, handleScroll };
}
