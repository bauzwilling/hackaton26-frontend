import assert from 'node:assert/strict'
import test from 'node:test'
import {
  postInjectionLooksStale,
  reconcilePostInjectionWithInputText,
} from './reconcilePostInjectionWithInputText.js'

test('detects stale postInjection when names never appear in InputText', () => {
  assert.equal(
    postInjectionLooksStale(
      ['IZ14', 'AL11'],
      ['Knagge K102', 'Knagge P001', '60 Stk.'],
    ),
    true,
  )
})

test('keeps postInjection when names overlap InputText', () => {
  assert.equal(
    postInjectionLooksStale(['IZ14', 'AL11'], ['x4', 'IZ14', 'x5', 'AL11']),
    false,
  )
})

test('rebuilds knagge-style labels when postInjection is stale', () => {
  const result = reconcilePostInjectionWithInputText({
    postInjectionNames: ['IZ14', 'PG30', 'AL11'],
    postInjectionAmount: ['4', '1', '5'],
    inputText: [
      'Knagge P003a',
      'Knagge P003',
      'Knagge K102',
      '60 Stk.',
      '12 Stk.',
      '5 Stk.',
    ],
    expectedCount: 3,
  })
  assert.equal(result.stale, true)
  assert.deepEqual(result.postInjectionNames, [
    'Knagge P003a',
    'Knagge P003',
    'Knagge K102',
  ])
  assert.deepEqual(result.postInjectionAmount, ['60', '12', '5'])
})

test('rebuilds interleaved xN name pattern when stale', () => {
  const result = reconcilePostInjectionWithInputText({
    postInjectionNames: ['OLD1', 'OLD2'],
    postInjectionAmount: ['9', '9'],
    inputText: ['x4', 'IZ14', 'x1', 'PG30'],
  })
  assert.equal(result.stale, true)
  assert.deepEqual(result.postInjectionNames, ['IZ14', 'PG30'])
  assert.deepEqual(result.postInjectionAmount, ['4', '1'])
})
