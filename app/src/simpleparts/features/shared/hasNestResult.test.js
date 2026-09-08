import test from 'node:test'
import assert from 'node:assert/strict'
import { hasNestResult } from './hasNestResult.js'

test('hasNestResult is false without preview', () => {
  assert.equal(hasNestResult(null), false)
  assert.equal(hasNestResult({}), false)
  assert.equal(hasNestResult({ dxfText: 'x' }), false)
})

test('hasNestResult is true when nest jobId is present', () => {
  assert.equal(hasNestResult({ jobId: 'abc' }), true)
  assert.equal(hasNestResult({ jobId: 'abc', dxfText: '' }), true)
})
