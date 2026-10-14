import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Composer } from "../components/Composer";
import { Surface } from "../components/kit";
import { plyworksDesignLabel } from "../lib/concierge";
import { HELP_OFFER_LABEL, HELP_TOPIC_LABEL, SUPERUSER_TOUR_ROLE_LABEL, type HelpOfferId, type HelpTopicId, type LiveTourRole } from "../lib/help";
import {
  activityClock,
  activityFocusIds,
  activityName,
  appLabel,
  isActivityEntry,
  isRelayEntry,
  useWorkspace,
  type RequestEntry,
  type WorkspaceApp,
} from "../context/workspace";
import { useHelp } from "../context/help";
import { useSession } from "../context/session";
import type { AttachmentPreview } from "../workspace/document";
import { isDesignChatRole } from "../lib/auth";
import { AppPromptControls } from "./AppPromptControls";

function replyOf(entry: RequestEntry) {
  return entry.reply ?? entry.routeWhy ?? "Answered on the canvas";
}

/** Keep extension visible: thisIsTheFi...dxf */
function truncateFileName(name: string, max = 24) {
  const t = name.trim();
  if (t.length <= max) return t;
  const dot = t.lastIndexOf(".");
  const ext = dot > 0 && dot < t.length - 1 ? t.slice(dot) : "";
  const stem = ext ? t.slice(0, dot) : t;
  const budget = max - ext.length - 3;
  if (budget < 4) return `${t.slice(0, Math.max(1, max - 3))}...`;
  return `${stem.slice(0, budget)}...${ext}`;
}

function displayQuery(entry: RequestEntry) {
  if (entry.attachment) return truncateFileName(entry.query);
  return entry.query;
}

function attachmentFace(entry: RequestEntry): AttachmentPreview | null {
  const preview = entry.attachmentPreview;
  if (!preview) return null;
  if (preview.kind === "image" && preview.src.startsWith("data:image/")) return preview;
  if (preview.kind === "file" && preview.ext) return preview;
  return null;
}

function FileTypeIcon({ ext, size = 28 }: { ext: string; size?: number }) {
  const kind = ext === "pdf"
    ? "page"
    : ext === "csv" || ext === "xls" || ext === "xlsx"
      ? "sheet"
      : ext === "dxf" || ext === "dwg" || ext === "3dm"
        ? "cad"
        : "file";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "sheet" ? (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M4 9h16M4 15h16M10 3v18" />
        </>
      ) : kind === "cad" ? (
        <>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </>
      ) : (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          {kind === "page" && <path d="M8 13h8M8 17h5" />}
        </>
      )}
    </svg>
  );
}

function AttachmentFace({ preview }: { preview: AttachmentPreview }) {
  if (preview.kind === "image") {
    return <img className="chat-file-thumb" src={preview.src} alt="" />;
  }
  const label = preview.ext.slice(0, 4).toUpperCase();
  return (
    <div className="chat-file-icon">
      <FileTypeIcon ext={preview.ext} />
      <span className="chat-file-ext">{label}</span>
    </div>
  );
}

function FilePreviewDialog({
  preview,
  name,
  onClose,
}: {
  preview: AttachmentPreview;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="chat-file-preview" role="presentation" onPointerDown={onClose}>
      <div
        className="chat-file-preview-card"
        role="dialog"
        aria-modal="true"
        aria-label={name || "File preview"}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {preview.kind === "image" ? (
          <img className="chat-file-preview-img" src={preview.src} alt={name} />
        ) : (
          <div className="chat-file-preview-file">
            <FileTypeIcon ext={preview.ext} size={64} />
            <p className="chat-file-preview-note">
              This file cannot be previewed here. Open it in a compatible app.
            </p>
          </div>
        )}
        {name ? <p className="chat-file-preview-name">{name}</p> : null}
      </div>
    </div>,
    document.body,
  );
}

