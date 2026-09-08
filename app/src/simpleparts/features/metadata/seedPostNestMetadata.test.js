import assert from 'node:assert/strict'
import test from 'node:test'
import { seedPostNestMetadata } from './seedPostNestMetadata.js'

test('replaceOverrides drops prior-file metadata keys', () => {
  const { metadataOverrides } = seedPostNestMetadata({
    partKeys: ['pk-new'],
    postInjectionNames: ['PartB'],
    postInjectionAmount: ['2'],
    metadataOverrides: {
      'mesh:0': { nr: 'PartA', anz: '9' },
      'pk-old': { nr: 'Stale', mat: 'Oak' },
    },
    meshCount: 1,
    replaceOverrides: true,
  })

  assert.deepEqual(metadataOverrides, {
    'pk-new': { nr: 'PartB', anz: '2' },
  })
  assert.equal(metadataOverrides['mesh:0'], undefined)
  assert.equal(metadataOverrides['pk-old'], undefined)
})

test('expanded descriptor keys reuse GH association by partKey', () => {
  const { metadataOverrides, meshDescriptorBaseMeta } = seedPostNestMetadata({
    partKeys: ['pk-a', 'pk-b'],
    descriptorPartKeys: ['pk-a', 'pk-a', 'pk-b'],
    postInjectionNames: ['Alpha', 'Beta'],
    postInjectionAmount: ['1', '3'],
    meshCount: 3,
    replaceOverrides: true,
  })

  assert.deepEqual(metadataOverrides, {
    'pk-a': { nr: 'Alpha', anz: '1' },
    'pk-b': { nr: 'Beta', anz: '3' },
  })
  assert.deepEqual(meshDescriptorBaseMeta, [
    { nr: 'Alpha', anz: '1' },
    { nr: 'Alpha', anz: '1' },
    { nr: 'Beta', anz: '3' },
  ])
})

test('without replaceOverrides, existing user edits win', () => {
  const { metadataOverrides } = seedPostNestMetadata({
    partKeys: ['pk-a'],
    postInjectionNames: ['FromGh'],
    postInjectionAmount: ['1'],
    metadataOverrides: {
      'pk-a': { nr: 'UserEdit', mat: 'Pine', anz: '5' },
    },
    meshCount: 1,
  })

  assert.deepEqual(metadataOverrides, {
    'pk-a': { nr: 'UserEdit', mat: 'Pine', anz: '5' },
  })
})
