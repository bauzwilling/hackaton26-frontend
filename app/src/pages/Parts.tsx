import { useState } from "react";
import { Choice, Fact, Segment, Slider, Surface, Switch } from "../components/kit";
import { PartViewer } from "../components/viewer";
import { hours, MATERIALS, money, quotePart } from "../lib/catalog";

export function PartsPage() {
  const [file, setFile] = useState("bracket-front.dxf");
  const [material, setMaterial] = useState("Steel");
  const [thickness, setThickness] = useState(3);
  const [qty, setQty] = useState(60);
  const [deburr, setDeburr] = useState(true);
  const [rush, setRush] = useState(false);
  const spec = MATERIALS.find((m) => m.id === material) ?? MATERIALS[0];
  const q = quotePart(qty, thickness, spec.rate, rush, deburr);

  return (
    <div className="page">
      <div className="hero">
        <h1>Single parts, straight to the machine.</h1>
        <p>Upload a DXF, pick material and thickness, set the quantity. Price and milling time update as you go.</p>
      </div>
      <div className="grid grid-2">
        <div className="stack">
          <Surface className="pad">
            <h2 className="panel-title">Drawing</h2>
            <Surface relief="inset" className="pad" style={{ textAlign: "center" }}>
              <div className="chrome-mark" style={{ margin: "0 auto 12px" }}>dxf</div>
              <div style={{ fontSize: 21, fontWeight: 600 }}>Drop a DXF</div>
              <p className="muted">One file per part, contours closed</p>
              <Surface as="button" type="button" style={{ padding: "10px 16px" }} onClick={() => setFile("demo-plate.dxf")}>
                Use sample file
              </Surface>
            </Surface>
            <div className="row" style={{ marginTop: 14 }}>
              <Surface relief="inset" style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13 }}>{file}</Surface>
            </div>
          </Surface>
          <Surface className="pad">
            <h2 className="panel-title">Material</h2>
            <div className="choices">
              {MATERIALS.map((item) => (
                <Choice key={item.id} selected={material === item.id} chip={item.chip} title={item.id} note={item.note} onClick={() => setMaterial(item.id)} />
              ))}
            </div>
            <div style={{ marginTop: 22 }}>
              <div className="fact" style={{ boxShadow: "none", padding: "0 0 10px" }}>
                <span className="muted" style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12.5 }}>Thickness</span>
                <strong style={{ color: "var(--acc-deep)", fontSize: 24 }}>{thickness} mm</strong>
              </div>
              <Segment value={String(thickness)} options={[1, 2, 3, 5, 8].map((n) => ({ id: String(n), label: `${n}` }))} onChange={(id) => setThickness(Number(id))} />
            </div>
            <div style={{ marginTop: 22 }}>
              <div className="fact" style={{ boxShadow: "none", padding: "0 0 10px" }}>
                <span className="muted" style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12.5 }}>Quantity</span>
                <strong style={{ color: "var(--acc-deep)", fontSize: 24 }}>{qty} units</strong>
              </div>
              <Slider min={1} max={500} value={qty} onChange={setQty} />
            </div>
            <div className="stack" style={{ marginTop: 22, gap: 16 }}>
              <Switch on={deburr} onToggle={() => setDeburr((v) => !v)} label="Deburr edges" note={deburr ? "On" : "Off"} />
              <Switch on={rush} onToggle={() => setRush((v) => !v)} label="Express, 48 h" note={rush ? "On" : "Off"} />
            </div>
          </Surface>
        </div>
        <div className="stack">
          <Surface className="pad">
            <h2 className="panel-title">Preview</h2>
            <PartViewer w={180} h={12 + thickness * 4} d={120} color={spec.chip} />
          </Surface>
          <Surface className="pad">
            <h2 className="panel-title">Quote</h2>
            <div className="stack" style={{ gap: 8 }}>
              <Fact label="Material" value={`${spec.id}, ${thickness} mm`} />
              <Fact label="Quantity" value={`${qty}`} />
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
