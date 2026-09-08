const MAX_THINKING_LINES = 12

/**
 * @param {number} durationMs
 * @returns {string}
 */
export function formatThoughtDuration(durationMs) {
  const ms = Math.max(0, Number(durationMs) || 0)
  const sec = Math.round(ms / 1000)
  if (sec < 2) return 'Thought for a moment'
  if (sec < 60) return `Thought for ${sec} seconds`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min === 1 && rem === 0) return 'Thought for 1 minute'
  if (rem === 0) return `Thought for ${min} minutes`
  if (min === 1) return `Thought for 1 minute ${rem} seconds`
  return `Thought for ${min} minutes ${rem} seconds`
}

/**
 * Live assistant "thinking" bubble helpers (LLM-style stream in chat).
 * Collapses into a "Thought for …" summary when finished instead of disappearing.
 * @param {{ messages: { value: object[] } }} state
 * @param {(role: string, kind: string, content: string, meta?: object) => string} pushMessage
 */
export function createThinkingChat(state, pushMessage) {
  /**
   * @param {object} [meta]
   * @returns {string} message id
   */
  function begin(meta = {}) {
    for (const msg of state.messages.value) {
      if (msg.kind === 'thinking' && !msg.meta?.collapsed) {
        collapse(msg.id)
      }
    }
    return pushMessage('assistant', 'thinking', '', {
      ...meta,
      thinking: true,
      collapsed: false,
      startedAt: Date.now(),
    })
  }

  /**
   * @param {string} id
   * @param {string} line
   */
  function append(id, line) {
    const msg = state.messages.value.find((m) => m.id === id)
    if (!msg || msg.kind !== 'thinking' || msg.meta?.collapsed) return
    const lines = msg.content ? msg.content.split('\n').filter(Boolean) : []
    lines.push(line)
    msg.content = lines.slice(-MAX_THINKING_LINES).join('\n')
  }

  /**
   * Collapse an active stream into a duration summary (keeps content for expand).
   * @param {string} id
   * @param {{ failed?: boolean, interrupted?: boolean }} [opts]
   */
  function collapse(id, { failed = false, interrupted = false } = {}) {
    const msg = state.messages.value.find((m) => m.id === id)
    if (!msg || msg.kind !== 'thinking') return
    if (msg.meta?.collapsed) return
    const startedAt = Number(msg.meta?.startedAt) || Date.now()
    const durationMs = Math.max(0, Date.now() - startedAt)
    const wasInterrupted = Boolean(interrupted)
    msg.meta = {
      ...msg.meta,
      collapsed: true,
      expanded: false,
      failed: Boolean(failed) && !wasInterrupted,
      interrupted: wasInterrupted,
      durationMs,
      summary: wasInterrupted ? 'Stopped' : formatThoughtDuration(durationMs),
    }
  }

  /** @deprecated prefer collapse — removes thinking messages */
  function end(id) {
    if (id) {
      const i = state.messages.value.findIndex((m) => m.id === id)
      if (i >= 0) state.messages.value.splice(i, 1)
      return
    }
    endAll()
  }

  function endAll() {
    state.messages.value = state.messages.value.filter((m) => m.kind !== 'thinking')
  }

  return {
    begin,
    append,
    collapse,
    end,
    endAll,
    MAX_THINKING_LINES,
    formatThoughtDuration,
  }
}
