import type { NestingCounts } from "../types";

type Props = {
  perBox: NestingCounts;
  fullSet: NestingCounts;
  solving: boolean;
  previewDisabled: boolean;
  onToggle: () => void;
  onSend: () => void;
};

function count(value: number | null, solving: boolean) {
  if (value == null) return solving ? "Computing…" : "—";
  return String(value);
}

function Counts({ title, counts, solving }: { title: string; counts: NestingCounts; solving: boolean }) {
  return (
    <section className="boxouts-nesting-counts">
      <h2>{title}</h2>
      <dl>
        <div><dt>Kiefer Plate Panel Count</dt><span /><dd>{count(counts.kSheetNr, solving)}</dd></div>
        <div><dt>Film Plate Panel Count</dt><span /><dd>{count(counts.fSheetNr, solving)}</dd></div>
      </dl>
    </section>
  );
}

export function NestingPanel(props: Props) {
  return (
    <section className="boxouts-nesting-panel">
      <Counts title="Per Box Nesting" counts={props.perBox} solving={props.solving} />
      <div className="boxouts-divider" />
      <Counts title="Full Set Nesting" counts={props.fullSet} solving={props.solving} />
      <div className="boxouts-divider" />
      <div className="boxouts-nesting-actions">
        <button type="button" disabled={props.previewDisabled} onClick={props.onToggle}>Preview<br />Nesting</button>
        <button type="button" disabled={props.previewDisabled} onClick={props.onSend}>Send<br />Results</button>
      </div>
    </section>
  );
}
