import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import InputRequirementsBubble from './InputRequirementsBubble'
import type { ChatMessage, MaterialOption, Point2 } from '../types'

interface SheetChoice extends Point2 { sheetThickness: number }
interface ChatPanelProps {
  messages?: ChatMessage[]
  busy?: boolean
  busyMessage?: string
  awaitingConfirm?: boolean
  activeTextPositionSelectId?: string | null
  activeSheetSizeSelectId?: string | null
  activeSheetSizeConfirmId?: string | null
  activeMaterialSelectId?: string | null
  activeMaterialConfirmId?: string | null
  activeConfirmId?: string | null
  materials?: MaterialOption[]
  activeExportAssociatedMessageId?: string | null
  hasBoxes?: boolean
  canStartNesting?: boolean
  canStopNesting?: boolean
  nestRevealPaused?: string | null
  canStartLeftoverNesting?: boolean
  nestingButtonPrompt?: string
  leftoverNestingButtonPrompt?: string
  nestingNeedsRerun?: boolean
  inputRequirementsOpenTick?: number
  onSendText?: (text: string) => void
  onAttachFile?: (file: File) => void
  onAttachError?: (message: string) => void
  onConfirmChoice?: (choice: { choice: string; messageId: string }) => void
  onExportAssociated?: () => void
  onTextPositionChoice?: (choice: string) => void
  onSheetSizeChoice?: (choice: { sheetX: number; sheetY: number; sheetThickness: number }) => void
  onModifySheetSize?: (choice: { promptMessageId: string }) => void
  onMaterialChoice?: (material: MaterialOption) => void
  onModifyMaterial?: (choice: { promptMessageId: string }) => void
  onClearAll?: () => void
  onStartNesting?: () => void
  onStopNesting?: () => void
  onShowNestingResult?: () => void
}

interface ChatBlock {
  key: string
  type: 'process' | 'standalone' | 'nest-cta'
  processKind?: string
  processId?: string
  superseded?: boolean
  label?: string
  messages: ChatMessage[]
  showNestCta: boolean
}

const IMPORT_FILE_EXTENSIONS = ['.dxf', '.3dm', '.dwg']
const TEXT_POSITION_OPTIONS = [
  { value: 'inside', label: 'Inside — text inside the part boundary' },
  { value: 'outside', label: 'Outside — text closest to the part boundary' },
]

// WAITING MODEL: the structuring model should provide assistant wording and choices.
function processPanelLabel(kind?: string) {
  if (kind === 'leftover') return 'Unassigned parts'
  if (kind === 'fullset') return 'Full set'
  return 'Initial nesting'
}

function parsePositive(value: string) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function bubbleClass(message: ChatMessage) {
  return [
    message.role === 'user' ? 'bubble-user' : 'bubble-assistant',
    message.kind === 'error' ? 'bubble-error' : '',
    message.kind === 'warning' ? 'bubble-warning' : '',
    message.kind === 'result' || message.kind === 'nesting-result' ? 'bubble-result' : '',
    message.kind === 'thinking' ? 'bubble-thinking' : '',
    message.kind === 'confirm' ? 'bubble-confirm' : '',
    message.kind === 'sheet-size-select' ? 'bubble-sheet-size-select' : '',
    message.kind === 'material-select' ? 'bubble-material-select' : '',
    message.meta?.sheetSizeConfirm ? 'bubble-sheet-size-confirm' : '',
    message.meta?.materialConfirm ? 'bubble-material-confirm' : '',
    message.meta?.superseded ? 'bubble-superseded' : '',
  ].filter(Boolean).join(' ')
}