function UserBubble({ entry }: { entry: RequestEntry }) {
  const face = entry.attachment ? attachmentFace(entry) : null;
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div className="chat-bubble chat-user" title={entry.attachment ? entry.query : undefined}>
      {face && (
        <button
          type="button"
          className="chat-file-open"
          aria-label={`Preview ${entry.query}`}
          onClick={(event) => {
            event.stopPropagation();
            setPreviewOpen(true);
          }}
        >
          <AttachmentFace preview={face} />
        </button>
      )}
      {previewOpen && face && (
        <FilePreviewDialog
          preview={face}
          name={entry.query}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {entry.attachment ? (
        <div className="chat-user-meta">
          <time dateTime={new Date(entry.at).toISOString()}>{activityClock(entry.at)}</time>
          <span className="chat-user-meta-sep" aria-hidden>|</span>
          <span>Attached File</span>
        </div>
      ) : (
        <time dateTime={new Date(entry.at).toISOString()}>{activityClock(entry.at)}</time>
      )}
      {displayQuery(entry)}
    </div>
  );
}

function ActivityLine({
  entry,
  selected,
  verb,
  onOpen,
}: {
  entry: RequestEntry;
  selected: boolean;
  verb: "Opened" | "Closed";
  onOpen: () => void;
}) {
  return (
    <p className={`chat-activity${selected ? " is-selected" : ""}`}>
      <time dateTime={new Date(entry.at).toISOString()}>{activityClock(entry.at)}</time>
      {" "}
      <span className="chat-activity-text">
        {verb}{" "}
        <button type="button" className="chat-activity-app" onClick={onOpen}>
          {activityName(entry)}
        </button>
      </span>
    </p>
  );
}

function AppBadge({
  app,
  onClick,
}: {
  app: WorkspaceApp;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="chat-app-badge"
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      title={`Focus ${appLabel(app)}`}
    >
      {appLabel(app)}
    </button>
  );
}

function LogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8M8 9h2" />
    </svg>
  );
}

