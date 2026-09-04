import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useConfiguratorState } from "../hooks/useConfiguratorState";
import { useThreeEngine } from "../hooks/useThreeEngine";
import { t } from "../lib/i18n";
import { Toolbar } from "./Toolbar";
import { SelectionPanel } from "./SelectionPanel";
import { MaterialPicker } from "./MaterialPicker";
import { HistoryLog } from "./HistoryLog";
import "../plyworks.css";

/**
 * Top-level Plyworks configurator.
 *
 * Drop this into any React app:
 *
 *   import { Configurator } from "../plyworks/components/Configurator";
 *   <Configurator />
 *
 * It owns its own state and Three.js lifecycle — no props needed.
 * For integration into a larger app, you can lift `useConfiguratorState`
 * to a parent and pass the store as a prop instead.
 */
export function Configurator() {
  const store = useConfiguratorState();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const onContextMenu = useCallback((info: { x: number; y: number; id: number | null }) => {
    const root = rootRef.current;
    if (!root || info.id == null) {
      setMenu(null);
      return;
    }
    const box = root.getBoundingClientRect();
    setMenu({
      x: Math.max(8, Math.min(info.x - box.left, box.width - 128)),
      y: Math.max(8, Math.min(info.y - box.top, box.height - 52)),
    });
  }, []);

  const { containerRef, resetView } = useThreeEngine(store, { onContextMenu });

  useEffect(() => {
    if (!store.selId) setMenu(null);
  }, [store.selId]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if ((e.target as HTMLElement).closest(".pw-ctx")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menu]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    if (e.key === "Escape") {
      setMenu(null);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (!store.selectedBoard) return;
      e.preventDefault();
      store.deleteSelected();
      setMenu(null);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      store.undo();
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("input, textarea, button")) return;
    e.currentTarget.focus();
  }

  return (
    <div
      ref={rootRef}
      className="pw"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div ref={containerRef} className="pw-canvas" />
      <Toolbar store={store} onResetView={resetView} />
      <SelectionPanel store={store} />
      {store.mode === "real" && <MaterialPicker store={store} />}
      <HistoryLog store={store} />
      {menu && store.selectedBoard && (
        <div
          className="pw-ctx"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="pw-ctx-btn"
            onClick={() => {
              store.deleteSelected();
              setMenu(null);
            }}
          >
            {String(t(store.lang, "del"))}
          </button>
        </div>
      )}
    </div>
  );
}
