import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLeftoverMetadataBundle,
  buildLeftoverMetadataPayload,
  resolveLeftoverPartKeysFromPreview,
} from './buildLeftoverMetadataPayload.js'

test('buildLeftoverMetadataPayload returns empty when no unassigned parts', () => {
  const result = buildLeftoverMetadataPayload({
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
    postInjectionAmount: ['2', '3'],
    unassignedPartKeys: [],
    unassignedIds: [],
  })
  assert.deepEqual(result, {})
})

test('buildLeftoverMetadataPayload includes only unassigned subset', () => {
  const result = buildLeftoverMetadataPayload({
    initialPartKeys: ['key-a', 'key-b', 'key-c'],
    postInjectionNames: ['PartA', 'PartB', 'PartC'],
    postInjectionAmount: ['1', '2', '3'],
    unassignedPartKeys: ['key-b'],
  })
  assert.deepEqual(result, {
    'key-b': { nr: 'PartB', anz: '2' },
    PartB: { nr: 'PartB', anz: '2' },
  })
})

test('buildLeftoverMetadataPayload prefers metadata overrides over GH lists', () => {
  const result = buildLeftoverMetadataPayload({
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
    postInjectionAmount: ['1', '2'],
    unassignedPartKeys: ['key-b'],
    metadataOverrides: {
      'key-b': { nr: 'RenamedB', anz: '9', mat: 'MDF' },
    },
  })
  assert.deepEqual(result, {
    'key-b': { nr: 'RenamedB', anz: '9', mat: 'MDF' },
    RenamedB: { nr: 'RenamedB', anz: '9', mat: 'MDF' },
  })
})

test('buildLeftoverMetadataPayload resolves unassignedIds when part keys missing', () => {
  const result = buildLeftoverMetadataPayload({
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
    postInjectionAmount: ['4', '5'],
    unassignedIds: ['PartB (x5)'],
  })
  assert.deepEqual(result, {
    'key-b': { nr: 'PartB', anz: '5' },
    PartB: { nr: 'PartB', anz: '5' },
  })
})

test('buildLeftoverMetadataPayload skips nr alias when nr equals part key', () => {
  const result = buildLeftoverMetadataPayload({
    initialPartKeys: ['PartB'],
    postInjectionNames: ['PartB'],
    postInjectionAmount: ['2'],
    unassignedPartKeys: ['PartB'],
  })
  assert.deepEqual(result, {
    PartB: { nr: 'PartB', anz: '2' },
  })
})

test('buildLeftoverMetadataBundle returns ordered rows in unassignedPartKeys order', () => {
  const { overrides, ordered } = buildLeftoverMetadataBundle({
    initialPartKeys: ['key-a', 'key-b', 'key-c'],
    postInjectionNames: ['PartA', 'PartB', 'PartC'],
    postInjectionAmount: ['1', '2', '3'],
    unassignedPartKeys: ['key-c', 'key-a'],
    metadataOverrides: {
      'key-a': { anz: '8' },
    },
  })
  assert.deepEqual(ordered, [
    { partKey: 'key-c', nr: 'PartC', anz: '3' },
    { partKey: 'key-a', nr: 'PartA', anz: '8' },
  ])
  assert.equal(overrides['key-c'].nr, 'PartC')
  assert.equal(overrides['key-a'].anz, '8')
})

test('resolveLeftoverPartKeysFromPreview prefers unassignedPartKeys', () => {
  const keys = resolveLeftoverPartKeysFromPreview({
    unassignedPartKeys: ['key-b', 'key-c'],
    unassignedIds: ['PartA'],
    initialPartKeys: ['key-a', 'key-b'],
  })
  assert.deepEqual(keys, ['key-b', 'key-c'])
})

test('resolveLeftoverPartKeysFromPreview falls back to unassignedIds mapping', () => {
  const keys = resolveLeftoverPartKeysFromPreview({
    unassignedIds: ['PartB (x2)'],
    initialPartKeys: ['key-a', 'key-b'],
    postInjectionNames: ['PartA', 'PartB'],
  })
  assert.deepEqual(keys, ['key-b'])
})
