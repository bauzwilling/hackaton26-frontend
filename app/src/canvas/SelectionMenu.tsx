import { useEffect } from "react";
import { Surface } from "../components/kit";

export function SelectionMenu({
  at,
  host,
  canDelete,
  canMaximize,
  locked,
  onDelete,
  onHide,
  onMaximize,
  onToggleLock,
  onClose,
}: {
  at: { x: number; y: number };
  host: { width: number; height: number };
  canDelete: boolean;
  canMaximize: boolean;
  locked: boolean;
  onDelete: () => void;
  onHide: () => void;
  onMaximize: () => void;
  onToggleLock: () => void;
  onClose: () => void;
}) {
  const W = 220;
  const left = Math.max(12, Math.min(at.x, host.width - W - 12));
  const top = Math.max(12, Math.min(at.y, host.height - 220));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="sel-backdrop"
        onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <Surface
        className="sel-menu"
        style={{ left, top, width: W }}
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <p className="ctx-title">Window</p>
        <button type="button" onClick={() => { onToggleLock(); onClose(); }}>
          {locked ? "Unlock" : "Lock in place"}
        </button>
        {canMaximize && (
          <button type="button" onClick={() => { onMaximize(); onClose(); }}>
            Maximize
          </button>
        )}
        <button type="button" onClick={() => { onHide(); onClose(); }}>
          Hide
        </button>
        {canDelete && (
          <button type="button" className="sel-menu-danger" onClick={() => { onDelete(); onClose(); }}>
            Close
          </button>
        )}
      </Surface>
    </>
  );
}
