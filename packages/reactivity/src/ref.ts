import { track, trigger } from './effect'
import { OperationTypes } from './operations'
import { isObject } from '@vue/shared'
import { reactive } from './reactive'
import { ComputedRef } from './computed'
import { CollectionTypes } from './collectionHandlers'

export interface Ref<T = any> {
  _isRef: true
  value: UnwrapRef<T>
}

// 🤔️T extends unknown，除了T为never时，T都是满足约束的
// 如果val时Object，返回reactive(val)包装的响应对象，否则直接返回val
const convert = <T extends unknown>(val: T): T =>
  isObject(val) ? reactive(val) : val

// ref重载列表
// 1. 如果参数是Ref对象，返回值同样是Ref对象
// 2. 如果参数不是Ref对象，返回值为Ref对象
export function ref<T extends Ref>(raw: T): T
export function ref<T>(raw: T): Ref<T>
export function ref(raw: unknown) {
  // 如果是Ref对象，直接返回
  // it('should unwrap nested ref in types')验证了这一点
  if (isRef(raw)) {
    return raw
  }
  // 转换为经过reactive包装的响应对象
  // 🤔️reactive是什么？
  raw = convert(raw)
  const r = {
    _isRef: true,
    get value() {
      track(r, OperationTypes.GET, '')
      return raw
    },
    set value(newVal) {
      raw = convert(newVal)
      trigger(r, OperationTypes.SET, '')
    }
  }
  return r as Ref
}

export function isRef(r: any): r is Ref {
  return r ? r._isRef === true : false
}

export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  const ret: any = {}
  for (const key in object) {
    ret[key] = toProxyRef(object, key)
  }
  return ret
}

function toProxyRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): Ref<T[K]> {
  return {
    _isRef: true,
    get value(): any {
      return object[key]
    },
    set value(newVal) {
      object[key] = newVal
    }
  }
}

// Recursively unwraps nested value bindings.
export type UnwrapRef<T> = {
  cRef: T extends ComputedRef<infer V> ? UnwrapRef<V> : T
  ref: T extends Ref<infer V> ? UnwrapRef<V> : T
  array: T extends Array<infer V> ? Array<UnwrapRef<V>> : T
  object: { [K in keyof T]: UnwrapRef<T[K]> }
}[T extends ComputedRef<any>
  ? 'cRef'
  : T extends Ref
    ? 'ref'
    : T extends Array<any>
      ? 'array'
      : T extends Function | CollectionTypes
        ? 'ref' // bail out on types that shouldn't be unwrapped
        : T extends object ? 'object' : 'ref']