export function ConciergeThread() {
  const {
    entries, selectedEntryId, setSelectedEntryId, ask, confirmIntake,
    nodes, focusTargets, activeSession, returnToLanding,
  } = useWorkspace();
  const { session } = useSession();
  const { pickTopic, pickOffer, startRoleTour } = useHelp();
  const listRef = useRef<HTMLDivElement>(null);
  const canLogFilter = session?.role === "user";
  const [logOnly, setLogOnly] = useState(false);
  // Opened lines from chat handoffs live on the turn (windowOpened); Closed is a dedicated activity entry.
  const showLogOnly = canLogFilter && logOnly;
  const visible = showLogOnly
    ? entries.filter((e) => isActivityEntry(e) || Boolean(e.windowOpened))
    : entries;

  useEffect(() => {
    if (!canLogFilter) setLogOnly(false);
  }, [canLogFilter]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length, showLogOnly]);

  function onActivity(entry: RequestEntry) {
    setSelectedEntryId(entry.id);
    const ids = activityFocusIds(entry, nodes);
    if (!ids.length) return;
    focusTargets(ids);
  }

  function onBadge(entry: RequestEntry) {
    setSelectedEntryId(entry.id);
    const ids = activityFocusIds(entry, nodes);
    if (!ids.length) return;
    focusTargets(ids);
  }

  return (
    <div className="concierge-thread">
      <div className="concierge-head">
        <h2 className="concierge-title">{activeSession?.title ?? "New chat"}</h2>
        {canLogFilter && (
          <button
            type="button"
            className={`session-icon-btn is-lg${showLogOnly ? " is-on" : ""}`}
            data-help="concierge-log"
            title={showLogOnly ? "Show full chat" : "Logs"}
            aria-label="Logs"
            aria-pressed={showLogOnly}
            onClick={() => setLogOnly((on) => !on)}
          >
            <LogIcon />
          </button>
        )}
        <button
          type="button"
          className="session-icon-btn is-lg concierge-close"
          title="Close"
          aria-label="Close"
          onClick={returnToLanding}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="concierge-scroll" ref={listRef} onWheel={(e) => e.stopPropagation()}>
        {visible.length === 0 && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {showLogOnly
              ? "No window activity yet."
              : canLogFilter
                ? "Ask anything or drop a file — replies land here."
                : "Ask something — replies land here."}
          </p>
        )}
        {visible.map((e) => {
          if (isActivityEntry(e)) {
            return (
              <ActivityLine
                key={e.id}
                entry={e}
                selected={selectedEntryId === e.id}
                verb={e.activity === "closed" ? "Closed" : "Opened"}
                onOpen={() => onActivity(e)}
              />
            );
          }
          if (logOnly && e.windowOpened) {
            return (
              <ActivityLine
                key={e.id}
                entry={e}
                selected={selectedEntryId === e.id}
                verb="Opened"
                onOpen={() => onActivity(e)}
              />
            );
          }
          if (isRelayEntry(e)) {
            return (
            <div
              key={e.id}
              className={`chat-turn chat-relay${selectedEntryId === e.id ? " is-selected" : ""}`}
              onClick={() => onBadge(e)}
            >
              <div className="chat-bubble chat-assistant">
                <div className="chat-assistant-meta">
                  <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
                  {(e.badgeApp ?? e.appId) && (
                    <AppBadge app={(e.badgeApp ?? e.appId)!} onClick={() => onBadge(e)} />
                  )}
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{replyOf(e)}</p>
                {e.appPrompt && e.appId && (
                  <AppPromptControls
                    entryId={e.id}
                    appId={e.appId}
                    prompt={e.appPrompt}
                  />
                )}
              </div>
            </div>
            );
          }
          if (e.result === "app"
            && e.appId
            && !(e.confirmApps && e.confirmApps.length)
            && !(e.choices && e.choices.length)
            && !(e.helpTopics && e.helpTopics.length)
            && !(e.helpOffer && e.helpOffer.length)
            && !(e.helpTourRoles && e.helpTourRoles.length)) {
            return (
            <div
              key={e.id}
              className={`chat-turn${selectedEntryId === e.id ? " is-selected" : ""}`}
              onClick={() => setSelectedEntryId(e.id)}
            >
              {e.query.trim() ? <UserBubble entry={e} /> : null}
              {e.windowOpened ? (
                <ActivityLine
                  entry={e}
                  selected={selectedEntryId === e.id}
                  verb="Opened"
                  onOpen={() => onBadge(e)}
                />
              ) : null}
            </div>
            );
          }
          return (
            <div
              key={e.id}
              className={`chat-turn${selectedEntryId === e.id ? " is-selected" : ""}`}
              onClick={() => setSelectedEntryId(e.id)}
            >
              <UserBubble entry={e} />
              <div className={`chat-bubble chat-assistant${e.pending ? " is-pending" : ""}`}>
                <div className="chat-assistant-meta">
                  <time dateTime={new Date(e.at).toISOString()}>{activityClock(e.at)}</time>
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{replyOf(e)}</p>
                {e.confirmApps && e.confirmApps.length > 0 && (
                  <div className="concierge-confirm">
                    {e.confirmApps.map((app) => (
                      <Surface
                        key={app}
                        as="button"
                        type="button"
                        className="chip"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          confirmIntake(e.id, app);
                        }}
                      >
                        {appLabel(app)}
                      </Surface>
                    ))}
                  </div>
                )}
                {e.choices && e.choices.length > 0 && (
                  <div className="concierge-confirm">
                    {e.choices.map((id) => (
                      <Surface
                        key={id}
                        as="button"
                        type="button"
                        className="chip"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          ask(id);
                        }}
                      >
                        {plyworksDesignLabel(id)}
                      </Surface>
                    ))}
                  </div>
                )}
                {e.helpOffer && e.helpOffer.length > 0 && (
                  <div className="concierge-confirm">
                    {e.helpOffer.map((id: HelpOfferId) => (
                      <Surface
                        key={id}
                        as="button"
                        type="button"
                        className="chip"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          pickOffer(id);
                        }}
                      >
                        {HELP_OFFER_LABEL[id]}
                      </Surface>
                    ))}
                  </div>
                )}
                {e.helpTourRoles && e.helpTourRoles.length > 0 && (
                  <div className="concierge-confirm">
                    {e.helpTourRoles.map((id: LiveTourRole) => (
                      <Surface
                        key={id}
                        as="button"
                        type="button"
                        className="chip"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          startRoleTour(id);
                        }}
                      >
                        {SUPERUSER_TOUR_ROLE_LABEL[id]}
                      </Surface>
                    ))}
                  </div>
                )}
                {e.helpTopics && e.helpTopics.length > 0 && (
                  <div className="concierge-confirm">
                    {e.helpTopics.map((id: HelpTopicId) => (
                      <Surface
                        key={id}
                        as="button"
                        type="button"
                        className="chip"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          pickTopic(id);
                        }}
                      >
                        {HELP_TOPIC_LABEL[id]}
                      </Surface>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ConciergeChat() {
  const { entries } = useWorkspace();
  const { session } = useSession();
  const handedOff = useRef(entries.some((e) => e.pending)).current;
  const canAttach = isDesignChatRole(session);

  return (
    <div className="concierge">
      <ConciergeThread />
      <Composer
        variant="panel"
        autoFocus={handedOff}
        placeholder={canAttach ? "Ask, or drop a file…" : "Ask something…"}
      />
    </div>
  );
}
