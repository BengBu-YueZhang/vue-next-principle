import { isObject, toRawType } from '@vue/shared'
import { mutableHandlers, readonlyHandlers } from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers
} from './collectionHandlers'
import { ReactiveEffect } from './effect'
import { UnwrapRef, Ref } from './ref'
import { makeMap } from '@vue/shared'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.

export type Dep = Set<ReactiveEffect>
export type KeyToDepMap = Map<any, Dep>

// <原对象, Map<any, Set<ReactiveEffect>>
export const targetMap = new WeakMap<any, KeyToDepMap>()

// WeakMaps that store {raw <-> observed} pairs.
// <原对象，代理对象> 映射
const rawToReactive = new WeakMap<any, any>()
// <代理对象，原对象> 映射
const reactiveToRaw = new WeakMap<any, any>()
// <原对象，代理对象> 映射
const rawToReadonly = new WeakMap<any, any>()
// <代理对象，原对象> 映射
const readonlyToRaw = new WeakMap<any, any>()

// WeakSets for values that are marked readonly or non-reactive during
// observable creation.
const readonlyValues = new WeakSet<any>()
const nonReactiveValues = new WeakSet<any>()

const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
const isObservableType = /*#__PURE__*/ makeMap(
  'Object,Array,Map,Set,WeakMap,WeakSet'
)

const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    isObservableType(toRawType(value)) &&
    !nonReactiveValues.has(value)
  )
}

// only unwrap nested ref
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>

export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  if (readonlyToRaw.has(target)) {
    return target
  }
  // target is explicitly marked as readonly by user
  if (readonlyValues.has(target)) {
    return readonly(target)
  }
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>> {
  // value is a mutable observable, retrieve its original and return
  // a readonly version.
  if (reactiveToRaw.has(target)) {
    target = reactiveToRaw.get(target)
  }
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

function createReactiveObject(
  target: unknown,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  // 如果target不是一个对象，发出警告
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  // target already has corresponding Proxy
  // 如果target已经被代理，直接返回代理对象
  let observed = toProxy.get(target)
  if (observed !== void 0) {
    return observed
  }
  // target is already a Proxy
  // 如果对象本身就是一个代理对象，直接返回它
  if (toRaw.has(target)) {
    return target
  }
  // only a whitelist of value types can be observed.
  if (!canObserve(target)) {
    return target
  }
  // 如果`target`是Set, Map, WeakMap, WeakSet。handlers等于collectionHandlers
  // 否则handlers等于mutableHandlers
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
  // 对target使用Proxy进行代理
  observed = new Proxy(target, handlers)
  // rawToReactive，rawToReadonly是<原对象，代理对象>之间的映射
  toProxy.set(target, observed)
  // reactiveToRaw，readonlyToRaw是<代理对象，原对象>之间的映射
  toRaw.set(observed, target)
  // targetMap <原对象, Map[]>之间的映射
  if (!targetMap.has(target)) {
    targetMap.set(target, new Map())
  }
  return observed
}

export function isReactive(value: unknown): boolean {
  return reactiveToRaw.has(value) || readonlyToRaw.has(value)
}

export function isReadonly(value: unknown): boolean {
  return readonlyToRaw.has(value)
}

export function toRaw<T>(observed: T): T {
  // reactiveToRaw和readonlyToRaw是，<代理对象，源对象>，之间的映射，如果存在映射返回原对象
  // 直接返回原对象
  return reactiveToRaw.get(observed) || readonlyToRaw.get(observed) || observed
}

export function markReadonly<T>(value: T): T {
  readonlyValues.add(value)
  return value
}

export function markNonReactive<T>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
