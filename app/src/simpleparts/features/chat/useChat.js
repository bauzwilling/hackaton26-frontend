import {
  applyMetadataByPartKey,
  effectivePartMeta,
  listKnownPartNrs,
  partsSnapshotFromRegistry,
  resolvePartByNr,
} from '../metadata/partRegistry.js'
import { partsApi } from '../../api.js'

export function useChat(state, { pushMessage, FIELD_LABELS, showPartByNr, onMetadataModified, markModifiedPart, getPartRegistry }) {
  function registry() {
    return getPartRegistry?.() ?? []
  }

  function partsSnapshot() {
    return partsSnapshotFromRegistry(registry(), state.metadataOverrides.value)
  }

  function getDistinctMaterials() {
    return [
      ...new Set(
        registry()
          .map((entry) => effectivePartMeta(entry, state.metadataOverrides.value).mat)
          .filter(Boolean),
      ),
    ]
  }

  async function fetchChatIntent(text) {
    // WAITING BFF: POST /api/chat — Simple Parts Flask stand-in; the UI should call the Platform BFF
    // WAITING MODEL: Claude parses show_part / modify / bulk_modify; our structuring model should own that
    const res = await fetch(partsApi('/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        chatStep: state.step.value,
        parts: partsSnapshot(),
        knownMaterials: getDistinctMaterials(),
      }),
    })
    if (!res.ok) throw new Error('chat request failed')
    return res.json()
  }

  const MATERIAL_LOCKED_MESSAGE =
    'Material can only be set in the nesting material step. Per-part or bulk material changes via chat are not allowed. You can still change Name or Amount.'

  function applyModifications(modifications) {
    if (!modifications?.length) return

    const matMods = modifications.filter((mod) => mod.field === 'mat')
    const otherMods = modifications.filter((mod) => mod.field !== 'mat')

    if (matMods.length && !otherMods.length) {
      pushMessage('assistant', 'text', MATERIAL_LOCKED_MESSAGE)
      return
    }

    if (matMods.length) {
      pushMessage('assistant', 'text', MATERIAL_LOCKED_MESSAGE)
    }

    let overrides = { ...state.metadataOverrides.value }
    let applied = 0

    for (const mod of otherMods) {
      const resolved = resolvePartByNr(registry(), mod.part_nr, overrides)
      if (!resolved || !['nr', 'anz'].includes(mod.field)) continue
      overrides = applyMetadataByPartKey(
        resolved.entry.partKey,
        mod.field,
        mod.value,
        overrides,
      )
      markModifiedPart?.(resolved.entry)
      applied++
      pushMessage('assistant', 'text', `Updated part ${mod.part_nr}: ${FIELD_LABELS[mod.field]} → ${mod.value}.`)
    }

    if (!applied) {
      if (matMods.length) return
      const nrs = listKnownPartNrs(registry(), state.metadataOverrides.value)
      pushMessage(
        'assistant',
        'text',
        `Couldn't find part ${modifications[0].part_nr}. Available: ${nrs.join(', ') || 'none'}.`,
      )
      return
    }

    state.metadataOverrides.value = overrides
    onMetadataModified?.()
  }

  function normalizeMat(value) {
    return String(value ?? '').replace(/\s+/g, '').trim().toLowerCase()
  }

  function partMatchesFilter(entry, filter, overrides) {
    if (!filter?.field) return true
    const meta = effectivePartMeta(entry, overrides)
    const current = filter.field === 'mat' ? meta.mat : meta.anz
    const a = filter.field === 'mat' ? normalizeMat(current) : String(current).trim()
    const b = filter.field === 'mat' ? normalizeMat(filter.value) : String(filter.value).trim()
    return a === b
  }

  function applyBulkModification({ field, value, filter }) {
    if (field === 'mat') {
      pushMessage('assistant', 'text', MATERIAL_LOCKED_MESSAGE)
      return
    }
    if (field !== 'anz' || !value) return

    const reg = registry()
    const overrides = state.metadataOverrides.value
    const targets = reg.filter((entry) => partMatchesFilter(entry, filter, overrides))
    if (!targets.length) {
      pushMessage('assistant', 'text', 'No parts matched that filter.')
      return
    }

    let nextOverrides = { ...overrides }
    for (const entry of targets) {
      nextOverrides = applyMetadataByPartKey(entry.partKey, field, value, nextOverrides)
      markModifiedPart?.(entry)
    }
    state.metadataOverrides.value = nextOverrides

    pushMessage(
      'assistant',
      'text',
      `Updated ${FIELD_LABELS[field]} → ${value} on ${targets.length} parts.`,
    )
    onMetadataModified?.()
  }

  async function onSendText(text) {
    pushMessage('user', 'text', text)
    if (!state.selectedFile.value) return

    state.busy.value = true
    let intent
    try {
      intent = await fetchChatIntent(text)
    } catch {
      state.busy.value = false
      pushMessage('assistant', 'error', 'Could not interpret message.')
      return
    }
    state.busy.value = false

    if (intent.intent === 'show_part' && intent.part_nr) {
      showPartByNr(intent.part_nr)
      return
    }

    if (intent.intent === 'bulk_modify') {
      applyBulkModification(intent)
      return
    }

    if (intent.intent === 'modify') {
      applyModifications(intent.modifications)
      return
    }

    pushMessage(
      'assistant',
      'text',
      'Try naming a part number and field to change (e.g. "part 4286 amount 3" or "set 4010 name to Cover"). Material is chosen in the nesting material step.',
    )
  }

  return { onSendText }
}
