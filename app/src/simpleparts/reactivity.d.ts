export type Ref<T> = { value: T };
export type ComputedRef<T> = { readonly value: T };

export function ref<T>(value: T): Ref<T>;
export function computed<T>(getter: () => T): ComputedRef<T>;
export function watch<T>(
  source: Ref<T> | ComputedRef<T> | (() => T),
  callback: (value: T, previous: T | undefined) => void,
  options?: { immediate?: boolean; deep?: boolean },
): () => void;

export function createReactiveScope<T>(factory: () => T): {
  value: T;
  subscribe(listener: () => void): () => void;
  getSnapshot(): number;
  dispose(): void;
};
