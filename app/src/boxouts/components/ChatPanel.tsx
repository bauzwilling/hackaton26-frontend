import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { ChatMessage } from "../types";

const EXTENSIONS = [".csv", ".xlsx", ".jpg", ".jpeg", ".png"];

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  awaitingConfirm: boolean;
  hasBoxes: boolean;
  onSendText: (text: string) => void;
  onAttachFile: (file: File) => void;
  onAttachError: (message: string) => void;
  onConfirmChoice: (choice: string) => void;
  onClearAll: () => void;
};

export function ChatPanel(props: Props) {
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const disabled = props.busy || props.awaitingConfirm;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [props.messages.length, props.busy]);

  function forward(file: File) {
    if (EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      props.onAttachFile(file);
    } else {
      props.onAttachError("Use a CSV, Excel, JPG, or PNG file.");
    }
  }

  function send() {
    const text = draft.trim();
    if (!text || disabled) return;
    props.onSendText(text);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) {
      props.onAttachError("Please drag and drop only one file at a time.");
      return;
    }
    forward(files[0]);
  }

  return (
    <aside className="boxouts-sidebar">
      <h1>DoorBoxOut</h1>
      <section
        className={`boxouts-chat ${dragging ? "boxouts-chat--dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div ref={listRef} className="boxouts-message-list" role="log" aria-live="polite">
          {props.messages.length === 0 && (
            <p className="boxouts-empty">
              Describe a box as Depth × Height × Width (for example 300 × 2100 × 900 mm), or drop a CSV, Excel, JPG, or PNG file.
            </p>
          )}
          {props.messages.map((message) => (
            <article key={message.id} className={`boxouts-message boxouts-message--${message.role}`}>
              <div className={`boxouts-bubble boxouts-bubble--${message.role} boxouts-bubble--${message.kind}`}>
                <p>{message.content}</p>
                {message.kind === "confirm" && message.meta?.choices && (
                  <div className="boxouts-confirm-actions">
                    {message.meta.choices.map((choice) => (
                      <button type="button" key={choice} onClick={() => props.onConfirmChoice(choice)}>
                        {choice}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
          {props.busy && <p className="boxouts-typing">Parsing…</p>}
        </div>
        {dragging && <div className="boxouts-drop-overlay">Drop CSV, Excel, JPG, or PNG</div>}
        <div className="boxouts-composer">
          <input
            ref={fileRef}
            hidden
            type="file"
            accept=".csv,.xlsx,.jpg,.jpeg,.png,text/csv,image/jpeg,image/png"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) forward(file);
              event.target.value = "";
            }}
          />
          <textarea
            rows={2}
            value={draft}
            disabled={disabled}
            aria-label="Box description"
            placeholder="e.g. 300 × 2100 × 900 (D × H × W)…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="boxouts-composer-actions">
            <button type="button" disabled={!props.hasBoxes || disabled} onClick={props.onClearAll}>Clear all</button>
            <button type="button" disabled={disabled} onClick={() => fileRef.current?.click()}>Attach file</button>
            <button type="button" className="boxouts-primary" disabled={!draft.trim() || disabled} onClick={send}>Send</button>
          </div>
        </div>
      </section>
    </aside>
  );
}
