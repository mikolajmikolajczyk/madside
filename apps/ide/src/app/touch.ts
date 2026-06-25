// Touch / on-screen-keyboard capability detection (#144). Capability-based, NOT
// user-agent sniffing: a 2-in-1 with a detached keyboard falls back to desktop
// behaviour, and a real tablet gets the touch affordances. Drives a `data-touch`
// (and `data-osk-open`) attribute on the document root so CSS can adapt without
// per-component JS, plus reactive hooks for the editor's symbol bar + layout.

import { useEffect, useState } from "react";

/** True when the primary pointer is coarse (finger) AND the device reports touch
 *  points — i.e. typing happens on a soft keyboard. A mouse/trackpad device with
 *  a touchscreen stays false (its primary pointer is fine). */
export function isTouchPrimary(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
}

/** Reactive `isTouchPrimary()` — re-evaluates when the pointer media query flips
 *  (e.g. a 2-in-1 docking/undocking its keyboard). */
export function useTouchPrimary(): boolean {
  const [touch, setTouch] = useState(isTouchPrimary);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(pointer: coarse)");
    const on = () => setTouch(isTouchPrimary());
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return touch;
}

/** OSK-open state from the visualViewport API: when the soft keyboard opens it
 *  shrinks `visualViewport.height` well below the layout height. Returns whether
 *  the keyboard is (probably) open and how many CSS px it occludes at the bottom,
 *  so the editor can scroll the cursor into the visible band. */
export function useOskViewport(): { open: boolean; occludedHeight: number } {
  const [state, setState] = useState({ open: false, occludedHeight: 0 });
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      // The keyboard occludes the gap between the layout viewport and the (now
      // shorter) visual viewport. A small gap is browser chrome, not the OSK.
      const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setState({ open: occluded > 120, occludedHeight: occluded });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return state;
}
