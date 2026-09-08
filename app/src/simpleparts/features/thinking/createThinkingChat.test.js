import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from '../../reactivity.js'

import { createThinkingChat, formatThoughtDuration } from './createThinkingChat.js'

test('formatThoughtDuration covers short and long spans', () => {
  assert.equal(formatThoughtDuration(500), 'Thought for a moment')
  assert.equal(formatThoughtDuration(3200), 'Thought for 3 seconds')
  assert.equal(formatThoughtDuration(60_000), 'Thought for 1 minute')
  assert.equal(formatThoughtDuration(125_000), 'Thought for 2 minutes 5 seconds')
})

test('thinking chat appends lines and collapses into a summary', () => {
  const messages = ref([])
  const pushMessage = (role, kind, content, meta) => {
    const id = `id-${messages.value.length}`
    messages.value.push({ id, role, kind, content, meta })
    return id
  }
  const chat = createThinkingChat({ messages }, pushMessage)
  const id = chat.begin()
  assert.equal(messages.value[0].kind, 'thinking')
  assert.equal(messages.value[0].meta.collapsed, false)

  for (let i = 0; i < 15; i += 1) {
    chat.append(id, `line ${i}`)
  }
  const lines = messages.value[0].content.split('\n')
  assert.equal(lines.length, chat.MAX_THINKING_LINES)
  assert.equal(lines[0], 'line 3')
  assert.equal(lines.at(-1), 'line 14')

  chat.collapse(id)
  assert.equal(messages.value.length, 1)
  assert.equal(messages.value[0].meta.collapsed, true)
  assert.match(messages.value[0].meta.summary, /^Thought for /)
  assert.ok(messages.value[0].content.includes('line 14'))
})

test('collapse with interrupted uses Stopped summary', () => {
  const messages = ref([])
  const pushMessage = (role, kind, content, meta) => {
    const id = `id-${messages.value.length}`
    messages.value.push({ id, role, kind, content, meta })
    return id
  }
  const chat = createThinkingChat({ messages }, pushMessage)
  const id = chat.begin()
  chat.append(id, 'working')
  chat.collapse(id, { interrupted: true })
  assert.equal(messages.value[0].meta.collapsed, true)
  assert.equal(messages.value[0].meta.interrupted, true)
  assert.equal(messages.value[0].meta.failed, false)
  assert.equal(messages.value[0].meta.summary, 'Stopped')
})

test('begin collapses a previous live thinking stream', () => {
  const messages = ref([])
  const pushMessage = (role, kind, content, meta) => {
    const id = `id-${messages.value.length}`
    messages.value.push({ id, role, kind, content, meta })
    return id
  }
  const chat = createThinkingChat({ messages }, pushMessage)
  const first = chat.begin()
  chat.append(first, 'still going')
  const second = chat.begin()
  assert.equal(messages.value.length, 2)
  assert.equal(messages.value[0].id, first)
  assert.equal(messages.value[0].meta.collapsed, true)
  assert.equal(messages.value[1].id, second)
  assert.equal(messages.value[1].meta.collapsed, false)
})
