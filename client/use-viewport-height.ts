import { useEffect, useRef } from "react";

type ViewportWindow = Pick<
  Window,
  "innerHeight" | "visualViewport" | "addEventListener" | "removeEventListener"
>;

/** Fit the keyboard's visual viewport without making pinch zoom reflow the app. */
export function observeViewportHeight(
  element: HTMLElement,
  source: ViewportWindow = window,
) {
  const viewport = source.visualViewport;
  let active = true;
  let previous = "";
  const update = () => {
    if (!active || (viewport && Math.abs(viewport.scale - 1) > 0.01)) return;
    const height = viewport?.height ?? source.innerHeight;
    const top = Math.max(0, viewport?.offsetTop ?? 0);
    if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(top)) return;
    const next = `${height}:${top}`;
    if (next === previous) return;
    previous = next;
    element.style.setProperty("--welcome-viewport-height", `${height}px`);
    element.style.setProperty("--welcome-viewport-top", `${top}px`);
    // Below this height, reserved chrome leaves too little room for a form scroller.
    element.toggleAttribute("data-compact-viewport", height <= 420);
  };
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  source.addEventListener("resize", update);
  update();
  return () => {
    if (!active) return;
    active = false;
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    source.removeEventListener("resize", update);
    element.style.removeProperty("--welcome-viewport-height");
    element.style.removeProperty("--welcome-viewport-top");
    element.removeAttribute("data-compact-viewport");
  };
}

export function useViewportHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (ref.current) return observeViewportHeight(ref.current);
  }, []);
  return ref;
}
