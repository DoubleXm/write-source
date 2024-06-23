import {
  effectScope,
  getCurrentInstance,
  inject,
  computed,
  reactive,
  isRef,
  isReactive,
  toRefs,
  watch,
} from 'vue';
import { piniaSymbol } from './global';
import { addSubScription, triggerSubscriptions } from './subscribe';
import { setActivePinia, activePinia } from './createPinia';

function isComputed(value) {
  return value && value.effect && isRef(value);
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function mergeReactiveObject(target, source) {
  for (const key in target) {
    const oldValue = target[key]; // 失去了响应式
    const newValue = source[key];

    if (isObject(oldValue) && isObject(newValue)) {
      mergeReactiveObject(oldValue, newValue);
    } else {
      target[key] = newValue;
    }
  }
}

// 调用方式
// 1. defineStore(id, options)
// 2. defineStore(options)
// 3. defineStore(id, setup)
export function defineStore(idOrOptions, setup) {
  let id;
  let options;

  if (typeof idOrOptions === 'string') {
    id = idOrOptions;
    options = setup;
  } else {
    options = idOrOptions;
    id = idOrOptions.id;
  }
  const isSetupStore = typeof setup === 'function';

  function useStore() {
    // 用户多次 use 时拿到的应该是同一个 store
    const instance = getCurrentInstance();
    // 用户 use 的时候拿到的是 pinia 对象
    let pinia = instance && inject(piniaSymbol);
    if (pinia) setActivePinia(pinia);

    pinia = activePinia;

    if (!pinia._s.has(id)) {
      if (isSetupStore) {
        // 创建 setupStore
        createSetupStore(id, setup, pinia);
      } else {
        // 第一次 useStore 创建映射关系
        createOpinionStore(id, options, pinia);
      }
    }

    const store = pinia._s.get(id);
    return store;
    // console.log(pinia);
  }

  return useStore; // 用户最终拿到的 store
}

function createOpinionStore(id, options, pinia) {
  const { state, getters, actions } = options;

  // 对用户传递的 state, getters, actions 进行处理
  function setup() {
    pinia.state.value[id] = state ? state() : {};
    const localState = toRefs(pinia.state.value[id]);

    return Object.assign(
      localState,
      actions,
      // getters 处理
      Object.keys(getters).reduce((memo, componentName) => {
        memo[componentName] = computed(() => {
          const store = pinia._s.get(id);
          return getters[componentName].call(store);
        });

        return memo;
      }, {})
    );
  }

  const store = createSetupStore(id, setup, pinia, true);

  store.$reset = function () {
    const newState = state ? state() : {};
    store.$patch((state) => {
      Object.assign(state, newState);
    });
  };

  return store;
}

function createSetupStore(id, setup, pinia, isOption) {
  let scope;

  function $patch(partialStateOrMutatior) {
    if (isObject(partialStateOrMutatior)) {
      mergeReactiveObject(pinia.state.value[id], partialStateOrMutatior);
    } else {
      partialStateOrMutatior(pinia.state.value[id]);
    }
  }

  function $subscribe(callback, options) {
    scope.run(() => {
      watch(
        () => pinia.state.value[id],
        (state) => {
          callback({ storeId: id, state });
        },
        { ...options, deep: true }
      );
    });
  }

  let actionSubscriptions = [];
  const partialStore = {
    $id: id,
    $patch,
    $subscribe,
    $onAction: addSubScription.bind(null, actionSubscriptions),
    $dispose() {
      scope.stop();
      pinia._s.delete(id);
      actionSubscriptions = [];
    },
  };

  const store = reactive(partialStore);
  const setupStore = pinia._e.run(() => {
    scope = effectScope();
    return scope.run(() => setup());
  });

  const initialState = pinia.state.value[id];
  // 如果是 setup api 并且没有 state 初始化一个值
  if (!initialState && !isOption) {
    pinia.state.value[id] = {};
  }

  for (const key in setupStore) {
    const prop = setupStore[key];
    if (typeof prop === 'function') {
      setupStore[key] = wrapActions(key, prop);
    }

    // 只要 ref 和 reactive 的值
    if ((isRef(prop) && !isComputed(prop)) || isReactive(prop)) {
      if (!isOption) {
        pinia.state.value[id][key] = prop;
      }
    }
  }

  Object.defineProperty(store, '$state', {
    get: () => pinia.state.value[id],
    set: (state) => {
      store.$patch(($state) => {
        Object.assign($state, state);
      });
    },
  });

  // 插件处理
  pinia._p.forEach((plugin) => {
    const extender = scope.run(() => plugin({ store, pinia }));
    store.$patch(() => {
      Object.assign(store, extender);
    });
  });

  function wrapActions(name, action) {
    return (...args) => {
      const afterCallbacks = [];
      const onErrorCallbacks = [];
      function after(callback) {
        afterCallbacks.push(callback);
      }
      function onError(callback) {
        onErrorCallbacks.push(callback);
      }

      triggerSubscriptions(actionSubscriptions, {
        name,
        store,
        args,
        after,
        onError,
      });

      let ret;
      try {
        ret = action.apply(store, args);
      } catch (e) {
        triggerSubscriptions(onErrorCallbacks, e);
      }

      if (ret instanceof Promise) {
        ret
          .then((res) => {
            return triggerSubscriptions(afterCallbacks, res);
          })
          .catch((e) => {
            triggerSubscriptions(onErrorCallbacks, e);
            return Promise.reject(e);
          });
      }

      triggerSubscriptions(afterCallbacks, ret);
      return ret;
    };
  }

  pinia._s.set(id, store);
  Object.assign(store, setupStore);
  return store;
}
