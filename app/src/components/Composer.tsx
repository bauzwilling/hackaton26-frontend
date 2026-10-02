import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CHAT_MOVE, LAYOUT_ATTACH, LAYOUT_COMPOSER, LAYOUT_FIELD, LAYOUT_SEND, Surface } from "./kit";
import { useSession } from "../context/session";
import { useWorkspace } from "../context/workspace";
import { FILE_ACCEPT } from "../lib/intake";

function ClipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

/** The one chat input. Lives in the hero on a fresh board, inside the Concierge after that. */
export function Composer({
  variant = "hero",
  autoFocus,
  placeholder,
  shareLayout = true,
}: {
  variant?: "hero" | "panel";
  autoFocus?: boolean;
  placeholder?: string;
  shareLayout?: boolean;
}) {
  const { session } = useSession();
  const { ask, ingestFiles, chatOrdered, createSession } = useWorkspace();
  const canAttach = session?.role === "user";
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const layout = reduce ? { duration: 0 } : CHAT_MOVE;
  const hint = placeholder ?? (
    canAttach
      ? "Ask anything — or describe something to build..."
      : "Ask something…"
  );

  function submit() {
    const q = query.trim();
    if (!q) return;
    ask(q);
    setQuery("");
  }

  function onPicked(list: FileList | null) {
    if (!canAttach) return;
    const files = Array.from(list ?? []);
    if (files.length) ingestFiles(files);
    if (fileInput.current) fileInput.current.value = "";
  }

  if (chatOrdered) {
    return (
      <Surface className={`composer composer-${variant} composer-ordered`}>
        <span>This chat was submitted with an order.</span>
        <button type="button" className="btn btn-primary" onClick={createSession}>Start new chat</button>
      </Surface>
    );
  }

  return (
    <Surface
      as={motion.div}
      layout={shareLayout}
      layoutId={shareLayout ? LAYOUT_COMPOSER : undefined}
      className={`composer composer-${variant}`}
      transition={{ layout }}
    >
      {canAttach && (
        <input
          ref={fileInput}
          className="composer-file"
          type="file"
          accept={FILE_ACCEPT}
          multiple
          tabIndex={-1}
          onChange={(e) => onPicked(e.target.files)}
        />
      )}
      <div className="composer-row">
        {canAttach && (
          <Surface
            as={motion.button}
            layout={shareLayout}
            layoutId={shareLayout ? LAYOUT_ATTACH : undefined}
            type="button"
            relief="ghost"
            className="composer-attach"
            aria-label="Attach a file"
            transition={{ layout }}
            onClick={() => fileInput.current?.click()}
          >
            <ClipIcon />
          </Surface>
        )}
        <motion.div layout={shareLayout} layoutId={shareLayout ? LAYOUT_FIELD : undefined} className="composer-field" transition={{ layout }}>
          <input
            type="text"
            value={query}
            autoFocus={autoFocus}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder={hint}
            aria-label="Describe what you want to build"
          />
        </motion.div>
        <Surface
          as={motion.button}
          layout={shareLayout}
          layoutId={shareLayout ? LAYOUT_SEND : undefined}
          type="button"
          relief="accent"
          className="composer-send"
          aria-label="Send"
          transition={{ layout }}
          onClick={submit}
        >
          <SendIcon />
        </Surface>
      </div>
    </Surface>
  );
}
