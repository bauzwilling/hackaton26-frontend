interface Props {
  busy: boolean;
  message: string | null;
  report?: string | null;
  kind: "ok" | "fail" | "error" | null;
}

export function ProduceBanner({ busy, message, report, kind }: Props) {
  const headline = message ?? (busy ? "Checking geometry for production…" : null);
  if (!headline && !report) return null;
  const showReport = Boolean(report && (message || !busy));
  const tone = busy && !message ? "#5c5348" : kind === "ok" ? "#188500" : "#9a3412";
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        bottom: 26,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 12,
        maxWidth: 640,
        padding: "12px 18px",
        borderRadius: 14,
        background: "var(--pw-surface, #fffdf8)",
        boxShadow: "0 1px 2px rgba(33,31,29,.1), 0 8px 22px rgba(33,31,29,.14)",
        fontFamily: "Figtree, system-ui, sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: tone,
        textAlign: showReport ? "left" : "center",
      }}
    >
      {headline}
      {showReport ? (
        <div
          style={{
            marginTop: 6,
            fontWeight: 500,
            fontSize: 13,
            lineHeight: 1.45,
            opacity: 0.88,
            whiteSpace: "pre-line",
          }}
        >
          {report}
        </div>
      ) : null}
    </div>
  );
}
