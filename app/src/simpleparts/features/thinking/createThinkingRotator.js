import { ERROR_LINE, PART_N } from './thinkingMessages.js'

const DEFAULT_MIN_MS = 1800
const DEFAULT_MAX_MS = 2800
const DEFAULT_FAIL_PAUSE_MS = 700
const PART_MIN = 3
const PART_MAX = 80

/**
 * @param {object} [options]
 * @param {number} [options.minMs]
 * @param {number} [options.maxMs]
 * @param {number} [options.failPauseMs]
 * @param {() => number} [options.random] — injectable RNG in [0, 1)
 * @param {(fn: () => void, ms: number) => ReturnType<typeof setTimeout>} [options.setTimeout]
 * @param {(id: ReturnType<typeof setTimeout>) => void} [options.clearTimeout]
 */
export function createThinkingRotator({
  minMs = DEFAULT_MIN_MS,
  maxMs = DEFAULT_MAX_MS,
  failPauseMs = DEFAULT_FAIL_PAUSE_MS,
  random = Math.random,
  setTimeout: schedule = setTimeout,
  clearTimeout: cancel = clearTimeout,
} = {}) {
  let timerId = null
  let stopped = true
  let pool = []
  let index = 0
  let partCounter = PART_MIN
  /** @type {((msg: string) => void) | null} */
  let onMessage = null

  function jitterDelay() {
    const span = Math.max(0, maxMs - minMs)
    return minMs + Math.floor(random() * (span + 1))
  }

  function nextPartNumber() {
    const n = partCounter
    partCounter = n >= PART_MAX ? PART_MIN + Math.floor(random() * 5) : n + 1 + Math.floor(random() * 3)
    return n
  }

  function materialize(line) {
    if (!line.includes(PART_N)) return line
    return line.split(PART_N).join(String(nextPartNumber()))
  }

  function emitCurrent() {
    if (!onMessage || !pool.length) return
    onMessage(materialize(pool[index % pool.length]))
  }

  function clearTimer() {
    if (timerId != null) {
      cancel(timerId)
      timerId = null
    }
  }

  function scheduleNext() {
    clearTimer()
    if (stopped) return
    timerId = schedule(() => {
      timerId = null
      if (stopped || !pool.length) return
      index = (index + 1) % pool.length
      emitCurrent()
      scheduleNext()
    }, jitterDelay())
  }

  /**
   * @param {{ pool: string[], onMessage: (msg: string) => void }} opts
   */
  function start({ pool: nextPool, onMessage: nextOnMessage }) {
    stop()
    pool = Array.isArray(nextPool) && nextPool.length ? [...nextPool] : [ERROR_LINE]
    onMessage = nextOnMessage
    index = 0
    partCounter = PART_MIN + Math.floor(random() * 8)
    stopped = false
    emitCurrent()
    scheduleNext()
  }

  function stop() {
    stopped = true
    clearTimer()
  }

  /** Stop rotation, show error line, pause briefly so UI can show it. */
  async function fail() {
    stop()
    if (onMessage) onMessage(ERROR_LINE)
    await new Promise((resolve) => {
      schedule(resolve, failPauseMs)
    })
  }

  return { start, stop, fail }
}
