import { useRef, useState } from "react";
import { Surface } from "./kit";
import { useWorkspace } from "../context/workspace";
import { FILE_ACCEPT } from "../lib/intake";

function ClipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

/** The one chat input. Lives in the hero on a fresh board, inside the Concierge after that. */
export function Composer({
  variant = "hero",
  autoFocus,
  placeholder = "Describe a part, drop a file, or name an app…",
}: {
  variant?: "hero" | "panel";
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const { ask, ingestFiles } = useWorkspace();
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function submit() {
    const q = query.trim();
    if (!q) return;
    ask(q);
    setQuery("");
  }

  function onPicked(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length) ingestFiles(files);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <Surface className={`composer composer-${variant}`}>
      <input
        ref={fileInput}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        hidden
        onChange={(e) => onPicked(e.target.files)}
      />
      <Surface
        as="button"
        type="button"
        relief="inset"
        className="composer-attach"
        aria-label="Attach a file"
        onClick={() => fileInput.current?.click()}
      >
        <ClipIcon />
      </Surface>
      <input
        type="text"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder={placeholder}
      />
      <Surface as="button" type="button" relief="accent" className="composer-send" onClick={submit}>
        Send
      </Surface>
    </Surface>
  );
}
