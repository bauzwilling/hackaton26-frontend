import assert from 'node:assert/strict'
import test from 'node:test'
import { buildNestingMeshPartDescriptors } from './buildNestingMeshPartDescriptors.js'

test('skips unassigned keys so assigned mesh i matches remaining part order', () => {
  const descriptors = buildNestingMeshPartDescriptors({
    assignedMeshCount: 3,
    initialPartKeys: ['1000', '1001', '1002', '1003'],
    postInjectionNames: ['A', 'B', 'C', 'D'],
    postInjectionAmount: ['1', '2', '3', '4'],
    unassignedPartKeys: ['1001'],
  })

  assert.equal(descriptors.length, 3)
  assert.deepEqual(
    descriptors.map((d) => ({ id: d.id, nr: d.nr, anz: d.anz })),
    [
      { id: '1000', nr: 'A', anz: '1' },
      { id: '1002', nr: 'C', anz: '3' },
      { id: '1003', nr: 'D', anz: '4' },
    ],
  )
})

test('does not bind assigned meshes to leading initialPartKeys when gaps exist', () => {
  const brokenLegacy = [
    { id: '1000', nr: 'A' },
    { id: '1001', nr: 'B' }, // unassigned — must not appear as mesh index 1
    { id: '1002', nr: 'C' },
  ]
  const descriptors = buildNestingMeshPartDescriptors({
    assignedMeshCount: 3,
    initialPartKeys: ['1000', '1001', '1002', '1003'],
    postInjectionNames: ['A', 'B', 'C', 'D'],
    postInjectionAmount: ['1', '2', '3', '4'],
    unassignedPartKeys: ['1001'],
  })

  assert.notEqual(descriptors[1].id, brokenLegacy[1].id)
  assert.equal(descriptors[1].nr, 'C')
})
