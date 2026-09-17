import { FIELD_LABELS } from './createAppState.js'
import { reportAppChatReply } from '../../../lib/appChat'

export function safeFilename(name) {
  const n = String(name ?? '').replace(/\s+/g, '').trim().replace(/[\\/:*?"<>|]/g, '_')
  return n || 'UNNAMED'
}

function materialOptions(state) {
  return (Array.isArray(state.materials?.value) ? state.materials.value : []).map((item) => ({
    id: item.id,
    label: item.label,
    allowedThicknessesMm: [...(item.allowedThicknessesMm ?? [])],
    allowedSizesMm: (item.allowedSizesMm ?? []).map((size) => ({ x: size.x, y: size.y })),
  }))
}

function buildAppChatPrompt(messageId, kind, content, meta, state) {
  const base = { messageId, kind, content: String(content ?? '') }
  if (kind === 'material-select') {
    return {
      ...base,
      materials: materialOptions(state),
    }
  }
  if (kind === 'sheet-size-select') {
    return {
      ...base,
      allowedSizesMm: Array.isArray(meta?.allowedSizesMm)
        ? meta.allowedSizesMm.map((size) => ({ x: size.x, y: size.y }))
        : [],
      allowedThicknessesMm: Array.isArray(meta?.allowedThicknessesMm)
        ? [...meta.allowedThicknessesMm]
        : [],
      sheetX: meta?.sheetX ?? null,
      sheetY: meta?.sheetY ?? null,
      sheetThickness: meta?.sheetThickness ?? null,
    }
  }
  if (kind === 'confirm' && Array.isArray(meta?.choices)) {
    return { ...base, choices: meta.choices.map((choice) => String(choice)) }
  }
  if (kind === 'nesting-result') {
    return {
      ...base,
      leftoverComplete: Boolean(meta?.leftoverComplete),
    }
  }
  if (kind === 'warning' || kind === 'error' || kind === 'result' || kind === 'text') {
    return base
  }
  return base
}

export function createMessaging(state) {
  function pushMessage(role, kind, content, meta) {
    const id = crypto.randomUUID()
    state.messages.value.push({ id, role, kind, content, meta })
    const nodeId = state.studioNodeId?.value
    if (
      role === 'assistant'
      && typeof content === 'string'
      && content.trim()
      && kind !== 'thinking'
      && kind !== 'file'
    ) {
      const prompt = buildAppChatPrompt(id, kind, content, meta, state)
      const relay = state.relayToConcierge?.value
      // WAITING BFF: SuggestedAction / streamed tool UI owns interactive prompts
      if (typeof relay === 'function') {
        relay(content, prompt)
      } else if (nodeId) {
        reportAppChatReply(nodeId, content, prompt)
      }
    }
    return id
  }

  return { pushMessage, FIELD_LABELS }
}

/** Relay a Nest CTA that is not stored as a chat message (legacy in-app button). */
export function reportNestCta(state, {
  leftover = false,
  content = null,
  nestingNeedsRerun = false,
} = {}) {
  const text = String(content ?? (leftover
    ? 'Unassigned parts ready — run nesting to place them on the sheet.'
    : 'File ready — run nesting to flatten and nest parts.')).trim()
  if (!text) return
  const messageId = `nest-cta-${leftover ? 'leftover' : 'initial'}-${Date.now().toString(36)}`
  const prompt = {
    messageId,
    kind: 'nest-cta',
    content: text,
    nestingNeedsRerun: Boolean(nestingNeedsRerun),
  }
  const relay = state.relayToConcierge?.value
  // WAITING BFF: SuggestedAction accept replaces Nest CTA relay
  if (typeof relay === 'function') {
    relay(text, prompt)
  } else if (state.studioNodeId?.value) {
    reportAppChatReply(state.studioNodeId.value, text, prompt)
  }
}
