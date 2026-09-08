/** Detect sticky/stale PostInjection lists that do not belong to the current file's InputText. */

export function normalizeGhStringList(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((value) => String(value ?? '').trim())
}

export function isQuantityLabel(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  return /^x\d+$/i.test(t) || /^\d+\s*stk\.?$/i.test(t)
}

export function parseQuantityLabel(text) {
  const t = String(text ?? '').trim()
  let match = /^x(\d+)$/i.exec(t)
  if (match) return match[1]
  match = /^(\d+)\s*stk\.?$/i.exec(t)
  if (match) return match[1]
  return ''
}

function nameAppearsInInputText(name, texts) {
  const n = String(name ?? '').trim()
  if (!n) return false
  return texts.some((text) => {
    const t = String(text ?? '').trim()
    return t === n || t.includes(n)
  })
}

/**
 * True when PostInjection names look like leftovers from another solve:
 * non-empty names, non-empty InputText, and zero name overlap.
 */
export function postInjectionLooksStale(postInjectionNames, inputText) {
  const names = normalizeGhStringList(postInjectionNames).filter(Boolean)
  const texts = normalizeGhStringList(inputText).filter(Boolean)
  if (!names.length || !texts.length) return false
  return !names.some((name) => nameAppearsInInputText(name, texts))
}

function deriveFromInputText(texts, expectedCount) {
  const labels = normalizeGhStringList(texts).filter(Boolean)
  if (!labels.length) {
    return { postInjectionNames: [], postInjectionAmount: [] }
  }

  // Pattern: x4, IZ14, x1, PG30, …
  if (labels.length >= 2 && isQuantityLabel(labels[0]) && !isQuantityLabel(labels[1])) {
    const names = []
    const amounts = []
    for (let i = 0; i + 1 < labels.length; i += 2) {
      if (!isQuantityLabel(labels[i]) || isQuantityLabel(labels[i + 1])) break
      amounts.push(parseQuantityLabel(labels[i]))
      names.push(labels[i + 1])
    }
    if (names.length) {
      return { postInjectionNames: names, postInjectionAmount: amounts }
    }
  }

  const names = labels.filter((text) => !isQuantityLabel(text))
  const amounts = labels.filter((text) => isQuantityLabel(text)).map(parseQuantityLabel)
  const count = expectedCount > 0 ? expectedCount : names.length
  return {
    postInjectionNames: names.slice(0, count),
    postInjectionAmount:
      amounts.length >= count
        ? amounts.slice(0, count)
        : Array.from({ length: Math.min(count, names.length) }, (_, i) => amounts[i] ?? ''),
  }
}

/**
 * If PostInjection has no overlap with InputText, rebuild lists from InputText
 * so a sticky previous GH solve cannot poison the panel.
 */
export function reconcilePostInjectionWithInputText({
  postInjectionNames = [],
  postInjectionAmount = [],
  inputText = [],
  expectedCount = 0,
} = {}) {
  const names = normalizeGhStringList(postInjectionNames)
  const amounts = normalizeGhStringList(postInjectionAmount)
  const texts = normalizeGhStringList(inputText)

  if (!postInjectionLooksStale(names, texts)) {
    return {
      postInjectionNames: names,
      postInjectionAmount: amounts,
      stale: false,
    }
  }

  const derived = deriveFromInputText(
    texts,
    expectedCount || names.length || amounts.length,
  )
  return {
    postInjectionNames: derived.postInjectionNames,
    postInjectionAmount: derived.postInjectionAmount,
    stale: true,
  }
}
