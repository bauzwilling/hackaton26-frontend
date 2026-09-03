import { type KeyboardEvent, type PointerEvent } from "react";
import { useConfiguratorState } from "../hooks/useConfiguratorState";
import { useThreeEngine } from "../hooks/useThreeEngine";
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
  const { containerRef, resetView } = useThreeEngine(store);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
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
    </div>
  );
}
