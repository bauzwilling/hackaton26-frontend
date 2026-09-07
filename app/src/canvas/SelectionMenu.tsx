import { useEffect } from "react";
import { Surface } from "../components/kit";

export function SelectionMenu({
  at,
  host,
  canDelete,
  canDuplicate,
  locked,
  onDelete,
  onDuplicate,
  onToggleLock,
  onClose,
}: {
  at: { x: number; y: number };
  host: { width: number; height: number };
  canDelete: boolean;
  canDuplicate: boolean;
  locked: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onClose: () => void;
}) {
  const W = 220;
  const left = Math.max(12, Math.min(at.x, host.width - W - 12));
  const top = Math.max(12, Math.min(at.y, host.height - 160));

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
        <p className="ctx-title">Selected</p>
        <button type="button" onClick={() => { onToggleLock(); onClose(); }}>
          {locked ? "Unlock" : "Lock in place"}
        </button>
        {canDuplicate && (
          <button type="button" onClick={() => { onDuplicate(); onClose(); }}>
            Duplicate
          </button>
        )}
        {canDelete && (
          <button type="button" className="sel-menu-danger" onClick={() => { onDelete(); onClose(); }}>
            Delete
          </button>
        )}
      </Surface>
    </>
  );
}
