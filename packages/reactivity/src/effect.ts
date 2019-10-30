import { OperationTypes } from "./operations";
import { Dep, targetMap } from "./reactive";
import { EMPTY_OBJ, extend } from "@vue/shared";

export interface ReactiveEffect<T = any> {
  (): T;
  _isEffect: true;
  active: boolean;
  raw: () => T;
  deps: Array<Dep>;
  computed?: boolean;
  scheduler?: (run: Function) => void;
  onTrack?: (event: DebuggerEvent) => void;
  onTrigger?: (event: DebuggerEvent) => void;
  onStop?: () => void;
}

export interface ReactiveEffectOptions {
  lazy?: boolean;
  computed?: boolean;
  scheduler?: (run: Function) => void;
  onTrack?: (event: DebuggerEvent) => void;
  onTrigger?: (event: DebuggerEvent) => void;
  onStop?: () => void;
}

export type DebuggerEvent = {
  effect: ReactiveEffect;
  target: object;
  type: OperationTypes;
  key: any;
} & DebuggerEventExtraInfo;

export interface DebuggerEventExtraInfo {
  newValue?: any;
  oldValue?: any;
  oldTarget?: Map<any, any> | Set<any>;
}

// effect的堆栈
export const effectStack: ReactiveEffect[] = [];

export const ITERATE_KEY = Symbol("iterate");

export function isEffect(fn: any): fn is ReactiveEffect {
  return fn != null && fn._isEffect === true;
}

export function effect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions = EMPTY_OBJ
): ReactiveEffect<T> {
  if (isEffect(fn)) {
    fn = fn.raw;
  }
  const effect = createReactiveEffect(fn, options);
  // 如果没有设置lazy选项，或者lazy设置为flase，effect在创建时，需要先执行一遍
  if (!options.lazy) {
    effect();
  }
  return effect;
}

export function stop(effect: ReactiveEffect) {
  if (effect.active) {
    cleanup(effect);
    if (effect.onStop) {
      effect.onStop();
    }
    effect.active = false;
  }
}

function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  const effect = function reactiveEffect(...args: unknown[]): unknown {
    return run(effect, fn, args);
  } as ReactiveEffect;

  effect._isEffect = true; // 是否为effect函数
  effect.active = true;
  effect.raw = fn; // effect的callback，第一个参数
  // effect的options选项
  effect.scheduler = options.scheduler;
  effect.onTrack = options.onTrack;
  effect.onTrigger = options.onTrigger;
  effect.onStop = options.onStop;
  effect.computed = options.computed;
  // 🤔️
  effect.deps = [];
  return effect;
}

function run(effect: ReactiveEffect, fn: Function, args: unknown[]): unknown {
  if (!effect.active) {
    return fn(...args);
  }
  if (!effectStack.includes(effect)) {
    cleanup(effect);
    try {
      // 将effect添加到effectStack的堆栈中
      effectStack.push(effect);
      // 执行effect的callback
      return fn(...args);
    } finally {
      // 🤔️
      // callback执行完成后，都会清空堆栈
      effectStack.pop();
    }
  }
}

function cleanup(effect: ReactiveEffect) {
  const { deps } = effect;
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect);
    }
    deps.length = 0;
  }
}

let shouldTrack = true;

export function pauseTracking() {
  shouldTrack = false;
}

export function resumeTracking() {
  shouldTrack = true;
}

// 执行effect的callback时，会通过track收集依赖, 如果lazy设置为false呢？
// lazy设置为false，比如computed，会在使用getter时，进行收集依赖的操作
export function track(target: object, type: OperationTypes, key?: unknown) {
  if (!shouldTrack || effectStack.length === 0) {
    // 避免重复收集依赖
    return;
  }
  // effect是当前正在执行的effect(为什么从堆栈的顶部拿，因为可能存在effect嵌套的情况？我还没有进行实验)
  const effect = effectStack[effectStack.length - 1];
  if (type === OperationTypes.ITERATE) {
    key = ITERATE_KEY;
  }
  let depsMap = targetMap.get(target);
  if (depsMap === void 0) {
    targetMap.set(target, (depsMap = new Map()));
  }
  let dep = depsMap.get(key!);
  // 收集依赖
  // targetMap<原对象, depsMap<key, dep[effect1, effect2, effect3]>>
  // 使用set可以避免重复添加effect
  if (dep === void 0) {
    depsMap.set(key!, (dep = new Set()));
  }
  if (!dep.has(effect)) {
    dep.add(effect);
    effect.deps.push(dep); // ?
    if (__DEV__ && effect.onTrack) {
      effect.onTrack({
        effect,
        target,
        type,
        key
      });
    }
  }
}

export function trigger(
  target: object,
  type: OperationTypes,
  key?: unknown,
  extraInfo?: DebuggerEventExtraInfo
) {
  // 通过原对象和targetMap的映射，找到Map<any, Dep>
  const depsMap = targetMap.get(target);
  // 如果depsMap是undefined, 说明target不是被代理的对象
  if (depsMap === void 0) {
    // never been tracked
    return;
  }
  const effects = new Set<ReactiveEffect>();
  const computedRunners = new Set<ReactiveEffect>();

  if (type === OperationTypes.CLEAR) {
    // collection being cleared, trigger all effects for target
    depsMap.forEach(dep => {
      addRunners(effects, computedRunners, dep);
    });
  } else {
    // schedule runs for SET | ADD | DELETE
    // set会触发一次 addRunners
    // add，delete会触发两次 addRunners
    if (key !== void 0) {
      // 所有与改depsMap.get(key)相关的effect的Set集合
      addRunners(effects, computedRunners, depsMap.get(key));
    }
    // also run for iteration key on ADD | DELETE
    if (type === OperationTypes.ADD || type === OperationTypes.DELETE) {
      const iterationKey = Array.isArray(target) ? "length" : ITERATE_KEY;
      addRunners(effects, computedRunners, depsMap.get(iterationKey));
    }
  }
  const run = (effect: ReactiveEffect) => {
    scheduleRun(effect, target, type, key, extraInfo);
  };
  // Important: computed effects must be run first so that computed getters
  // can be invalidated before any normal effects that depend on them are run.
  computedRunners.forEach(run);
  effects.forEach(run);
}

function addRunners(
  effects: Set<ReactiveEffect>,
  computedRunners: Set<ReactiveEffect>,
  effectsToAdd: Set<ReactiveEffect> | undefined
) {
  if (effectsToAdd !== void 0) {
    effectsToAdd.forEach(effect => {
      // 将key所依赖的effect，添加到computedRunners和effects中
      // 这里涉及到了computed的内容，先暂停
      if (effect.computed) {
        computedRunners.add(effect);
      } else {
        effects.add(effect);
      }
    });
  }
}

function scheduleRun(
  effect: ReactiveEffect,
  target: object,
  type: OperationTypes,
  key: unknown,
  extraInfo?: DebuggerEventExtraInfo
) {
  if (__DEV__ && effect.onTrigger) {
    const event: DebuggerEvent = {
      effect,
      target,
      key,
      type
    };
    effect.onTrigger(extraInfo ? extend(event, extraInfo) : event);
  }
  if (effect.scheduler !== void 0) {
    effect.scheduler(effect);
  } else {
    effect();
  }
}
