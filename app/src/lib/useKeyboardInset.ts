import { useEffect, type RefObject } from "react";

/**
 * On narrow/coarse viewports, lift a chat container above the soft keyboard
 * via --keyboard-inset (visualViewport).
 */
export function useKeyboardInset(
  enabled: boolean,
  targetRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!enabled) {
      targetRef.current?.style.removeProperty("--keyboard-inset");
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const el = targetRef.current;
      if (!el) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      targetRef.current?.style.removeProperty("--keyboard-inset");
    };
  }, [enabled, targetRef]);
}
