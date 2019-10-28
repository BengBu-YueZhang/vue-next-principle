import { ref, effect, reactive, isRef, toRefs } from '../src/index'
import { computed } from '@vue/runtime-dom'

// function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
// type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>
// reactive的返回值类型UnwrapNestedRefs

// function ref<T>(raw: T): Ref<T>
// interface Ref<T = any> {
//   _isRef: true
//   value: UnwrapRef<T>
// }
// ref的返回值类型Ref

// ref和reactive作用是相似的，都是返回经过包装的响应式对象
// 但是reactive，要求参数必须是对象
// 而ref对参数没有限制

describe('reactivity/ref', () => {
  // ref会返回Ref对象，Ref对象的value值等于ref参数的值
  it('should hold a value', () => {
    const a = ref(1)
    expect(a.value).toBe(1)
    a.value = 2
    expect(a.value).toBe(2)
  })

  // 当effect的callback使用的响应数据发生变化的时候
  // effect的callback会重新执行
  it('should be reactive', () => {
    const a = ref(1)
    let dummy
    effect(() => {
      dummy = a.value
    })
    expect(dummy).toBe(1)
    a.value = 2
    expect(dummy).toBe(2)
  })

  // 当ref包装对象时，对象也具有响应数据，并且同样会触发effect的callback的执行
  it('should make nested properties reactive', () => {
    const a = ref({
      count: 1
    })
    let dummy
    effect(() => {
      dummy = a.value.count
    })
    expect(dummy).toBe(1)
    a.value.count = 2
    expect(dummy).toBe(2)
  })

  it('should work like a normal property when nested in a reactive object', () => {
    const a = ref(1)
    const obj = reactive({
      a,
      b: {
        c: a,
        d: [a]
      }
    })
    let dummy1
    let dummy2
    let dummy3
    effect(() => {
      // 注意，这里没有使用`obj.a.value`取值
      // 因为当reactive的参数不是Ref时
      // reactive会返回`UnwrapRef`类型的值
      // UnwrapRef会解开ref的包装
      dummy1 = obj.a
      dummy2 = obj.b.c
      dummy3 = obj.b.d[0]
    })
    expect(dummy1).toBe(1)
    expect(dummy2).toBe(1)
    expect(dummy3).toBe(1)
    a.value++
    expect(dummy1).toBe(2)
    expect(dummy2).toBe(2)
    expect(dummy3).toBe(2)
    // 修改reactive包装的对象，同样会触发effect的callback的执行
    obj.a++
    expect(dummy1).toBe(3)
    expect(dummy2).toBe(3)
    expect(dummy3).toBe(3)
  })

  // 展开嵌套引用
  it('should unwrap nested ref in types', () => {
    const a = ref(0)
    // const b: Ref<number>
    const b = ref(a)
    // 注意，这里没有使用b.value.value取值
    // ref并不会重复嵌套
    expect(typeof (b.value + 1)).toBe('number')
  })

  // 展开嵌套值
  it('should unwrap nested values in types', () => {
    const a = {
      b: ref(0)
    }

    const c = ref(a)
    // ref不会重复产生嵌套
    expect(typeof (c.value.b + 1)).toBe('number')
  })

  // 展开数组中的ref类型
  it('should properly unwrap ref types nested inside arrays', () => {
    const arr = ref([1, ref(1)]).value
    // should unwrap to number[]
    arr[0]++
    arr[1]++

    const arr2 = ref([1, new Map<string, any>(), ref('1')]).value
    const value = arr2[0]
    if (typeof value === 'string') {
      value + 'foo'
    } else if (typeof value === 'number') {
      value + 1
    } else {
      // should narrow down to Map type
      // and not contain any Ref type
      value.has('foo')
    }
  })

  test('isRef', () => {
    expect(isRef(ref(1))).toBe(true)
    // function computed<T>(getter: ComputedGetter<T>): ComputedRef<T>
    // interface ComputedRef<T> extends WritableComputedRef<T> {
    //   readonly value: UnwrapRef<T>
    // }
    // computed返回的也是Ref数据
    expect(isRef(computed(() => 1))).toBe(true)

    expect(isRef(0)).toBe(false)
    expect(isRef(1)).toBe(false)
    // an object that looks like a ref isn't necessarily a ref
    expect(isRef({ value: 0 })).toBe(false)
  })

  // function toRefs<T extends object>(object: T): { [K in keyof T]: Ref<T[K]>; }
  // toRefs会对象的第一层属性的value值，转换为Ref对象
  // toRefs({
  //   a: 1,
  //   b: '2',
  //   c: {
  //     a: 1
  //   }
  // })
  // {
  //   a: Ref<number>;
  //   b: Ref<string>;
  //   c: Ref<{
  //       a: number;
  //   }>;
  // }
  test('toRefs', () => {
    const a = reactive({
      x: 1,
      y: 2
    })

    const { x, y } = toRefs(a)
    // x, y都是Ref对象
    expect(isRef(x)).toBe(true)
    expect(isRef(y)).toBe(true)
    expect(x.value).toBe(1)
    expect(y.value).toBe(2)

    // 原对象的修改，会同步到Ref对象
    // source -> proxy
    a.x = 2
    a.y = 3
    expect(x.value).toBe(2)
    expect(y.value).toBe(3)

    // Ref对象的修改会同步到原对象
    // proxy -> source
    x.value = 3
    y.value = 4
    expect(a.x).toBe(3)
    expect(a.y).toBe(4)

    // reactivity
    let dummyX, dummyY
    effect(() => {
      dummyX = x.value
      dummyY = y.value
    })
    expect(dummyX).toBe(x.value)
    expect(dummyY).toBe(y.value)

    // mutating source should trigger effect using the proxy refs
    a.x = 4
    a.y = 5
    expect(dummyX).toBe(4)
    expect(dummyY).toBe(5)
  })
})
