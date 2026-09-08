let activeWatcher = null
let activeScope = null

export function createReactiveScope(factory) {
  const previous = activeScope
  const scope = {
    listeners: new Set(),
    stops: [],
    version: 0,
    emit() {
      scope.version += 1
      for (const listener of scope.listeners) listener()
    },
  }
  activeScope = scope
  const value = factory()
  activeScope = previous
  return {
    value,
    subscribe(listener) {
      scope.listeners.add(listener)
      return () => scope.listeners.delete(listener)
    },
    getSnapshot() {
      return scope.version
    },
    dispose() {
      for (const stop of scope.stops) stop()
      scope.stops = []
      scope.listeners.clear()
    },
  }
}

export function ref(initialValue) {
  const watchers = new Set()
  const scope = activeScope
  const proxies = new WeakMap()

  function trigger() {
    for (const watcher of [...watchers]) watcher.schedule()
    scope?.emit()
  }

  function wrap(value) {
    if (!value || typeof value !== 'object') return value
    const prototype = Object.getPrototypeOf(value)
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value
    if (proxies.has(value)) return proxies.get(value)
    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        return wrap(Reflect.get(target, key, receiver))
      },
      set(target, key, next, receiver) {
        const previous = Reflect.get(target, key, receiver)
        const changed = !Object.is(previous, next)
        const result = Reflect.set(target, key, next, receiver)
        if (changed) trigger()
        return result
      },
      deleteProperty(target, key) {
        const existed = Reflect.has(target, key)
        const result = Reflect.deleteProperty(target, key)
        if (existed) trigger()
        return result
      },
    })
    proxies.set(value, proxy)
    return proxy
  }

  let current = wrap(initialValue)
  return {
    get value() {
      if (activeWatcher) {
        watchers.add(activeWatcher)
        activeWatcher.deps.add(watchers)
      }
      return current
    },
    set value(next) {
      if (Object.is(current, next)) return
      current = wrap(next)
      trigger()
    },
  }
}

export function computed(getter) {
  return {
    get value() {
      return getter()
    },
  }
}

export function watch(source, callback, options = {}) {
  const getter = typeof source === 'function' ? source : () => source.value
  let oldValue
  let queued = false
  let stopped = false

  const watcher = {
    deps: new Set(),
    schedule() {
      if (queued || stopped) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (!stopped) run(false)
      })
    },
  }

  function cleanup() {
    for (const dep of watcher.deps) dep.delete(watcher)
    watcher.deps.clear()
  }

  function evaluate() {
    cleanup()
    const previous = activeWatcher
    activeWatcher = watcher
    try {
      return getter()
    } finally {
      activeWatcher = previous
    }
  }

  function snapshot(value) {
    if (!options.deep) return value
    try {
      return JSON.stringify(value)
    } catch {
      return value
    }
  }

  function run(initial) {
    const value = evaluate()
    const comparable = snapshot(value)
    if (initial) {
      oldValue = comparable
      if (options.immediate) callback(value, undefined)
      return
    }
    if (options.deep || !Object.is(comparable, oldValue)) {
      const previous = oldValue
      oldValue = comparable
      callback(value, previous)
    }
  }

  run(true)
  const stop = () => {
    stopped = true
    cleanup()
  }
  activeScope?.stops.push(stop)
  return stop
}
