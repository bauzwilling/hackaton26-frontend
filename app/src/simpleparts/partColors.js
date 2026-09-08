/** Read part highlight colors from styles.css (--color-part-*). */

const MATERIAL_COLORS = {
  '1-schicht': 'yellow',
  '2-schicht': 'purple',
  '3-schicht': 'brown',
}

/** Must match styles.css; used when CSS minifies hex to keywords (#ff0000 → red). */
const PART_COLOR_FALLBACK = {
  red: 0xff0000,
  yellow: 0xffff00,
  purple: 0x800080,
  brown: 0x712e11,
  green: 0x188500,
  blue: 0x176498,
  grey: 0x808080,
  orange: 0xff8c00,
  pink: 0xe91e8c,
  default: 0xb0b0b0,
}

let colorProbeEl = null

function cssColorToRgbNumber(cssValue) {
  const v = String(cssValue ?? '').trim()
  if (!v) return null

  if (v.startsWith('#')) {
    let hex = v.slice(1)
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('')
    }
    if (hex.length === 6) {
      const n = parseInt(hex, 16)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  if (typeof document === 'undefined') {
    return PART_COLOR_FALLBACK[v.toLowerCase()] ?? null
  }

  if (!colorProbeEl) {
    colorProbeEl = document.createElement('span')
    colorProbeEl.style.display = 'none'
    document.documentElement.appendChild(colorProbeEl)
  }
  colorProbeEl.style.color = ''
  colorProbeEl.style.color = v
  const computed = getComputedStyle(colorProbeEl).color
  const m = computed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!m) return null
  return (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3])
}

export function colorNameForMaterial(material) {
  const key = String(material ?? '').replace(/\s+/g, '').trim().toLowerCase()
  return MATERIAL_COLORS[key] ?? 'blue'
}

export function readPartColorHex(name) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-part-${name}`).trim()
  const rgb = cssColorToRgbNumber(raw) ?? PART_COLOR_FALLBACK[name]
  if (rgb == null) return ''
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`
}

export function readPartColor(name) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-part-${name}`).trim()
  return cssColorToRgbNumber(raw) ?? PART_COLOR_FALLBACK[name] ?? 0x000000
}
