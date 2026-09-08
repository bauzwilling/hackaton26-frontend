import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNestFingerprint, createSpeculativeNest } from './createSpeculativeNest.js'

test('buildNestFingerprint is stable for same inputs', () => {
  const input = {
    sheetX: 2500,
    sheetY: 1250,
    sheetThickness: 21,
    materialId: 'mat-a',
    overrides: { '1': { mat: 'Oak' } },
  }
  assert.equal(buildNestFingerprint(input), buildNestFingerprint({ ...input }))
})

test('buildNestFingerprint changes when inputJobId changes', () => {
  const base = {
    inputJobId: 'job-a',
    sheetX: 2500,
    sheetY: 1250,
    sheetThickness: 21,
    materialId: 'mat-a',
    overrides: {},
  }
  assert.notEqual(
    buildNestFingerprint(base),
    buildNestFingerprint({ ...base, inputJobId: 'job-b' }),
  )
})

test('buildNestFingerprint changes when overrides change', () => {
  const base = {
    sheetX: 2500,
    sheetY: 1250,
    sheetThickness: 21,
    materialId: 'mat-a',
    overrides: { '1': { mat: 'Oak' } },
  }
  const changed = {
    ...base,
    overrides: { '1': { mat: 'Pine' } },
  }
  assert.notEqual(buildNestFingerprint(base), buildNestFingerprint(changed))
})

test('start reuses in-flight job for same fingerprint', async () => {
  const nest = createSpeculativeNest()
  let runs = 0
  const run = async () => {
    runs += 1
    await new Promise((r) => setTimeout(r, 20))
    return { ok: true, data: { jobId: 'a' } }
  }

  const first = nest.start('fp-1', run)
  const second = nest.start('fp-1', run)
  assert.equal(second.reused, true)
  assert.equal(first.generation, second.generation)

  const outcome = await first.promise
  assert.equal(runs, 1)
  assert.deepEqual(outcome, { ok: true, data: { jobId: 'a' } })
})

test('start aborts previous job when fingerprint changes', async () => {
  const nest = createSpeculativeNest()
  let firstSignal = null

  const first = nest.start('fp-1', async ({ signal }) => {
    firstSignal = signal
    await new Promise((resolve, reject) => {
      const fail = () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        reject(err)
      }
      if (signal.aborted) {
        fail()
        return
      }
      signal.addEventListener('abort', fail, { once: true })
    })
    return { ok: true, data: {} }
  })

  // Let the first job attach its abort listener before superseding it.
  await new Promise((r) => setTimeout(r, 0))
  const second = nest.start('fp-2', async () => ({ ok: true, data: { jobId: 'b' } }))
  assert.equal(second.reused, false)
  assert.notEqual(first.generation, second.generation)

  await first.promise
  assert.equal(firstSignal?.aborted, true)

  const outcome = await second.promise
  assert.deepEqual(outcome, { ok: true, data: { jobId: 'b' } })
  assert.equal(nest.getSnapshot().outcome?.ok, true)
})

test('cancel clears stash and bumps generation', async () => {
  const nest = createSpeculativeNest()
  nest.start('fp-1', async () => ({ ok: true, data: { jobId: 'a' } }))
  await nest.getSnapshot().promise
  assert.ok(nest.getSnapshot().outcome)

  const genBefore = nest.getSnapshot().generation
  nest.cancel()
  assert.equal(nest.getSnapshot().outcome, null)
  assert.equal(nest.getSnapshot().fingerprint, null)
  assert.ok(nest.getSnapshot().generation > genBefore)
})
