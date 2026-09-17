/** Prefixed timing logs for nesting window performance tracing. */
const PREFIX = '[simpleparts-nesting]'

export function nestingLog(step: string, detail?: Record<string, unknown>) {
  if (detail) console.log(PREFIX, step, detail)
  else console.log(PREFIX, step)
}

export function nestingMark(step: string) {
  const started = performance.now()
  return (detail?: Record<string, unknown>) => {
    const ms = Math.round(performance.now() - started)
    nestingLog(step, { ms, ...detail })
    return ms
  }
}
