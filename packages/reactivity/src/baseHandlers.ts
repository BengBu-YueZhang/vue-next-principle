import { reactive, readonly, toRaw } from './reactive'
import { OperationTypes } from './operations'
import { track, trigger } from './effect'
import { LOCKED } from './lock'
import { isObject, hasOwn, isSymbol, hasChanged } from '@vue/shared'
import { isRef } from './ref'

const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

function createGetter(isReadonly: boolean) {
  return function get(target: object, key: string | symbol, receiver: object) {
    const res = Reflect.get(target, key, receiver)
    if (isSymbol(key) && builtInSymbols.has(key)) {
      return res
    }
    if (isRef(res)) {
      return res.value
    }
    // OperationTypes.GET => get
    // 🤔️track(target, 'get', key)，这里应该和effect相关？
    track(target, OperationTypes.GET, key)
    return isObject(res)
      ? isReadonly
        ? // need to lazy access readonly and reactive here to avoid
          // circular dependency
          readonly(res)
        : // 如果res的值是Object，使用`reactive`对Object进行包装，返回响应式对象
          reactive(res)
      : res
  }
}

function set(
  target: object,
  key: string | symbol,
  value: unknown,
  receiver: object
): boolean {
  value = toRaw(value)
  // 之前target上的value值
  const oldValue = (target as any)[key]
  if (isRef(oldValue) && !isRef(value)) {
    oldValue.value = value
    return true
  }
  // 判断key是否存在在target对象上
  const hadKey = hasOwn(target, key)
  const result = Reflect.set(target, key, value, receiver)
  // don't trigger if target is something up in the prototype chain of original

  // 这句注释是什么意思？
  // 举一个例子
  // const childProxy = new Proxy({
  //   name: 'Atreus'
  // }, {
  //   set(target, key, value, receiver) {
  //     console.log('触发Atreus的set')
  //     return Reflect.set(target, key, value, receiver)
  //   }
  // })
  // const parentProxy = new Proxy({
  //   name: 'Kratos'
  // }, {
  //   set(target, key, value, receiver) {
  //     console.log('触发Kratos的set')
  //     return Reflect.set(target, key, value, receiver)
  //   }
  // })
  // Object.setPrototypeOf(childProxy, parentProxy)
  // childProxy.age = 8
  // 依次触发，Atreus，Kratos的set，但是我们并没有对parentProxy进行set操作
  // 此时虽然触发了Kratos的set，但是receiver是指向childProxy
  // 我们可以通过判断`target === toRaw(receiver)`，避免其他原因引起的set操作造成的影响

  if (target === toRaw(receiver)) {
    /* istanbul ignore else */
    // 判断是否为开发环境
    if (__DEV__) {
      const extraInfo = { oldValue, newValue: value }
      // 如果key已经存在在target对象上
      // trigger的第二个参数为，set的操作类型
      // 如果key之前不存在在target对象上
      // trigger的第二个参数为，add的操作类型
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key, extraInfo)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, OperationTypes.SET, key, extraInfo)
      }
    } else {
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, OperationTypes.SET, key)
      }
    }
  }
  return result
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.DELETE, key, { oldValue })
    } else {
      trigger(target, OperationTypes.DELETE, key)
    }
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  track(target, OperationTypes.HAS, key)
  return result
}

function ownKeys(target: object): (string | number | symbol)[] {
  track(target, OperationTypes.ITERATE)
  return Reflect.ownKeys(target)
}

export const mutableHandlers: ProxyHandler<object> = {
  get: createGetter(false), // get 拦截，并主动执行createGetter函数
  set, // set 拦截
  deleteProperty, // delete 拦截
  has, // in 拦截
  ownKeys // Object.getOwnPropertyNames Object.getOwnPropertySymbols Object.keys for…in 拦截
}

export const readonlyHandlers: ProxyHandler<object> = {
  get: createGetter(true),

  set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Set operation on key "${String(key)}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return set(target, key, value, receiver)
    }
  },

  deleteProperty(target: object, key: string | symbol): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Delete operation on key "${String(
            key
          )}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return deleteProperty(target, key)
    }
  },

  has,
  ownKeys
}
