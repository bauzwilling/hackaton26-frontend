import { useEffect, useState, type ReactNode } from "react";

function isPortrait() {
  return window.innerHeight > window.innerWidth;
}

/**
 * Blocks the whole app whenever the viewport is taller than wide.
 * Children stay mounted so mid-session rotate does not wipe Studio state.
 */
export function LandscapeGate({ children }: { children: ReactNode }) {
  const [portrait, setPortrait] = useState(isPortrait);

  useEffect(() => {
    const sync = () => setPortrait(isPortrait());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const mq = window.matchMedia("(orientation: portrait)");
    mq.addEventListener("change", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      mq.removeEventListener("change", sync);
    };
  }, []);

  return (
    <>
      {children}
      {portrait ? (
        <div className="landscape-gate" role="alertdialog" aria-modal="true" aria-labelledby="landscape-gate-title" aria-describedby="landscape-gate-body">
          <div className="landscape-gate-card">
            <svg className="landscape-gate-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
              <rect x="14" y="6" width="20" height="32" rx="3" stroke="currentColor" strokeWidth="2" />
              <path d="M30 18l6 6-6 6M36 24H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h1 id="landscape-gate-title" className="landscape-gate-title">Please rotate your device</h1>
            <p id="landscape-gate-body" className="landscape-gate-body">
              Turn back to landscape to continue. This app is only available in landscape mode.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
