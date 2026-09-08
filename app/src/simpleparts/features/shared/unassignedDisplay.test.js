import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveNestingCounts } from './unassignedDisplay.js'

test('resolveNestingCounts sums Anz for nested and unassigned rows', () => {
  const result = resolveNestingCounts({
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
    postInjectionAmount: ['3', '2'],
    unassignedIds: ['PartB'],
  })

  assert.equal(result.totalParts, 5)
  assert.equal(result.unassignedCount, 2)
  assert.equal(result.nestedCount, 3)
})

test('resolveNestingCounts matches unassigned IDs with (xN) suffix to row Anz', () => {
  const result = resolveNestingCounts({
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
    postInjectionAmount: ['2', '5'],
    unassignedIds: ['PartB (x5)'],
  })

  assert.equal(result.totalParts, 7)
  assert.equal(result.unassignedCount, 5)
  assert.equal(result.nestedCount, 2)
})

test('resolveNestingCounts applies metadata override Anz to unassigned row with (xN) suffix', () => {
  const result = resolveNestingCounts({
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
    postInjectionAmount: ['2', '3'],
    unassignedIds: ['PartB (x3)'],
  }, {
    metadataOverrides: {
      'key-b': { anz: '7' },
    },
  })

  assert.equal(result.totalParts, 9)
  assert.equal(result.unassignedCount, 7)
  assert.equal(result.nestedCount, 2)
})

test('resolveNestingCounts applies metadata override on mesh alias', () => {
  const result = resolveNestingCounts({
    initialPartKeys: ['key-a'],
    postInjectionNames: ['PartA'],
    postInjectionAmount: ['1'],
    unassignedIds: ['PartA'],
  }, {
    metadataOverrides: {
      'mesh:0': { anz: '4' },
    },
  })

  assert.equal(result.totalParts, 4)
  assert.equal(result.unassignedCount, 4)
  assert.equal(result.nestedCount, 0)
})

test('resolveNestingCounts ignores phantom quantity-only unassigned id (x)', () => {
  const result = resolveNestingCounts({
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
    postInjectionAmount: ['3', '2'],
    unassignedIds: ['(x)'],
  })

  assert.equal(result.totalParts, 5)
  assert.equal(result.unassignedCount, 0)
  assert.equal(result.nestedCount, 5)
  assert.deepEqual(result.unassignedIds, [])
})

test('resolveNestingCounts increases unassigned count when unassigned Anz grows', () => {
  const base = {
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
    postInjectionAmount: ['2', '3'],
    unassignedIds: ['PartB (x3)'],
  }

  const before = resolveNestingCounts(base)
  const after = resolveNestingCounts(base, {
    metadataOverrides: {
      'key-b': { anz: '6' },
    },
  })

  assert.equal(after.unassignedCount - before.unassignedCount, 3)
  assert.equal(after.nestedCount, before.nestedCount)
})
