import { useState } from "react";
import { Choice, Fact, Segment, Slider, Surface, Switch } from "../components/kit";
import { PartViewer } from "../components/viewer";
import { hours, money, quoteBox, WOODS } from "../lib/catalog";

export function BoxoutsPage() {
  const [wood, setWood] = useState("Pine");
  const [w, setW] = useState(300);
  const [h, setH] = useState(1790);
  const [d, setD] = useState(945);
  const [count, setCount] = useState(6);
  const [film, setFilm] = useState(true);
  const [nest, setNest] = useState(true);
  const spec = WOODS.find((x) => x.id === wood) ?? WOODS[0];
  const q = quoteBox(w, h, d, count, spec.rate, film, nest);
  const filled = Math.round(12 * (1 - q.waste / 100) * 0.92);

  return (
    <div className="page">
      <div className="hero">
        <h1>Door boxouts, built from dimensions.</h1>
        <p>Set width, height and depth, pick the wood. Nesting, sheet count and milling time update as you go.</p>
      </div>
      <div className="grid grid-2">
        <div className="stack">
          <Surface className="pad">
            <h2 className="panel-title">Dimensions</h2>
            {([
              ["Width", w, 200, 600, setW],
              ["Height", h, 1200, 2400, setH],
              ["Depth", d, 400, 1400, setD],
            ] as const).map(([label, value, min, max, set]) => (
              <div key={label} style={{ marginBottom: 22 }}>
                <div className="fact" style={{ boxShadow: "none", padding: "0 0 10px" }}>
                  <span className="muted" style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12.5 }}>{label}</span>
                  <strong style={{ color: "var(--acc-deep)", fontSize: 24 }}>{value} mm</strong>
                </div>
                <Slider min={min} max={max} step={5} value={value} onChange={set} />
              </div>
            ))}
          </Surface>
          <Surface className="pad">
            <h2 className="panel-title">Wood</h2>
            <div className="choices">
              {WOODS.map((item) => (
                <Choice key={item.id} selected={wood === item.id} chip={item.chip} title={item.id} note={item.note} onClick={() => setWood(item.id)} />
              ))}
            </div>
            <div style={{ marginTop: 22 }}>
              <div className="fact" style={{ boxShadow: "none", padding: "0 0 10px" }}>
                <span className="muted" style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12.5 }}>Quantity</span>
                <strong style={{ color: "var(--acc-deep)", fontSize: 24 }}>{count}</strong>
              </div>
              <Segment value={String(count)} options={[1, 2, 4, 6, 12].map((n) => ({ id: String(n), label: String(n) }))} onChange={(id) => setCount(Number(id))} />
            </div>
            <div className="stack" style={{ marginTop: 22, gap: 16 }}>
              <Switch on={film} onToggle={() => setFilm((v) => !v)} label="Film-faced panels" note={film ? "On" : "Off"} />
              <Switch on={nest} onToggle={() => setNest((v) => !v)} label="Auto-nesting" note={nest ? "On" : "Off"} />
            </div>
          </Surface>
        </div>
        <div className="stack">
          <Surface className="pad">
            <h2 className="panel-title">Preview</h2>
            <PartViewer w={w} h={h} d={d} color={spec.chip} />
            <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>{w} × {h} × {d} mm</p>
          </Surface>
          <Surface className="pad">
            <h2 className="panel-title">Nesting</h2>
            <Surface relief="inset" className="nest">
              {Array.from({ length: 12 }, (_, i) => (
                <Surface key={i} relief={i < filled ? "accent" : "inset"} className="nest-cell" />
              ))}
            </Surface>
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>{q.waste}% waste</p>
          </Surface>
          <Surface className="pad">
            <h2 className="panel-title">Quote</h2>
            <div className="stack" style={{ gap: 8 }}>
              <Fact label="Wood" value={spec.id + (film ? ", film-faced" : "")} />
              <Fact label="Area" value={`${q.area.toFixed(2)} m² per unit`} />
              <Fact label="Sheets" value={`${q.sheets} pcs`} />
              <Fact label="Milling time" value={hours(q.minutes)} />
              <Fact label="Per unit" value={money(q.unit)} />
              <Fact label="Total" value={money(q.total)} />
            </div>
            <Surface as="button" type="button" relief="accent" style={{ width: "100%", marginTop: 18, padding: 14, fontWeight: 700 }}>
              Request production
            </Surface>
          </Surface>
        </div>
      </div>
    </div>
  );
}
