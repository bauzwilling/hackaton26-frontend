import { useCallback, useEffect, useRef, useState } from "react";
import { useConfiguratorState } from "../hooks/useConfiguratorState";
import { useProduce } from "../hooks/useProduce";
import { useThreeEngine } from "../hooks/useThreeEngine";
import { t } from "../lib/i18n";
import { Toolbar } from "./Toolbar";
import { SelectionPanel } from "./SelectionPanel";
import { HistoryLog } from "./HistoryLog";
import { ProduceBanner } from "./ProduceBanner";
import { TemplatePicker } from "./TemplatePicker";
import { HelpOverlay } from "./HelpOverlay";
import { PLYWORKS_TOUR } from "../lib/helpTour";
import type { DesignId } from "../lib/designs";
import "../plyworks.css";

interface ConfiguratorProps {
  design?: DesignId;
  helpActive?: boolean;
  onHelpReady?: () => void;
  onHelpDone?: () => void;
  onOpenDesign: (design: DesignId) => void;
  onOpenJointWiz: (jobId: string) => void;
  onOpenNesting: (jobId: string) => void;
}

/**
 * Top-level Plyworks configurator.
 *
 * Drop this into any React app:
 *
 *   import { Configurator } from "./components/Configurator";
 *   <Configurator />
 *
 * It owns its own state and Three.js lifecycle — no props needed.
 * For integration into a larger app, you can lift `useConfiguratorState`
 * to a parent and pass the store as a prop instead.
 */
export function Configurator({
  design,
  helpActive = false,
  onHelpReady,
  onHelpDone,
  onOpenDesign,
  onOpenJointWiz,
  onOpenNesting,
}: ConfiguratorProps) {
  const store = useConfiguratorState(design);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [helpIndex, setHelpIndex] = useState<number | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;
  const helpStep = helpIndex != null ? PLYWORKS_TOUR[helpIndex] : null;

  const postHelp = useCallback((action: "ready" | "done" | "stop") => {
    if (action === "ready") onHelpReady?.();
    else onHelpDone?.();
  }, [onHelpDone, onHelpReady]);

  const stopHelp = useCallback((notify: "done" | "stop" | null) => {
    setHelpIndex(null);
    setTemplatesOpen(false);
    if (notify) postHelp(notify);
  }, [postHelp]);

  const startHelp = useCallback(() => {
    setHelpIndex(0);
    setTemplatesOpen(false);
    postHelp("ready");
  }, [postHelp]);

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
  const { deleteSelected, select, selectedBoards } = store;
  const produce = useProduce(
    store.boards,
    store.kieferThickness,
    store.filmThickness,
    onOpenJointWiz,
    onOpenNesting,
  );

  useEffect(() => {
    if (!store.selIds.length) setMenu(null);
  }, [store.selIds]);

  useEffect(() => {
    if (helpActive) startHelp();
    else if (helpIndex != null) stopHelp(null);
    // The active help phase is the host contract; local help index follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpActive]);

  useEffect(() => {
    if (!helpStep) return;
    const current = storeRef.current;
    if (helpStep.prepare === "templates") setTemplatesOpen(true);
    else setTemplatesOpen(false);
    if (helpStep.prepare === "selection") {
      const first = current.boards[0];
      if (first) current.select(first.id);
    }
  }, [helpStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") {
        if (helpIndex != null) {
          stopHelp("stop");
          return;
        }
        if (templatesOpen) {
          setTemplatesOpen(false);
          return;
        }
        setMenu(null);
        select(null);
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!selectedBoards.length) return;
      e.preventDefault();
      deleteSelected();
      setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, selectedBoards, select, templatesOpen, helpIndex, stopHelp]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest(".pw-ctx")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menu]);

  return (
    <div
      ref={rootRef}
      className="pw"
      tabIndex={0}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("input, textarea, button")) return;
        e.currentTarget.focus();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div ref={containerRef} className="pw-canvas" />
      {templatesOpen && (
        <div
          className="pw-templates-back"
          onPointerDown={() => {
            if (helpIndex == null) setTemplatesOpen(false);
          }}
        />
      )}
      <Toolbar
        store={store}
        onResetView={resetView}
        onProduce={produce.start}
        produceBusy={produce.busy}
        forceOpen={helpStep?.prepare === "toolbar"}
        templatesOpen={templatesOpen}
        onToggleTemplates={() => setTemplatesOpen((open) => !open)}
      >
        {templatesOpen ? (
          <TemplatePicker
            lang={store.lang}
            onClose={() => setTemplatesOpen(false)}
            onOpenNewWindow={onOpenDesign}
            onOverwrite={(id) => {
              store.loadDesign(id);
              setTemplatesOpen(false);
              window.setTimeout(resetView, 0);
            }}
          />
        ) : null}
      </Toolbar>
      <SelectionPanel store={store} />
      <HistoryLog store={store} helpOpen={helpStep?.prepare === "history"} />
      <ProduceBanner
        busy={produce.busy}
        message={produce.message}
        report={produce.report}
        kind={produce.kind}
      />
      {menu && store.selectedBoards.length > 0 && (
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
      {helpIndex != null && (
        <HelpOverlay
          index={helpIndex}
          onBack={() => setHelpIndex((i) => Math.max(0, (i ?? 0) - 1))}
          onStop={() => stopHelp("stop")}
          onNext={() => {
            if (helpIndex >= PLYWORKS_TOUR.length - 1) stopHelp("done");
            else setHelpIndex(helpIndex + 1);
          }}
        />
      )}
    </div>
  );
}
