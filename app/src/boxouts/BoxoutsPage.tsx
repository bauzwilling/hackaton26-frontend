import { useCallback, useState } from "react";
import ExcelJS from "exceljs";
import { ChatPanel } from "./components/ChatPanel";
import { BoxTable } from "./components/BoxTable";
import { ParallelCoordinates } from "./components/ParallelCoordinates";
import { Viewer3D } from "./components/Viewer3D";
import { NestingPanel } from "./components/NestingPanel";
import { NestingCurvePreview } from "./components/NestingCurvePreview";
import type { ChatMessage, InputLists, SolveState } from "./types";
import { analyzeCsv, analyzeImage, parseBoxCommand } from "./lib/compute.js";
import {
  appendVariations,
  coerceParamValue,
  collectOutOfRangeMessages,
  CSV_GH_INPUT_NAMES,
  CSV_PARSE_SOURCE,
  CSV_PARSE_SOURCE_LABELS,
  formatDefaultBoxName,
  mergeAnalyzeWithLocalParse,
  normalizeVariationPayload,
  parseLenientLocalCsv,
  spliceBoxRow,
  summarizeVariationRows,
  tryParseCleanCsv,
} from "./lib/csv.js";
import { createSolveState } from "./lib/solveState.js";
import "./boxouts.css";
import "./boxouts-react.css";

type Normalized = {
  inputLists: InputLists;
  variationNames: string[];
  quantities: number[];
  variationCount: number;
  emptyCellKeys?: Set<string>;
};

type PendingImport = {
  fileName: string;
  normalized: Normalized;
  parseSource: string;
};

function nextMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function csvField(value: unknown) {
  if (value == null || value === "") return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function xlsxToCsv(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Excel file has no sheets");
  const lines: string[] = [];
  sheet.eachRow((row) => {
    const fields: string[] = [];
    for (let column = 1; column <= sheet.actualColumnCount; column++) {
      const cell = row.getCell(column);
      fields.push(csvField(cell.text || cell.value));
    }
    lines.push(fields.join(","));
  });
  return lines.join("\n");
}

async function imageBody(file: File) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
  const lower = file.name.toLowerCase();
  const mediaType = file.type || (lower.endsWith(".png") ? "image/png" : "image/jpeg");
  return { imageBase64: base64, mediaType };
}

