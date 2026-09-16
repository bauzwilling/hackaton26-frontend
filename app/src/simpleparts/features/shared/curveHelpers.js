import { FIELD_LABELS } from './createAppState.js'
import { reportAppChatReply } from '../../../lib/appChat'

export function safeFilename(name) {
  const n = String(name ?? '').replace(/\s+/g, '').trim().replace(/[\\/:*?"<>|]/g, '_')
  return n || 'UNNAMED'
}

export function createMessaging(state) {
  function pushMessage(role, kind, content, meta) {
    const id = crypto.randomUUID()
    state.messages.value.push({ id, role, kind, content, meta })
    const nodeId = state.studioNodeId?.value
    if (
      nodeId
      && role === 'assistant'
      && typeof content === 'string'
      && content.trim()
      && kind !== 'thinking'
      && kind !== 'file'
    ) {
      reportAppChatReply(nodeId, content)
    }
    return id
  }

  return { pushMessage, FIELD_LABELS }
}
