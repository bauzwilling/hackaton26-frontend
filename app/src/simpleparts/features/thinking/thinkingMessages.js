/** Placeholder replaced at runtime with a progressive part number. */
export const PART_N = '{{partN}}'

export const ERROR_LINE = 'Computing error encountered…'

export const BREATHING = [
  'Still working…',
  'One moment…',
  'Holding the thread…',
  'Narrowing it down…',
  'Almost there…',
  'Double-checking…',
  'Tidying up…',
  'Final pass…',
]

export const PREVIEW_BY_FORMAT = {
  dxf: [
    'Interpreting DXF and looking for parts…',
    'Reading entity table…',
    'Mapping layers to candidate outlines…',
    'Filtering construction geometry…',
    'Closing open polylines where possible…',
    'Merging unjoined curves when possible…',
    'Detecting nested contours…',
    'Separating holes from outer profiles…',
    'Checking curve orientation…',
    'Normalizing units to millimeters…',
    'Deduplicating overlapping edges…',
    'Scoring closed loops as parts…',
    `Inspecting part ${PART_N}…`,
    `Inspecting part ${PART_N}…`,
    `Inspecting part ${PART_N}…`,
    'Validating hole containment…',
    'Ignoring annotation text…',
    'Skipping dimension lines…',
    'Building part inventory…',
    'Computing bounding boxes…',
    'Checking for self-intersections…',
    'Resolving coincident vertices…',
    'Preparing mesh preview…',
    'Assigning temporary part keys…',
    'Almost ready to show the model…',
  ],
  dwg: [
    'Interpreting DWG and looking for parts…',
    'Expanding block references…',
    'Flattening nested inserts…',
    'Extracting model-space geometry…',
    'Ignoring paper-space layouts…',
    'Converting arcs to polylines…',
    'Merging unjoined curves when possible…',
    'Detecting closed profiles…',
    `Inspecting part ${PART_N}…`,
    `Inspecting part ${PART_N}…`,
    'Filtering hatch patterns…',
    'Discarding leader lines…',
    'Normalizing layer visibility…',
    'Checking for exploded text…',
    'Building preview meshes…',
    'Finalizing part list…',
  ],
  '3dm': [
    'Interpreting 3DM and looking for parts…',
    'Reading object table…',
    'Preferring meshes and breps…',
    'Tessellating curved surfaces…',
    'Projecting silhouettes for nesting…',
    'Extracting planar faces…',
    'Detecting sheet-like solids…',
    'Measuring thickness candidates…',
    `Inspecting part ${PART_N}…`,
    `Inspecting part ${PART_N}…`,
    'Separating open edges from closed shells…',
    'Building 3D visualization…',
    'Computing normals for display…',
    'Mapping objects to part keys…',
    'Preparing the viewer…',
  ],
}

export const SHARED_INTEGRITY = [
  'Checking part integrity…',
  'Flagging incomplete outlines…',
  'Looking for zero-area loops…',
  'Softening micro-gaps under tolerance…',
  'Merging collinear segments…',
  'Removing duplicate points…',
  'Verifying hole topology…',
  'Counting usable parts…',
  'Marking geometry that cannot nest…',
  'Collecting unassigned candidates…',
  'Writing temporary job workspace…',
  'Syncing metadata labels…',
]

export const NESTING = [
  'Preparing nesting run…',
  'Loading sheet dimensions…',
  'Sorting parts by area…',
  'Placing largest parts first…',
  'Trying alternate rotations…',
  'Testing 0° / 90° orientations…',
  'Packing row candidates…',
  'Filling leftover pockets…',
  'Avoiding part overlaps…',
  'Respecting minimum gaps…',
  `Nesting part ${PART_N}…`,
  `Nesting part ${PART_N}…`,
  `Nesting part ${PART_N}…`,
  `Repositioning part ${PART_N} for a tighter fit…`,
  `Sliding part ${PART_N} into a gap…`,
  'Evaluating sheet utilization…',
  'Compacting sparse regions…',
  'Checking parts that still don’t fit…',
  'Separating nested from unassigned…',
  'Writing nested layout to DXF…',
  'Merging output layers…',
  'Applying part labels…',
  'Updating quantities…',
  'Generating preview meshes…',
  'Almost done packing…',
]

export const NEST_LEFTOVERS = [
  'Collecting leftover parts…',
  'Rematching part keys…',
  'Rebuilding a sheet for leftovers…',
  'Trying a second nesting pass…',
  'Fitting remaining profiles…',
  `Nesting leftover part ${PART_N}…`,
  'Checking why some parts still fail…',
  'Recording unassigned reasons…',
  'Merging leftover layout…',
  'Refreshing the viewer…',
]

const NEST_MARKERS = [
  'Preparing nesting run',
  'Packing row',
  'sheet utilization',
  'Almost done packing',
  'Writing nested layout',
]

const PREVIEW_MARKERS = [
  'Interpreting DXF',
  'Interpreting DWG',
  'Interpreting 3DM',
]

/**
 * Insert a breathing line every 4–6 primary steps (jittered).
 * @param {string[]} primary
 * @param {string[]} [breathing]
 * @returns {string[]}
 */
export function interleaveBreathing(primary, breathing = BREATHING) {
  if (!primary.length) return [...breathing]
  const out = []
  let sinceBreath = 0
  let nextBreathAt = 4 + Math.floor(Math.random() * 3) // 4–6
  let breathIdx = 0

  for (const line of primary) {
    out.push(line)
    sinceBreath += 1
    if (sinceBreath >= nextBreathAt) {
      out.push(breathing[breathIdx % breathing.length])
      breathIdx += 1
      sinceBreath = 0
      nextBreathAt = 4 + Math.floor(Math.random() * 3)
    }
  }
  return out
}

/**
 * @param {'preview' | 'nest' | 'leftovers'} phase
 * @param {{ format?: string }} [opts]
 * @returns {string[]}
 */
export function buildPool(phase, { format } = {}) {
  if (phase === 'preview') {
    const key = format === 'dwg' || format === '3dm' ? format : 'dxf'
    const primary = [...PREVIEW_BY_FORMAT[key], ...SHARED_INTEGRITY]
    return interleaveBreathing(primary)
  }
  if (phase === 'nest') {
    return interleaveBreathing([...NESTING])
  }
  if (phase === 'leftovers') {
    return interleaveBreathing([...NEST_LEFTOVERS])
  }
  throw new Error(`Unknown thinking phase: ${phase}`)
}

/** @param {string[]} pool */
export function poolLooksLikePreview(pool) {
  const joined = pool.join('\n')
  return PREVIEW_MARKERS.some((m) => joined.includes(m))
}

/** @param {string[]} pool */
export function poolLooksLikeNest(pool) {
  const joined = pool.join('\n')
  return NEST_MARKERS.some((m) => joined.includes(m))
}
