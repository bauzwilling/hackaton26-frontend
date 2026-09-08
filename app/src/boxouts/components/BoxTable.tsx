import { useState } from "react";
import type { BoxParam, InputLists, SolveState } from "../types";
import {
  CSV_CELL_EMPTY,
  CSV_CELL_MISSING,
  CSV_CELL_OUT_OF_RANGE,
  CSV_GH_INPUT_NAMES,
  CSV_GH_PARAM_BOUNDS,
  CSV_GH_PARAM_LABELS,
  coerceQuantity,
  formatVariationCellDisplay,
  getEditedCellKeys,
  inputListsToVariationRows,
  isParamValueValid,
} from "../lib/csv.js";

type Props = {
  inputLists: InputLists | null;
  sourceLists: InputLists | null;
  emptyCellKeys: Set<string>;
  names: string[];
  quantities: number[];
  selectedIndex: number;
  solve: SolveState;
  onSelect: (index: number) => void;
  onApply: (lists: InputLists, quantities: number[]) => void;
  onDelete: (index: number) => void;
};

export function BoxTable(props: Props) {
  const [active, setActive] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  if (!props.inputLists) {
    return <section className="boxouts-table"><p className="boxouts-empty">No boxes yet</p></section>;
  }

  const rows = inputListsToVariationRows(props.inputLists, props.names, props.quantities);
  const edited = props.sourceLists
    ? getEditedCellKeys(props.sourceLists, props.inputLists, props.names)
    : new Set<string>();

  function display(row: Record<string, unknown>, param: BoxParam) {
    const key = `${row.index}:${param}`;
    if (row[param] == null && props.emptyCellKeys.has(key)) return CSV_CELL_EMPTY;
    return formatVariationCellDisplay(row[param], { param });
  }

  function update(index: number, param: BoxParam | "Quantity", raw: string) {
    setActive(null);
    if (param === "Quantity") {
      const next = [...props.quantities];
      next[index] = coerceQuantity(raw);
      props.onApply(props.inputLists!, next);
    } else {
      const value = Number.parseInt(raw, 10);
      if (!Number.isFinite(value) || !isParamValueValid(value, param)) return;
      const lists: InputLists = {
        BoxDepth: [...props.inputLists!.BoxDepth],
        BoxHeight: [...props.inputLists!.BoxHeight],
        BoxWidth: [...props.inputLists!.BoxWidth],
      };
      lists[param][index] = value;
      props.onApply(lists, props.quantities);
    }
  }

  return (
    <section className="boxouts-table">
      <div className="boxouts-table-scroll">
        <table>
          <thead><tr>
            <th />
            <th>Box</th>
            {CSV_GH_INPUT_NAMES.map((param: BoxParam) => <th key={param}>{CSV_GH_PARAM_LABELS[param]}</th>)}
            <th>Quantity</th><th />
          </tr></thead>
          <tbody>
            {rows.map((row: Record<string, unknown>) => {
              const index = row.index as number;
              const status = props.solve.variationStatuses[index] ?? "pending";
              return (
                <tr key={index} className={`${index === props.selectedIndex ? "selected" : ""} ${status === "computing" ? "computing" : ""}`}>
                  <td className="boxouts-status" title={props.solve.rowErrors.get(index)}>
                    {status === "computing" ? <span className="boxouts-spinner" /> : status === "done" ? "✓" : status === "failed" ? "!" : "•"}
                  </td>
                  <td className="boxouts-name" onClick={() => props.onSelect(index)}>
                    {formatVariationCellDisplay(row.name, { isName: true })}
                  </td>
                  {CSV_GH_INPUT_NAMES.map((param: BoxParam) => {
                    const key = `${index}:${param}`;
                    const text = display(row, param);
                    const invalid = text === CSV_CELL_EMPTY || text === CSV_CELL_MISSING || text === CSV_CELL_OUT_OF_RANGE;
                    return (
                      <td
                        key={param}
                        className={`${invalid ? "invalid" : ""} ${edited.has(key) ? "edited" : ""}`}
                        onMouseDown={() => setActive(key)}
                      >
                        {active === key ? (
                          <input
                            autoFocus type="number" defaultValue={(row[param] as number | null) ?? ""}
                            min={CSV_GH_PARAM_BOUNDS[param].min} max={CSV_GH_PARAM_BOUNDS[param].max}
                            onBlur={(event) => update(index, param, event.currentTarget.value)}
                            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                          />
                        ) : text}
                      </td>
                    );
                  })}
                  <td onMouseDown={() => setActive(`${index}:Quantity`)}>
                    {active === `${index}:Quantity` ? (
                      <input
                        autoFocus type="number" min={1} defaultValue={(row.Quantity as number) ?? 1}
                        onBlur={(event) => update(index, "Quantity", event.currentTarget.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                      />
                    ) : String(row.Quantity ?? 1)}
                  </td>
                  <td><button className="boxouts-delete" type="button" aria-label="Delete row" onClick={() => {
                    if ((props.quantities[index] ?? 1) > 1) setPendingDelete(index);
                    else props.onDelete(index);
                  }}>×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pendingDelete != null && (
        <div className="boxouts-dialog-backdrop">
          <div className="boxouts-dialog">
            <p>This deletes all same-size boxes. Change the quantity to remove a specific count. Proceed?</p>
            <div><button type="button" onClick={() => { props.onDelete(pendingDelete); setPendingDelete(null); }}>Yes</button>
              <button type="button" onClick={() => setPendingDelete(null)}>Discard</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
