import { useState } from "react";
import { Surface } from "../components/kit";
import type { AppChatPrompt } from "../lib/appChat";
import type { WorkspaceApp } from "../context/workspace";
import { useWorkspace } from "../context/workspace";

function sizeKey(size: { x: number; y: number }) {
  return `${size.x}x${size.y}`;
}

export function AppPromptControls({
  entryId,
  appId,
  prompt,
}: {
  entryId: string;
  appId: WorkspaceApp;
  prompt: AppChatPrompt;
}) {
  const { dispatchAppChatAction } = useWorkspace();
  const resolved = Boolean(prompt.resolved);
  const sizes = prompt.allowedSizesMm ?? [];
  const thicknesses = prompt.allowedThicknessesMm ?? [];
  const materials = prompt.materials ?? [];

  const [materialId, setMaterialId] = useState(
    () => materials.find((m) => m.id)?.id ?? "",
  );
  const [sheetKey, setSheetKey] = useState(() => {
    if (prompt.sheetX && prompt.sheetY) return sizeKey({ x: prompt.sheetX, y: prompt.sheetY });
    return sizes[0] ? sizeKey(sizes[0]) : "";
  });
  const [thickness, setThickness] = useState(() => {
    if (prompt.sheetThickness) return String(prompt.sheetThickness);
    return thicknesses[0] != null ? String(thicknesses[0]) : "";
  });

  if (prompt.kind === "confirm" && prompt.choices?.length) {
    return (
      <div className="concierge-confirm">
        {prompt.choices.map((choice) => (
          <Surface
            key={choice}
            as="button"
            type="button"
            className="chip"
            disabled={resolved}
            onClick={(ev) => {
              ev.stopPropagation();
              dispatchAppChatAction(appId, {
                type: "confirm",
                messageId: prompt.messageId,
                choice,
              }, entryId);
            }}
          >
            {choice}
          </Surface>
        ))}
      </div>
    );
  }

  if (prompt.kind === "material-select") {
    if (!materials.length) {
      return (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 12 }}>
          Materials catalog is still loading…
        </p>
      );
    }
    const selected = materials.find((m) => m.id === materialId) ?? materials[0];
    return (
      <div className="concierge-app-prompt" onClick={(ev) => ev.stopPropagation()}>
        <select
          className="concierge-app-select"
          aria-label="Material"
          disabled={resolved}
          value={selected?.id ?? ""}
          onChange={(ev) => setMaterialId(ev.target.value)}
        >
          {materials.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} ({item.allowedThicknessesMm.join(", ")} mm)
            </option>
          ))}
        </select>
        <Surface
          as="button"
          type="button"
          className="chip"
          disabled={resolved || !selected}
          onClick={() => {
            if (!selected) return;
            dispatchAppChatAction(appId, {
              type: "material",
              messageId: prompt.messageId,
              material: selected,
            }, entryId);
          }}
        >
          Confirm
        </Surface>
      </div>
    );
  }

  if (prompt.kind === "sheet-size-select" && sizes.length && thicknesses.length) {
    const [sx, sy] = sheetKey.split("x").map(Number);
    const t = Number(thickness);
    const valid = Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(t) && sx > 0 && sy > 0 && t > 0;
    return (
      <div className="concierge-app-prompt" onClick={(ev) => ev.stopPropagation()}>
        <select
          className="concierge-app-select"
          aria-label="Sheet format in millimeters"
          disabled={resolved}
          value={sheetKey}
          onChange={(ev) => setSheetKey(ev.target.value)}
        >
          {sizes.map((size) => (
            <option key={sizeKey(size)} value={sizeKey(size)}>
              {size.x} × {size.y} mm
            </option>
          ))}
        </select>
        <select
          className="concierge-app-select"
          aria-label="Sheet thickness in millimeters"
          disabled={resolved}
          value={thickness}
          onChange={(ev) => setThickness(ev.target.value)}
        >
          {thicknesses.map((value) => (
            <option key={value} value={value}>
              {value} mm
            </option>
          ))}
        </select>
        <Surface
          as="button"
          type="button"
          className="chip"
          disabled={resolved || !valid}
          onClick={() => {
            if (!valid) return;
            dispatchAppChatAction(appId, {
              type: "sheet-size",
              messageId: prompt.messageId,
              sheetX: sx,
              sheetY: sy,
              sheetThickness: t,
            }, entryId);
          }}
        >
          Confirm
        </Surface>
      </div>
    );
  }

  if (prompt.kind === "nest-cta") {
    return (
      <div className="concierge-app-prompt" onClick={(ev) => ev.stopPropagation()}>
        <Surface
          as="button"
          type="button"
          className={`chip${prompt.nestingNeedsRerun ? " is-warn" : ""}`}
          disabled={resolved}
          onClick={() => {
            dispatchAppChatAction(appId, { type: "nest" }, entryId);
          }}
        >
          Nest
        </Surface>
      </div>
    );
  }

  if (prompt.kind === "nesting-result") {
    return (
      <div className="concierge-app-prompt" onClick={(ev) => ev.stopPropagation()}>
        <Surface
          as="button"
          type="button"
          className="chip"
          disabled={resolved}
          onClick={() => {
            dispatchAppChatAction(appId, {
              type: "show-nesting-result",
              messageId: prompt.messageId,
            }, entryId);
          }}
        >
          {prompt.leftoverComplete ? "Show full nesting result" : "Show nesting result"}
        </Surface>
      </div>
    );
  }

  return null;
}