export function BoxoutsPage() {
  const [inputLists, setInputLists] = useState<InputLists | null>(null);
  const [sourceLists, setSourceLists] = useState<InputLists | null>(null);
  const [emptyCellKeys, setEmptyCellKeys] = useState(new Set<string>());
  const [names, setNames] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<number[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [solveRequestId, setSolveRequestId] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [solve, setSolve] = useState<SolveState>(() => createSolveState());
  const [nestingPreviewOpen, setNestingPreviewOpen] = useState(false);
  const [sendResultsPhase, setSendResultsPhase] = useState<"confirm" | "sent" | null>(null);

  const count = names.length;
  const nestingPayload = solve.fullSetNesting?.geometryPayload;
  const nestingReady = !solve.isSolving && nestingPayload != null;

  const push = useCallback((message: Omit<ChatMessage, "id">) => {
    setMessages((current) => [...current, { id: nextMessageId(), ...message }]);
  }, []);

  const onSolveState = useCallback((state: SolveState) => {
    setSolve({
      ...createSolveState(),
      ...state,
      rowErrors: new Map(state.rowErrors),
      warnings: [...(state.warnings ?? [])],
      variationStatuses: [...(state.variationStatuses ?? [])],
      sentParamNames: [...(state.sentParamNames ?? [])],
      computeProgress: { ...state.computeProgress },
      perBoxNesting: { ...state.perBoxNesting },
      fullSetNesting: { ...state.fullSetNesting },
    });
  }, []);

  function clearTable() {
    setInputLists(null);
    setSourceLists(null);
    setEmptyCellKeys(new Set());
    setNames([]);
    setQuantities([]);
    setSelectedIndex(0);
    setSolve(createSolveState());
    setNestingPreviewOpen(false);
    setSendResultsPhase(null);
  }

  function applyPayload(raw: Normalized, parseSource: string, mode: "replace" | "append" | "overwrite") {
    const previousCount = count;
    const isAppend = mode === "append";
    const merged = normalizeVariationPayload(
      isAppend ? appendVariations(inputLists, names, raw, quantities) : raw,
    ) as Normalized;
    const nextEmpty = raw.emptyCellKeys ?? new Set<string>();
    if (isAppend) {
      const combined = new Set(emptyCellKeys);
      for (const key of nextEmpty) {
        const [index, param] = key.split(":");
        combined.add(`${Number(index) + previousCount}:${param}`);
      }
      setEmptyCellKeys(combined);
    } else {
      setEmptyCellKeys(new Set(nextEmpty));
      setSelectedIndex(0);
    }
    setInputLists(merged.inputLists);
    setSourceLists({
      BoxDepth: [...merged.inputLists.BoxDepth],
      BoxHeight: [...merged.inputLists.BoxHeight],
      BoxWidth: [...merged.inputLists.BoxWidth],
    });
    setNames(merged.variationNames);
    setQuantities(merged.quantities);
    setSolveRequestId((id) => id + 1);
    const start = isAppend ? previousCount : 0;
    return {
      addedCount: isAppend ? merged.variationCount - previousCount : merged.variationCount,
      isAppend,
      sourceLabel: CSV_PARSE_SOURCE_LABELS[parseSource] ?? "Parsed",
      summary: summarizeVariationRows(merged.inputLists, merged.variationNames, start, merged.quantities).join("\n") || "No boxes parsed.",
      warnings: collectOutOfRangeMessages(merged.inputLists, merged.variationNames, start),
    };
  }

  function withWarnings(summary: string, warnings: string[]) {
    return warnings.length ? `${summary}\n\nOut of range:\n${warnings.join("\n")}` : summary;
  }

  async function parseFile(file: File): Promise<{ normalized: Normalized; parseSource: string }> {
    if (/\.(jpe?g|png)$/i.test(file.name)) {
      // WAITING MODEL: our structuring model should extract dimensions from inspector facts
      const result = await analyzeImage(await imageBody(file));
      return { normalized: normalizeVariationPayload(result) as Normalized, parseSource: CSV_PARSE_SOURCE.llm };
    }
    const text = file.name.toLowerCase().endsWith(".xlsx")
      ? await xlsxToCsv(await file.arrayBuffer())
      : await file.text();
    const assessment = tryParseCleanCsv(text);
    if (!assessment.needsAi) {
      return { normalized: assessment as Normalized, parseSource: CSV_PARSE_SOURCE.local };
    }
    const local = parseLenientLocalCsv(text);
    // WAITING MODEL: our structuring model should normalize ambiguous file content from inspector facts
    const normalized = mergeAnalyzeWithLocalParse(local, await analyzeCsv(text));
    return { normalized, parseSource: CSV_PARSE_SOURCE.llm };
  }

  async function processFile(file: File) {
    push({ role: "user", kind: "file", content: file.name });
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      if (count > 0) {
        setPendingImport({ fileName: file.name, ...parsed });
        push({
          role: "assistant",
          kind: "confirm",
          content: `You have ${count} box(es). Append ${parsed.normalized.variationCount} from "${file.name}" or overwrite?`,
          meta: { choices: ["append", "overwrite", "cancel"] },
        });
      } else {
        const result = applyPayload(parsed.normalized, parsed.parseSource, "replace");
        push({ role: "assistant", kind: result.warnings.length ? "error" : "result", content: withWarnings(`Parsed ${result.addedCount} box(es). ${result.sourceLabel}.\n${result.summary}`, result.warnings) });
      }
    } catch (error) {
      push({ role: "assistant", kind: "error", content: error instanceof Error ? error.message : "Invalid file" });
    } finally {
      setBusy(false);
    }
  }

  function finishImport(choice: string) {
    if (!pendingImport) return;
    setPendingImport(null);
    if (choice === "cancel") {
      push({ role: "assistant", kind: "result", content: "Import cancelled." });
      return;
    }
    const result = applyPayload(pendingImport.normalized, pendingImport.parseSource, choice === "append" ? "append" : "overwrite");
    const label = choice === "append" ? "Added" : "Replaced with";
    push({ role: "assistant", kind: result.warnings.length ? "error" : "result", content: withWarnings(`${label} ${result.addedCount} box(es). ${result.sourceLabel}.\n${result.summary}`, result.warnings) });
  }

  function removeRow(index: number) {
    if (!inputLists || index < 0 || index >= count) return;
    const sliced = spliceBoxRow(inputLists, names, index, quantities);
    const merged = normalizeVariationPayload(sliced) as Normalized;
    if (!merged.variationCount) {
      clearTable();
      return;
    }
    const nextEmpty = new Set<string>();
    for (const key of emptyCellKeys) {
      const [rawIndex, param] = key.split(":");
      const row = Number(rawIndex);
      if (row !== index) nextEmpty.add(row > index ? `${row - 1}:${param}` : key);
    }
    setInputLists(merged.inputLists);
    setSourceLists({
      BoxDepth: [...merged.inputLists.BoxDepth],
      BoxHeight: [...merged.inputLists.BoxHeight],
      BoxWidth: [...merged.inputLists.BoxWidth],
    });
    setNames(merged.variationNames);
    setQuantities(merged.quantities);
    setEmptyCellKeys(nextEmpty);
    setSelectedIndex((current) => Math.min(current, merged.variationCount - 1));
    setSolveRequestId((id) => id + 1);
  }

  async function processText(text: string) {
    push({ role: "user", kind: "text", content: text });
    const choice = text.trim().toLowerCase();
    if (pendingImport && ["append", "overwrite", "cancel"].includes(choice)) {
      finishImport(choice);
      return;
    }
    setBusy(true);
    try {
      const existing = inputLists
        ? Array.from({ length: count }, (_, index) => ({
            boxNumber: index + 1,
            name: names[index]?.trim() || formatDefaultBoxName(index),
            BoxWidth: inputLists.BoxWidth[index],
            BoxHeight: inputLists.BoxHeight[index],
            BoxDepth: inputLists.BoxDepth[index],
          }))
        : [];
      // WAITING MODEL: our structuring model should parse BoxOut add/update/delete/clear actions
      const command = await parseBoxCommand(text, existing);
      if (command.action === "add") {
        if (!command.add?.variationCount) throw new Error("No box dimensions could be parsed.");
        const result = applyPayload(command.add, CSV_PARSE_SOURCE.llm, count ? "append" : "replace");
        push({ role: "assistant", kind: result.warnings.length ? "error" : "result", content: withWarnings(`${result.isAppend ? "Added" : "Created"} ${result.addedCount} box(es). ${result.sourceLabel}.\n${result.summary}`, result.warnings) });
      } else if (command.action === "update") {
        if (!inputLists) throw new Error("No boxes to update.");
        const lists: InputLists = { BoxDepth: [...inputLists.BoxDepth], BoxHeight: [...inputLists.BoxHeight], BoxWidth: [...inputLists.BoxWidth] };
        for (const number of command.boxNumbers ?? []) {
          const index = number - 1;
          if (index < 0 || index >= count) continue;
          for (const param of CSV_GH_INPUT_NAMES) {
            const delta = coerceParamValue(command.fieldDeltas?.[param]);
            const value = coerceParamValue(command.fields?.[param]);
            if (delta != null) lists[param as keyof InputLists][index] = (lists[param as keyof InputLists][index] ?? 0) + delta;
            else if (value != null) lists[param as keyof InputLists][index] = value;
          }
        }
        const merged = normalizeVariationPayload({ inputLists: lists, variationNames: names, quantities }) as Normalized;
        setInputLists(merged.inputLists); setNames(merged.variationNames); setQuantities(merged.quantities);
        setSolveRequestId((id) => id + 1);
        const warnings = collectOutOfRangeMessages(merged.inputLists, merged.variationNames);
        push({ role: "assistant", kind: warnings.length ? "error" : "result", content: withWarnings(`Updated ${command.boxNumbers?.length ?? 0} box(es).\n${summarizeVariationRows(merged.inputLists, merged.variationNames, 0, merged.quantities).join("\n")}`, warnings) });
      } else if (command.action === "delete") {
        const index = command.boxNumber - 1;
        if (index < 0 || index >= count) throw new Error(`Box ${command.boxNumber} not found.`);
        removeRow(index);
        push({ role: "assistant", kind: "result", content: count === 1 ? `Deleted Box ${command.boxNumber}. No boxes remaining.` : `Deleted Box ${command.boxNumber}. ${count - 1} box(es) remaining.` });
      } else if (command.action === "clear") {
        clearTable();
        push({ role: "assistant", kind: "result", content: "Cleared all boxes." });
      } else {
        throw new Error("Could not understand that command.");
      }
    } catch (error) {
      push({ role: "assistant", kind: "error", content: error instanceof Error ? error.message : "Could not process message" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="boxouts-app">
      <ChatPanel
        messages={messages} busy={busy} awaitingConfirm={pendingImport != null} hasBoxes={count > 0}
        onSendText={(text) => void processText(text)} onAttachFile={(file) => void processFile(file)}
        onAttachError={(content) => push({ role: "assistant", kind: "error", content })}
        onConfirmChoice={finishImport}
        onClearAll={() => { clearTable(); push({ role: "assistant", kind: "result", content: "Cleared all boxes." }); }}
      />
      <div className="boxouts-main">
        <div className={`boxouts-center ${nestingPreviewOpen ? "boxouts-center--preview" : ""}`}>
          <div className="boxouts-plot-slot"><ParallelCoordinates inputLists={inputLists} selectedIndex={selectedIndex} onSelect={setSelectedIndex} /></div>
          <BoxTable
            inputLists={inputLists} sourceLists={sourceLists} emptyCellKeys={emptyCellKeys}
            names={names} quantities={quantities} selectedIndex={selectedIndex} solve={solve}
            onSelect={setSelectedIndex}
            onApply={(lists, nextQuantities) => {
              const merged = normalizeVariationPayload({ inputLists: lists, variationNames: names, quantities: nextQuantities }) as Normalized;
              setInputLists(merged.inputLists); setNames(merged.variationNames); setQuantities(merged.quantities);
              setSolveRequestId((id) => id + 1);
            }}
            onDelete={removeRow}
          />
          {nestingPreviewOpen && nestingPayload != null && <NestingCurvePreview payload={nestingPayload} />}
          <NestingPanel
            perBox={solve.perBoxNesting} fullSet={solve.fullSetNesting} solving={solve.isSolving}
            previewDisabled={!nestingReady} onToggle={() => setNestingPreviewOpen((open) => !open)}
            onSend={() => setSendResultsPhase("confirm")}
          />
        </div>
        <Viewer3D
          inputLists={inputLists} names={names} quantities={quantities}
          selectedIndex={selectedIndex} solveRequestId={solveRequestId} onSolveState={onSolveState}
        />
      </div>
      {sendResultsPhase && (
        <div className="boxouts-dialog-backdrop" onClick={() => { if (sendResultsPhase === "sent") setSendResultsPhase(null); }}>
          <div className="boxouts-dialog" onClick={(event) => event.stopPropagation()}>
            {sendResultsPhase === "confirm" ? <>
              <p>Send data to production?</p>
              <div><button type="button" onClick={() => setSendResultsPhase("sent")}>Yes</button>
                <button type="button" onClick={() => setSendResultsPhase(null)}>Go back to editing</button></div>
            </> : <p>Data sent</p>}
          </div>
        </div>
      )}
    </div>
  );
}
