import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ERROR_LINE,
  PART_N,
  buildPool,
  poolLooksLikeNest,
  poolLooksLikePreview,
} from './thinkingMessages.js'
import { createThinkingRotator } from './createThinkingRotator.js'

test('preview pool is format-specific and excludes nesting copy', () => {
  for (const format of ['dxf', 'dwg', '3dm']) {
    const pool = buildPool('preview', { format })
    assert.ok(pool.length > 0)
    assert.match(pool[0], new RegExp(`Interpreting ${format.toUpperCase()}`, 'i'))
    assert.ok(poolLooksLikePreview(pool))
    assert.equal(poolLooksLikeNest(pool), false)
    assert.ok(pool.some((line) => line.includes('Checking part integrity')))
  }
})

test('preview defaults unknown format to DXF', () => {
  const pool = buildPool('preview', { format: 'unknown' })
  assert.match(pool[0], /Interpreting DXF/i)
})

test('nest pool excludes interpret copy', () => {
  const pool = buildPool('nest')
  assert.match(pool[0], /Preparing nesting run/i)
  assert.ok(poolLooksLikeNest(pool))
  assert.equal(poolLooksLikePreview(pool), false)
  assert.ok(!pool.some((line) => /Interpreting (DXF|DWG|3DM)/i.test(line)))
})

test('leftovers pool is distinct from nest and preview', () => {
  const pool = buildPool('leftovers')
  assert.match(pool[0], /Collecting leftover parts/i)
  assert.equal(poolLooksLikePreview(pool), false)
  assert.ok(!pool.some((line) => line.includes('Preparing nesting run')))
  assert.ok(pool.some((line) => line.includes('Rematching part keys')))
})

test('rotator substitutes part numbers and advances', async () => {
  const messages = []
  let now = 0
  /** @type {Array<{ id: number, fn: () => void, at: number }>} */
  const timers = []
  let nextId = 1

  const rotator = createThinkingRotator({
    minMs: 100,
    maxMs: 100,
    random: () => 0,
    setTimeout: (fn, ms) => {
      const id = nextId++
      timers.push({ id, fn, at: now + ms })
      return id
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((t) => t.id === id)
      if (i >= 0) timers.splice(i, 1)
    },
  })

  rotator.start({
    pool: [`Inspecting part ${PART_N}…`, 'Almost ready to show the model…'],
    onMessage: (msg) => messages.push(msg),
  })

  assert.equal(messages.length, 1)
  assert.match(messages[0], /^Inspecting part \d+…$/)

  now += 100
  const due = timers.splice(0, timers.length)
  for (const t of due) t.fn()

  assert.equal(messages.length, 2)
  assert.equal(messages[1], 'Almost ready to show the model…')

  rotator.stop()
  const afterStop = messages.length
  now += 100
  const leftover = timers.splice(0, timers.length)
  for (const t of leftover) t.fn()
  assert.equal(messages.length, afterStop)
})

test('rotator fail emits error line and stop prevents further messages', async () => {
  const messages = []
  /** @type {Array<() => void>} */
  const pending = []

  const rotator = createThinkingRotator({
    minMs: 50,
    maxMs: 50,
    failPauseMs: 10,
    random: () => 0,
    setTimeout: (fn, ms) => {
      if (ms === 10) {
        queueMicrotask(fn)
        return 1
      }
      pending.push(fn)
      return 2
    },
    clearTimeout: () => {
      pending.length = 0
    },
  })

  rotator.start({
    pool: ['Still working…'],
    onMessage: (msg) => messages.push(msg),
  })
  assert.equal(messages[0], 'Still working…')

  await rotator.fail()
  assert.equal(messages.at(-1), ERROR_LINE)

  const count = messages.length
  for (const fn of pending.splice(0, pending.length)) fn()
  assert.equal(messages.length, count)
})
