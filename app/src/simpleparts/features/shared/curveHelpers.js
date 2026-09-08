import { FIELD_LABELS } from './createAppState.js'

export function safeFilename(name) {
  const n = String(name ?? '').replace(/\s+/g, '').trim().replace(/[\\/:*?"<>|]/g, '_')
  return n || 'UNNAMED'
}

export function createMessaging(state) {
  function pushMessage(role, kind, content, meta) {
    const id = crypto.randomUUID()
    state.messages.value.push({ id, role, kind, content, meta })
    return id
  }

  return { pushMessage, FIELD_LABELS }
}
