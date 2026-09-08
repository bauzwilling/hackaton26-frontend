import { list3dPartEntities } from './dxfMetadata.js'

export function is3dDxf(dxf) {
  return list3dPartEntities(dxf).length > 0
}

// ACIS solids (3DSOLID/BODY) carry no mesh in the DXF and cannot be tessellated
// in the browser, so they can't be previewed client-side.
export function dxfTextHasAcisSolid(text) {
  if (!text) return false
  return /(^|\r?\n)\s*(3DSOLID|BODY)\s*(\r?\n|$)/i.test(text)
}
