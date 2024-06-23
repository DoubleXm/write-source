import { ref, effectScope } from 'vue';
import { piniaSymbol } from './global';

export let activePinia = {};
export const setActivePinia = (pinia) => (activePinia = pinia);

export function createPinia() {
  // $dispose() 用来销毁 effectScope
  const scope = effectScope(true);

  // 用来存储每个 store 的 state
  const state = scope.run(() => ref({}));

  const pinia = {
    // 用 map 存放所有的 store
    _s: new Map(),
    _e: scope,
    use(plugin) {
      pinia._p.push(plugin);
      // 链式调用
      return this;
    },
    _p: [],
    install(app) {
      // 希望 pinia 去管理所有的 store
      // pinia 要去收集所有的 store

      // 让所有的 store 都能获取 pinia 对象 _s
      app.provide(piniaSymbol, this);
    },
    state,
  };

  return pinia;
}

/**
 * createPinia 默认提供一个 install 方法
 * _s 用来存放所有的 store  { id: store }
 * state 用来存储所有状态
 * _e 用来存储 effectScope
 */
