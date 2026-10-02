import { useEffect, useState } from "react";

/** Subscribe to a CSS media query; updates on change. */
export function useMatchMedia(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

/** Phone / small-tablet landscape — chat overlays instead of docking. */
export const NARROW_LANDSCAPE_MQ = "(max-width: 899px)";

export function useNarrowLandscape() {
  return useMatchMedia(NARROW_LANDSCAPE_MQ);
}
