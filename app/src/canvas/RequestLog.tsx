import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Surface } from "../components/kit";
import { entryIsLive, useWorkspace, type RequestEntry } from "../context/workspace";

export function RequestLog({ viewport }: { viewport: { width: number; height: number } }) {
  const { entries, nodes, selectedEntryId, setSelectedEntryId, focusTargets, restoreEntry } = useWorkspace();
  const listRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  function onRowClick(entry: RequestEntry) {
    setSelectedEntryId(entry.id);
    setMenu(null);
    if (!entryIsLive(entry, nodes)) return;
    focusTargets(entry.targetIds, viewport);
  }

  function onRowContext(e: MouseEvent<HTMLButtonElement>, entry: RequestEntry) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEntryId(entry.id);
    const box = (e.currentTarget as HTMLElement).closest(".request-log")?.getBoundingClientRect();
    const x = box ? e.clientX - box.left : e.nativeEvent.offsetX;
    const y = box ? e.clientY - box.top : e.nativeEvent.offsetY;
    setMenu({ id: entry.id, x, y });
  }

  const menuEntry = menu ? entries.find((e) => e.id === menu.id) : null;
  const menuDeleted = menuEntry ? !entryIsLive(menuEntry, nodes) : false;

  return (
    <div className="request-log">
      <div className="request-log-list" ref={listRef}>
        {entries.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Asks in this session land here.</p>}
        {entries.map((e) => {
          const live = entryIsLive(e, nodes);
          return (
            <button
              key={e.id}
              type="button"
              className={`request-row${live ? "" : " is-deleted"}${selectedEntryId === e.id ? " is-selected" : ""}`}
              onClick={() => onRowClick(e)}
              onContextMenu={(ev) => onRowContext(ev, e)}
            >
              <span className="request-row-query">{e.query}</span>
              <span className="request-row-meta">
                {live ? `Routed to ${e.routeLabel}` : "Deleted"}
              </span>
            </button>
          );
        })}
      </div>
      {menu && menuEntry && (
        <>
          <div className="request-menu-back" onPointerDown={() => setMenu(null)} />
          <Surface className="request-menu" style={{ left: menu.x, top: menu.y }}>
            {menuDeleted ? (
              <button type="button" onClick={() => { restoreEntry(menuEntry.id, viewport); setMenu(null); }}>Restore</button>
            ) : (
              <button type="button" onClick={() => { onRowClick(menuEntry); }}>Show on canvas</button>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}
