import { ref, isRef } from '../src/ref'
import { reactive, isReactive, toRaw, markNonReactive } from '../src/reactive'
import { mockWarn } from '@vue/runtime-test'
import { computed } from '../src/computed'

// jest的部分API
// .toBe 使用Object.is比较两个对象是否一致
// .not.toBe 比较是否不一致
// .toEqual 进行深比较
// .toBeUndefined 判断是否为undefined

describe('reactivity/reactive', () => {
  mockWarn()

  // reactive的参数接受一个对象
  // reactive返回的结果对象。key-value应该与原数据一致
  // 但是两个对象之间是不同的引用
  test('Object', () => {
    const original = { foo: 1 }
    const observed = reactive(original)
    expect(observed).not.toBe(original)
    expect(isReactive(observed)).toBe(true)
    expect(isReactive(original)).toBe(false)
    // get
    expect(observed.foo).toBe(1)
    // has
    expect('foo' in observed).toBe(true)
    // ownKeys
    expect(Object.keys(observed)).toEqual(['foo'])
  })

  // 与Object的测试相同
  test('Array', () => {
    const original = [{ foo: 1 }]
    const observed = reactive(original)
    expect(observed).not.toBe(original)
    expect(isReactive(observed)).toBe(true)
    expect(isReactive(original)).toBe(false)
    // 数组中的每一个对象，也应当是响应的
    expect(isReactive(observed[0])).toBe(true)
    // get
    expect(observed[0].foo).toBe(1)
    // has
    expect(0 in observed).toBe(true)
    // ownKeys
    expect(Object.keys(observed)).toEqual(['0'])
  })

  test('cloned reactive Array should point to observed values', () => {
    const original = [{ foo: 1 }]
    const observed = reactive(original)
    const clone = observed.slice()
    expect(isReactive(clone[0])).toBe(true)
    expect(clone[0]).not.toBe(original[0])
    expect(clone[0]).toBe(observed[0])
  })

  // 测试如果嵌套的对象，对象中对象，对象中的数组，对象中的数组中的对象，都应当是响应的数据
  test('nested reactives', () => {
    const original = {
      nested: {
        foo: 1
      },
      array: [{ bar: 2 }]
    }
    const observed = reactive(original)
    expect(isReactive(observed.nested)).toBe(true)
    expect(isReactive(observed.array)).toBe(true)
    expect(isReactive(observed.array[0])).toBe(true)
  })

  // 测试当对响应对象进行突变操作（增加，删除属性）时，会同步到原始的数据
  test('observed value should proxy mutations to original (Object)', () => {
    const original: any = { foo: 1 }
    const observed = reactive(original)
    // set
    observed.bar = 1
    expect(observed.bar).toBe(1)
    expect(original.bar).toBe(1)
    // delete
    delete observed.foo
    expect('foo' in observed).toBe(false)
    expect('foo' in original).toBe(false)
  })

  // 对数组进行突变操作，会同步到原始的数据
  test('observed value should proxy mutations to original (Array)', () => {
    const original: any[] = [{ foo: 1 }, { bar: 2 }]
    const observed = reactive(original)
    // set
    const value = { baz: 3 }
    const reactiveValue = reactive(value)
    observed[0] = value
    expect(observed[0]).toBe(reactiveValue)
    expect(original[0]).toBe(value)
    // delete
    delete observed[0]
    expect(observed[0]).toBeUndefined()
    expect(original[0]).toBeUndefined()
    // mutating methods
    observed.push(value)
    expect(observed[2]).toBe(reactiveValue)
    expect(original[2]).toBe(value)
  })

  // 使用未监测的值设置属性时，属性值应当也是响应的
  test('setting a property with an unobserved value should wrap with reactive', () => {
    const observed = reactive<{ foo?: object }>({})
    const raw = {}
    observed.foo = raw
    expect(observed.foo).not.toBe(raw)
    // raw应当是响应的
    expect(isReactive(observed.foo)).toBe(true)
  })

  // 如果已经是响应对象，使用`reactive`再次包装时，应该直接返回响应对象
  test('observing already observed value should return same Proxy', () => {
    const original = { foo: 1 }
    const observed = reactive(original)
    const observed2 = reactive(observed)
    expect(observed2).toBe(observed)
  })

  // 多次包装同一个原始对象，返回的响应对象应当是相同的
  test('observing the same value multiple times should return same Proxy', () => {
    const original = { foo: 1 }
    const observed = reactive(original)
    const observed2 = reactive(original)
    expect(observed2).toBe(observed)
  })

  test('should not pollute original object with Proxies', () => {
    const original: any = { foo: 1 }
    const original2 = { bar: 2 }
    const observed = reactive(original)
    const observed2 = reactive(original2)
    observed.bar = observed2
    expect(observed.bar).toBe(observed2)
    expect(original.bar).toBe(original2)
  })

  // toRaw会根据响应对象，返回原始值
  test('unwrap', () => {
    const original = { foo: 1 }
    const observed = reactive(original)
    expect(toRaw(observed)).toBe(original)
    expect(toRaw(original)).toBe(original)
  })

  // 🤔️ref有什么作用？
  test('should not unwrap Ref<T>', () => {
    const observedNumberRef = reactive(ref(1))
    const observedObjectRef = reactive(ref({ foo: 1 }))

    expect(isRef(observedNumberRef)).toBe(true)
    expect(isRef(observedObjectRef)).toBe(true)
  })

  test('should unwrap computed refs', () => {
    // readonly
    const a = computed(() => 1)
    // writable
    const b = computed({
      get: () => 1,
      set: () => {}
    })
    const obj = reactive({ a, b })
    // check type
    obj.a + 1
    obj.b + 1
    expect(typeof obj.a).toBe(`number`)
    expect(typeof obj.b).toBe(`number`)
  })

  test('non-observable values', () => {
    const assertValue = (value: any) => {
      reactive(value)
      expect(
        `value cannot be made reactive: ${String(value)}`
      ).toHaveBeenWarnedLast()
    }
    // number, string, boolean, null, undefined, symbol不能成为响应的对象
    // number
    assertValue(1)
    // string
    assertValue('foo')
    // boolean
    assertValue(false)
    // null
    assertValue(null)
    // undefined
    assertValue(undefined)
    // symbol
    const s = Symbol()
    assertValue(s)

    // built-ins should work and return same value
    // Promise, RegExp, Date, reactive会直接返回原始对象
    const p = Promise.resolve()
    expect(reactive(p)).toBe(p)
    const r = new RegExp('')
    expect(reactive(r)).toBe(r)
    const d = new Date()
    expect(reactive(d)).toBe(d)
  })

  // 使用markNonReactive包装的对象，不会成为响应对象
  test('markNonReactive', () => {
    const obj = reactive({
      foo: { a: 1 },
      bar: markNonReactive({ b: 2 })
    })
    expect(isReactive(obj.foo)).toBe(true)
    expect(isReactive(obj.bar)).toBe(false)
  })
})
