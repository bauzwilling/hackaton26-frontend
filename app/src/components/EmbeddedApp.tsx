// WAITING DATABASE: job output from this iframe (nesting ZIP / send-results payload) → product job/artifact API

export function EmbeddedApp({ src, title }: { src: string; title: string }) {
  if (!src) {
    return <p className="muted" style={{ margin: 16 }}>No URL configured.</p>;
  }
  return (
    <iframe
      className="embedded-app"
      src={src}
      title={title}
      allow="clipboard-read; clipboard-write"
    />
  );
}