export default function ChatPanelComponent({
  messages = [],
  busy = false,
  busyMessage = '',
  activeTextPositionSelectId = null,
  activeSheetSizeSelectId = null,
  activeSheetSizeConfirmId = null,
  activeMaterialSelectId = null,
  activeMaterialConfirmId = null,
  activeConfirmId = null,
  materials = [],
  activeExportAssociatedMessageId = null,
  hasBoxes = false,
  canStartNesting = false,
  canStopNesting = false,
  nestRevealPaused = null,
  canStartLeftoverNesting = false,
  nestingButtonPrompt = 'File ready — run nesting to flatten and nest parts.',
  leftoverNestingButtonPrompt = 'Unassigned parts ready — run nesting to place them on the sheet.',
  nestingNeedsRerun = false,
  inputRequirementsOpenTick = 0,
  onSendText,
  onAttachFile,
  onAttachError,
  onConfirmChoice,
  onExportAssociated,
  onTextPositionChoice,
  onSheetSizeChoice,
  onModifySheetSize,
  onMaterialChoice,
  onModifyMaterial,
  onClearAll,
  onStartNesting,
  onStopNesting,
  onShowNestingResult,
}: ChatPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [dragging, setDragging] = useState(false)
  const [textPositions, setTextPositions] = useState<Record<string, string>>({})
  const [sheetDrafts, setSheetDrafts] = useState<Record<string, { sheetX: string; sheetY: string; sheetThickness: string }>>({})
  const [materialDrafts, setMaterialDrafts] = useState<Record<string, string>>({})
  const [expandedProcesses, setExpandedProcesses] = useState<Record<string, boolean>>({})
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({})

  const showNestCta = canStartNesting && nestRevealPaused !== 'initial' && !activeSheetSizeSelectId && !activeMaterialSelectId
  const showLeftoverCta = canStartLeftoverNesting && nestRevealPaused !== 'leftover' && !activeSheetSizeSelectId && !activeMaterialSelectId
  const blocks = useMemo(() => {
    const result: ChatBlock[] = []
    let current: ChatBlock | null = null
    for (const message of messages) {
      const processId = message.meta?.processId as string | undefined
      const processKind = message.meta?.processKind as string | undefined
      if (processId && processKind) {
        const superseded = processKind !== 'initial' && Boolean(message.meta?.superseded)
        if (current?.type === 'process' && current.processId === processId) {
          current.messages.push(message)
          current.superseded ||= superseded
        } else {
          current = { key: `process-${processId}`, type: 'process', processId, processKind, superseded, label: processPanelLabel(processKind), messages: [message], showNestCta: false }
          result.push(current)
        }
      } else {
        current = null
        result.push({ key: `msg-${message.id}`, type: 'standalone', messages: [message], showNestCta: false })
      }
    }
    const addCta = (kind: string, show: boolean) => {
      if (!show) return
      const existing = [...result].reverse().find((block) => block.type === 'process' && block.processKind === kind && !block.superseded)
      if (existing) existing.showNestCta = true
      else result.push({ key: `${kind}-nest-cta`, type: 'nest-cta', messages: [], showNestCta: true, processKind: kind })
    }
    addCta('initial', showNestCta)
    addCta('leftover', showLeftoverCta)
    return result
  }, [messages, showLeftoverCta, showNestCta])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [blocks, busy, busyMessage])
  useEffect(() => {
    if (!activeSheetSizeSelectId) return
    const message = messages.find((item) => item.id === activeSheetSizeSelectId)
    if (!message) return
    setSheetDrafts((current) => ({ ...current, [message.id]: {
      sheetX: message.meta?.sheetX == null ? '' : String(message.meta.sheetX),
      sheetY: message.meta?.sheetY == null ? '' : String(message.meta.sheetY),
      sheetThickness: message.meta?.sheetThickness == null ? '' : String(message.meta.sheetThickness),
    } }))
  }, [activeSheetSizeSelectId, messages])

  const forwardFile = (file: File) => {
    if (!IMPORT_FILE_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
      onAttachError?.('Unsupported file type. Please upload a .dxf, .3dm, or .dwg file.')
      return
    }
    onAttachFile?.(file)
  }
  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const value = draft.trim()
    if (!value || busy) return
    onSendText?.(value)
    setDraft('')
  }
  const nestingSummary = (message: ChatMessage) => {
    const nested = message.meta?.nestedCount
    const unassigned = message.meta?.unassignedCount
    if (message.meta?.leftoverComplete && typeof nested === 'number' && typeof message.meta.previouslyUnassignedCount === 'number') {
      return `Nesting complete — ${nested} nested + ${message.meta.previouslyUnassignedCount} previously unassigned ${message.meta.previouslyUnassignedCount === 1 ? 'part' : 'parts'} nested`
    }
    if (typeof nested === 'number' && typeof unassigned === 'number') return unassigned ? `Nesting complete — ${nested} nested, ${unassigned} not nested.` : `Nesting complete — ${nested} part${nested === 1 ? '' : 's'}.`
    return message.content
  }
  const sheetOptions = (message: ChatMessage) => (Array.isArray(message.meta?.allowedSizesMm) ? message.meta.allowedSizesMm : []) as Point2[]
  const thicknessOptions = (message: ChatMessage) => (Array.isArray(message.meta?.allowedThicknessesMm) ? message.meta.allowedThicknessesMm : []) as number[]

  const renderMessageContent = (message: ChatMessage) => {
    if (message.kind === 'thinking') {
      const collapsed = Boolean(message.meta?.collapsed)
      const expanded = expandedThinking[message.id] ?? Boolean(message.meta?.expanded)
      return <>
        {collapsed && <button type="button" className="thinking-summary" onClick={() => setExpandedThinking((current) => ({ ...current, [message.id]: !expanded }))}>{String(message.meta?.summary || (message.meta?.interrupted ? 'Stopped' : 'Thought for a moment'))} <span aria-hidden="true">{expanded ? '▾' : '▸'}</span></button>}
        {(!collapsed || expanded) && <span className="thinking-stream">{message.content}</span>}
        {!collapsed && canStopNesting && <button type="button" className="btn-thinking-action" onClick={onStopNesting}>Stop Processing</button>}
        {message.meta?.interrupted && nestRevealPaused === message.meta?.processKind && <button type="button" className="btn-thinking-action" disabled={busy} onClick={onStartNesting}>Resume process</button>}
      </>
    }
    if (message.kind === 'result' && message.meta?.legend) {
      const legend = message.meta.legend as {
        materials?: { label: string; color: string; count: number }[]
        red?: number
      }
      return <>
        {message.content}<br /><br />
        {(legend.materials ?? []).map((material) => (
          <span key={material.label}>
            - <span className={`legend-part-${material.color}`}>{material.label}</span>: {material.count} {material.count === 1 ? 'curve' : 'curves'}<br />
          </span>
        ))}
        {Boolean(legend.red) && (
          <span>- <span className="legend-part-red">Missing/Faulty metadata</span> ({legend.red})<br /></span>
        )}
      </>
    }
    if (message.kind === 'nesting-result') return <><span className="nesting-result-summary">{nestingSummary(message)}</span>{Number(message.meta?.unassignedCount) > 0 && !message.meta?.leftoverComplete && <div className="nesting-unassigned-details">{message.meta?.unassignedIdsText && <span className="nesting-unassigned-ids">{String(message.meta.unassignedIdsText)}</span>}{(message.meta?.unassignedReasons as string[] | undefined)?.map((reason, index) => <span key={`${reason}:${index}`} className="nesting-unassigned-reason">{reason}</span>)}<span className="nesting-unassigned-hint">Unassigned parts will now show <span className="legend-part-red">red</span> in app viewer.</span></div>}</>
    if (message.meta?.greenHint) return <>Use Output view with <strong>Correct parts</strong> / <strong>Incorrect parts</strong> to see metadata status (<span className="legend-part-green">green</span> = complete, <span className="legend-part-red">red</span> = missing).</>
    if (message.meta?.missingSerialCount != null) return <><span className="legend-part-red">{String(message.meta.missingSerialCount)} {message.meta.missingSerialCount === 1 ? 'element is' : 'elements are'}</span> missing name (Name).</>
    if (message.meta?.missingMaterialCount != null) return <><span className="legend-part-red">{String(message.meta.missingMaterialCount)} {message.meta.missingMaterialCount === 1 ? 'element is' : 'elements are'}</span> missing material (Material).</>
    if (message.meta?.missingAnzCount != null) return <><span className="legend-part-red">{String(message.meta.missingAnzCount)} {message.meta.missingAnzCount === 1 ? 'element is' : 'elements are'}</span> missing quantity (Amount).</>
    if (message.meta?.inspectUnsolvedCount != null) return <>
      Assigned metadata to {String(message.meta.inspectSolvedCount)} {message.meta.inspectSolvedCount === 1 ? 'part' : 'parts'}.
      {message.meta.inspectUnsolvedCount > 0 && <> <span className="legend-part-red">{String(message.meta.inspectUnsolvedCount)} {message.meta.inspectUnsolvedCount === 1 ? 'part still has' : 'parts still have'}</span> missing metadata.</>}
    </>
    return message.content
  }

  const renderActions = (message: ChatMessage) => {
    if (message.kind === 'text-position-select' && message.id === activeTextPositionSelectId) {
      const value = textPositions[message.id] ?? String(message.meta?.selectedPosition ?? 'inside')
      return <div className="text-position-select-actions"><select className="text-position-select" value={value} onChange={(event) => setTextPositions((current) => ({ ...current, [message.id]: event.target.value }))}>{TEXT_POSITION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" onClick={() => onTextPositionChoice?.(value)}>Continue</button></div>
    }
    if (message.kind === 'sheet-size-select' && message.id === activeSheetSizeSelectId) {
      const current = sheetDrafts[message.id] ?? { sheetX: '', sheetY: '', sheetThickness: '' }
      const update = (change: Partial<typeof current>) => setSheetDrafts((all) => ({ ...all, [message.id]: { ...current, ...change } }))
      const choice: SheetChoice = { x: parsePositive(current.sheetX) ?? 0, y: parsePositive(current.sheetY) ?? 0, sheetThickness: parsePositive(current.sheetThickness) ?? 0 }
      const valid = choice.x > 0 && choice.y > 0 && choice.sheetThickness > 0
      return <div className="sheet-size-select-actions">
        <select className="sheet-size-input" value={`${current.sheetX}x${current.sheetY}`} aria-label="Sheet format in millimeters" onChange={(event) => { const [sheetX, sheetY] = event.target.value.split('x'); update({ sheetX, sheetY }) }}>{sheetOptions(message).map((size) => <option key={`${size.x}x${size.y}`} value={`${size.x}x${size.y}`}>{size.x} × {size.y} mm</option>)}</select>
        <select className="sheet-size-input" value={current.sheetThickness} aria-label="Sheet thickness in millimeters" onChange={(event) => update({ sheetThickness: event.target.value })}>{thicknessOptions(message).map((thickness) => <option key={thickness} value={thickness}>{thickness} mm</option>)}</select>
        <button type="button" disabled={!valid} onClick={() => valid && onSheetSizeChoice?.({ sheetX: choice.x, sheetY: choice.y, sheetThickness: choice.sheetThickness })}>Confirm</button>
      </div>
    }
    if (message.kind === 'material-select' && message.id === activeMaterialSelectId) {
      const id = materialDrafts[message.id] ?? String(message.meta?.materialId ?? '')
      const material = materials.find((item) => item.id === id)
      return <div className="sheet-size-select-actions"><select className="material-select" value={id} aria-label="Material" onChange={(event) => setMaterialDrafts((current) => ({ ...current, [message.id]: event.target.value }))}><option value="" disabled>Select material…</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.allowedThicknessesMm.join(', ')} mm)</option>)}</select><button type="button" disabled={!material} onClick={() => material && onMaterialChoice?.(material)}>Confirm</button></div>
    }
    if (message.kind === 'confirm' && message.id === activeConfirmId && Array.isArray(message.meta?.choices)) return <div className="confirm-actions">{(message.meta.choices as string[]).map((choice) => <button key={choice} type="button" onClick={() => onConfirmChoice?.({ choice, messageId: message.id })}>{choice}</button>)}</div>
    if (message.kind === 'nesting-result') return <div className="nesting-result-actions"><button type="button" className="btn-show-nesting-result" onClick={onShowNestingResult}>{message.meta?.leftoverComplete ? 'Show full nesting result' : 'Show nesting result'}</button></div>
    if (message.meta?.showExportAssociated && message.id === activeExportAssociatedMessageId) return <div className="confirm-actions"><button type="button" disabled={busy} onClick={onExportAssociated}>Export associated parts</button></div>
    return null
  }

  return (
    <section
      className={`chat-panel${dragging ? ' chat-panel--dragging' : ''}${busy ? ' chat-panel--busy' : ''}`}
      aria-busy={busy}
      onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event: DragEvent) => {
        event.preventDefault()
        setDragging(false)
        if (busy || !event.dataTransfer.files.length) return
        if (event.dataTransfer.files.length > 1) onAttachError?.('Please drag and drop only one file at a time.')
        else forwardFile(event.dataTransfer.files[0])
      }}
    >
      <div ref={listRef} className="message-list" role="log" aria-live="polite">
        <div className="requirements-slot"><InputRequirementsBubble openTick={inputRequirementsOpenTick} /></div>
        {messages.length === 0 && <p className="empty-hint">Upload a DXF, DWG, or 3dm file or drag and drop it here to start processing.</p>}
        {blocks.map((block) => {
          const collapsed = Boolean(block.superseded && block.processId && !expandedProcesses[block.processId])
          return <div key={block.key} className={`chat-block${block.type === 'process' ? ' nest-process-panel' : ''}${block.superseded ? ' nest-process-panel--superseded' : ''}`}>
            {block.type === 'process' && (block.superseded ? <button type="button" className="nest-process-panel__header nest-process-panel__header--toggle" aria-expanded={!collapsed} onClick={() => block.processId && setExpandedProcesses((current) => ({ ...current, [block.processId!]: !current[block.processId!] }))}><span className="nest-process-panel__title">{block.label}</span><span aria-hidden="true">{collapsed ? '▸' : '▾'}</span></button> : <div className="nest-process-panel__header">{block.label}</div>)}
            {!collapsed && block.messages.map((message) => <article key={message.id} className={`message message-${message.role}`}><div className={`bubble ${bubbleClass(message)}`}><p className="bubble-text">{renderMessageContent(message)}</p>{message.meta?.sheetSizeConfirm && message.id === activeSheetSizeConfirmId && !message.meta.superseded && <button type="button" className="btn-sheet-size-modify" onClick={() => message.meta?.promptMessageId && onModifySheetSize?.({ promptMessageId: String(message.meta.promptMessageId) })}>Modify</button>}{message.meta?.materialConfirm && message.id === activeMaterialConfirmId && <button type="button" className="btn-sheet-size-modify" onClick={() => message.meta?.promptMessageId && onModifyMaterial?.({ promptMessageId: String(message.meta.promptMessageId) })}>Modify</button>}{renderActions(message)}</div></article>)}
            {!collapsed && block.showNestCta && <article className="message message-assistant"><div className={`bubble bubble-nesting${nestingNeedsRerun && block.processKind !== 'leftover' ? ' bubble-nesting--modified' : ''}`}><p className="bubble-text">{block.processKind === 'leftover' ? leftoverNestingButtonPrompt : nestingButtonPrompt}</p><button type="button" className="btn-nesting" disabled={busy} onClick={onStartNesting}>Nest</button></div></article>}
          </div>
        })}
        {busy && !messages.some((message) => message.kind === 'thinking' && !message.meta?.collapsed) && <p className="typing-indicator">{busyMessage || 'Working…'}</p>}
      </div>
      {dragging && <div className="drop-overlay" aria-hidden="true">Drop file</div>}
      <form className="composer" onSubmit={send}>
        <input ref={fileRef} type="file" className="file-input" accept=".dxf,.3dm,.dwg" tabIndex={-1} onChange={(event) => { const file = event.target.files?.[0]; if (file) forwardFile(file); event.target.value = '' }} />
        <textarea value={draft} className="composer-input" rows={2} placeholder="…" aria-label="Chat message" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} />
        <div className="composer-actions"><button type="button" className="btn-clear" disabled={!hasBoxes || busy} onClick={onClearAll}>Clear</button><button type="button" className="btn-attach" title="DXF file" disabled={busy} onClick={() => fileRef.current?.click()}>Attach file</button><button type="submit" className="btn-send" disabled={!draft.trim() || busy}>Send</button></div>
      </form>
    </section>
  )
}
