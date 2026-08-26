import { useState } from "react";
import { Link } from "react-router-dom";
import { Segment, Surface } from "../components/kit";
import { PROJECTS } from "../lib/catalog";

export function ProjectsPage() {
  const [filter, setFilter] = useState("All");
  const names = ["All", "Boxouts", "Simple Parts", "Briefs"];
  const list = filter === "All" ? PROJECTS : PROJECTS.filter((p) => p.kind === filter);

  return (
    <div className="page">
      <div className="hero">
        <h1>Your projects</h1>
        <p>Every brief, configuration and order started with the concierge.</p>
      </div>
      <Segment value={filter} options={names.map((id) => ({ id, label: id }))} onChange={setFilter} />
      <div className="choices" style={{ marginTop: 22, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {list.map((p) => (
          <Surface key={p.title} as={Link} to="/" className="choice">
            <span className="muted" style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>{p.kind}</span>
            <strong>{p.title}</strong>
            <span className="muted">{p.desc}</span>
            <span className="muted" style={{ fontSize: 12 }}>{p.status} · {p.when}</span>
          </Surface>
        ))}
      </div>
    </div>
  );
}

export function PlyworksPage() {
  return (
    <div className="page">
      <div className="hero">
        <h1>Plyworks</h1>
        <p>The plywood editor still lives in the original prototype. This page is the same shell as every other app.</p>
      </div>
      <Surface className="pad">
        <p>Open the bundled editor beside this app when you need the full sheet layout tools. A native port comes after Boxouts and Simple Parts are solid.</p>
      </Surface>
    </div>
  );
}
