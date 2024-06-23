### 与 vuex 本质的不同 

- pinia 默认支持多仓库，将所有的仓库拍平（扁平化），每个状态都可以是单独的 store
- vuex 典型的单仓库，会导致所有的状态都放在 store 中，使用模块（命名空间）来区分不同的 store。树状结构不好维护；

- 解决 vuex 中状态流的问题；fulx 思想

### 实现 createPinia

创建 `src/pinia/createPinia.js`

```js
import { ref, effectScope } from 'vue';

const piniaSymbol = Symbol('pinia');
export function createPinia() {
  // 考虑到 $dispose 方法的实现, 需要使用 effectScope 管理所有的 state
  const scope = effectScope(true);
  // 全局的 state 
  const state = scope.run(() => ref({}));

  const pinia = {
    _s: new Map(); // 用 map 数据结构存储所有的 store { id: store }
    _e: scope,
    install(app) {
      // 将 pinia 共享给所有的 store, 主要是让它们获取到 _s
      app.provide(piniaSymbol, this);
    },
    state
  }

  return pinia;
}
```

### 实现 defineStore 

确认 defineStore 的定义方式有三种，如下：

```js
// 1. defineStore(id, options)
// 2. defineStore(id, setup)
// 3. defineStore(options)
```

第二点需要确认，只有当用户在组件中使用 `useXxStore()` 时，`store` 中的数据才会被注入，所以 `defineStore` 应该返回一个函数。具体实现如下：

```js
export function defineStore(idOrOptions, setup) {
  let id;
  let options;

  // 判定用户使用了 options api
  if (typeof idOrOptions === 'string') {
    id = idOrOptions;
    options = setup;
  } else {
    options = idOrOptions;
    id = idOrOptions.id
  }

  const isSetupStore = typeof setup === 'function'

  function useStore() {
    const instance = getCurrentInstance();
    // 当用户在组件内 use 的时候，拿到 pinia 对象。
    const pinia = instance && inject(piniaSymbol);

    // 判定用户是否是第一次 use
    if (!pinia._s.has(id)) {
      if (isSetupStore) {
        // 对 setup 进行处理
        createSetupStore(id, setup, pinia);
      } else {
        // 对 options 进行处理
        createOptionStore(id, options, pinia);
      }
    }

    const store = pinia._s.get(id);
    return store;
  }

  // 用户最终 use 的 store
  return useStore;
}
```

### optionsStore

对于 `options` 的处理，核心就是将其变更为 `setup` 函数，最终和 `setup` 方式的 `store` 放在一起进行下一步的处理。

```js
function createOptionStore(id, options, pinia) {
  const { state, getters, actions } = options;
  let scope;

  // 用于存放非用户的属性及方法
  const store = reactive({});

  // 用于存放用户的属性及方法, 考虑到后续的停止响应式, 每个 store 都是一个响应式作用域
  // pinia_e.stop 可以停止所有的 store
  // scope.stop 停止当前 store
  const setupStore = pinia_e.run(() => {
    scope = effectScope();
    return scope.run(() => setup());
  })

  // 对用户的 state, getters, actions 处理 (核心)
  function setup() {
    // 将 state 处理成 ref
    pinia.state.value[id] = state ? state() : {};
    const localState = toRefs(pinia.state.value[id]);

    return Object.assign(
      localState,
      actions,
      // 将 getters 转换成 computed
      Object.keys(getters).reduce((memo, computedName) => {
        memo[computedName] = computed(() => {
          // 保证 this 不会丢失
          return memo[computedName].call(store);
        });
        return memo;
      }, {})
    )
  }

  for (let key in setupStore) {
    if (typeof setupStore[key] === 'function') {
      setupStore[key] = wrapActions(key, setupStore[key]);
    }
  }

  function wrapActions(name, action) {
    return (...args) => {
      // 处理用户因为结构导致的 action this 丢失
      const ret = action.apply(store, args);

      // TODO 如果 action 是 promise 也需要处理
      return ret;
    }
  }

  // 创建关联关系
  pinia._s.set(id, store);

  Object.assign(store, setupStore);
  return store;
}
```

### setupStore

总结 `optionsStore` 做的事情就是

 - 创建非用户的 `store`
 - 创建用户的 `store`
 - 将 `options` 处理成 `setup` 函数，放在 `effectScope` 中执行。
 - 合并两个 `store` 最终返回

试想如果用户直接传入 `setup` 是不是除了第三步的操作，其他都可以被复用；

将逻辑抽离成 `createSetupStore` 复用，一方面为 `createOptionsStore` 使用，另一方面也是处理用户的 `setup` 方法。

```js
const isComputed = (v) => v && isRef(v) && v.effect; 

function createSetupStore(id, setup, pinia, isOption) {
  let scope;

  const store = reactive({});
  const setupStore = pinia_e.run(() => {
    scope = effectScope();
    return scope.run(() => setup());
  });

  // 当是 setupApi 的时候，需要给这个 store 设置 state, 
  // 不存在的时候先给设置一个初始值
  // createOptionsStore 的 setup 中已经设置过了，不需要考虑
  const initialState = pinia.state.value[id];
  if (!initialState && !isOption) {
    pinia.state.value[id] = {};
  }

  for (let key in setupStore) {
    const prop = setupStore[key];
    if (typeof prop === 'function') {
      setupStore[key] === wrapActions(key, prop);
    }

    // computed 也是 ref 所以要手动判断，过滤掉 computed
    if ((isRef(prop) && !isComputed(prop)) || isReactive(prop)) {
      if (!isOption) {
        pinia.state.value[id][key] = prop;
      }
    }
  }

  function wrapActions(name, action) {
    return (...args) => {
      const ret = action.apply(store, args);
      return ret;
    }
  }

  pinia._s.set(id, store);
  Object.assign(store, setupStore);

  return store;
}
```

改写 `createOptionsStore` 方法

```js
function createOptionsStore(id, options, pinia) {
  const { state, getters, actions } = options;

  function setup() {
    pinia.state.value[id] = state ? state() : {};
    const localState = toRefs(pinia.state.value[id]);

    return Object.assign(
      localState,
      actions,
      Object.keys(getters).reduce((memo, computedName) => {
        memo[computedName] = computed(() => {
          // 需要注意的是这里要在 pinia 上面获取 store, 因为是引用类型，所以不用担心获取不到
          const store = pinia_s.get(id);
          return memo[computedName].call(store);
        });

        return memo;
      }, {})
    )
  }

  return createSetupStore(id, setup, pinia, true);
}
```

## API 实现

### $patch

`$patch` 批量更新状态, 同一时间更改多个属性；在 timeline 中也不会出现多余的操作（虽然 vue3 现在并没有体现）

使用方法示例如下：

```js
store.$patch({ count: 1000 });

store.$patch((state) => {
  state.count += 100;
});
```

在 `createSetupStore` 中声明了两个 `store` (用户的与非用户的)。这些内部的 `api` 就统统放在非用户 `store`。改写此方法如下：

```js
const isObject = (o) => typeof o === 'object' && o !== null;

function mergeReactiveObject(target, patchToApply) {
  for (let key in target) {
    const oldValue = target[key];
    const newValue = patchToApply[key];

    if (isObjecy(oldValue) && isObject(newValue)) {
      mergeReactiveObject(oldValue, newValue);
    } else {
      target[key] = newValue;
    }
  }
}

function createSetupStore(id, setup, options, isOption) {
  // ... ...

  function $patch(partialStateOrMutatior) {
    if (typeof partialStateOrMutatior === 'object') {
      // 合并对象 (简单实现，不考虑全部场景)
      mergeReactiveObject(pinia.state.value[id], partialStateOrMutatior);
    } else {
      partialStateOrMutatior(pinia.state.value[id]);
    }
  }

  const partialStore = {
    $patch
  }

  // 非用户 store
  const store = reactive(partialStore);

  // ... ...
}
```

### $reset

该 `api` 仅支持 `options api`, `setup api` 你可以自己声明 `$reset` 方法。内部实际上就是重新调用一下 `state()` 方法创建出一个新的状态，覆盖老的状态；

重写 `createOptionsStore` 方法。

```js
function createOptionsStore(id, options, pinia) {
  // ... ...

  const store = createSetupStore(id, options, pinia, true);

  store.$reset = function () {
    // 拿到最开始的 state
    const newState = state ? state() : {};
    pinia.$patch((state) => {
      Object.assign(state, newState);
    });
  }

  return store;
}
```

### $subscribe

订阅 `state` 中的变化，并且触发，与 `watch` 一个 `state` 的区别就是，在 `patch` 后该订阅只会触发一次; 底层实际也是 `watch` 实现。

`createSetupStore` 中增加该方法。

```js
function createSetupStore(id, setup, pinia, isOption) {
  let scope;
  const partialStore = {
    $patch,
    $subscribe
  }

  function $subscribe(callback, options = {}) {
    scope.run(() => {
      watch(() => pinia.state.value[id], (state) => {
        callback({ storeId: id, state });
      }, { ...options, deep: true });
    });
  }

  const store = reactive(partialStore);
  // ... ...
}
```

### $onAction

[文档](https://pinia.vuejs.org/zh/core-concepts/actions.html#subscribing-to-actions) 监听 `action` 和它的调用，接受一个回调，会在 `action` 调用之前被执行，回调中可以 `after`, `onError` 钩子及 `actionName`, `store` (当前的实例), `args` (传递给 action 的参数)。

这很明显是一个发布订阅, 在 `onAction` 的时候订阅，然后在用户的 `actions` 调用时做出一些处理。

```js
// subscribe.js
function addSubscription(subscriptions, callback) {
  subscriptions.push(callback);
}

function triggerSubscription(subscriptions, ...args) {
  subscriptions.forEach(callback => callback(...args));
}
```

```js
function createSetupStore(id, setup, pinia, isOption) {

  const subscriptions = [];
  const partialState = {
    $patch,
    $subscribe,
    $onAction: addSubscriptions.bind(null, subscriptions);
  }
  // ... ...

  function wrapActions(name, action) {
    return (...args) => {
      const afterCallbacks = [];
      const errorCallbacks = [];
      const after = (cb) => afterCallbacks.push(cb);
      const onError = (cb) => errorCallbacks.push(cb);
      
      triggerSubscription(subscriptions, { name, store, args, after, onError });

      let ret;
      try {
        ret = action.apply(store, args);
      } catch(e) {
        triggerSubscription(errorCallbacks, e);
      }
      
      if (ret instanceof Promise) {
        ret
          .resolve(value => {
            return triggerSubscription(afterCallbacks, value);
          })
          .catch(e) {
            triggerSubscription(errorCallbacks, e);
          }
      }

      triggerSubscription(afterCallbacks, ret);
      return ret;
    }
  }
}
```

### $dispose

停止当前 `store` 的作用域，其实就是 `scope.stop()`;

```js
const partialState = {
  // ...
  $dispose() {
    scope.stop(); // 停止作用域
    pinia._s.delete(id); // 删除 store
    actionSubscriptions = []; // 终止订阅
  },
}
```

### $state

这是挂在 `store` 上面的一个属性，可以直接替换 `store` 上面的 `state` 并且不会丢失其响应式。

```js
Object.defineProperty(store, '$state', {
  get: () => pinia.state.value[id],
  set: (state) => {
    store.$patch(($state) => {
      Object.assign($state, state);
    })
  }
});
```

## 插件 use

插件即是一个函数，它的返回值最终会和 `store` 合并; 调用的次数，取决于项目中存在多少个 `store`; [文档](https://pinia.vuejs.org/zh/core-concepts/plugins.html#introduction) 以实现最简版持久化存储为例如下：

```js
// main.js
function localPlugin({ store }) {
  const local = window.localStorage.getItem(`${store.$id}-pinia`);
  if (local) {
    store.$state = JSON.parse(local);
  }

  store.$subscribe(() => {
    window.localStorage.setItem(`${store.$id}`, JSON.stringify(store.$state));
  });
}

const pinia = createPinia();
pinia.use()
```

```js
// createPinia.js
pinia = {
  // ... ... 
  use(plugin) {
    _p.push(plugin);
    return this; // 链式调用
  },
  _p: [] // 插件列表
}

// defineStore.js
function createSetupStore(id, setup, pinia, isOption) {
  // ...

  pinia._p.forEach((plugin) => {
    const extender = scope.run(() => plugin(store, pinia));
    store.$patch(() => {
      Object.assign(store, extender);
    });
  });
}
```

## 非 vue 文件中的调用

在 `install` 的时候，组件是通过 `provide` 注入的，但是这种方式是不支持在非 `vue` 文件中使用的; 而这种场景也是一定会存在的，比如你在 `router` 的钩子中去做鉴权等等... 此时可以将 `pinia` 放在全局中，就不用考虑拿不到的问题了

```js
// createPinia
export const setActivePinia = (pinia) => activePinia = pinia;
export let activePinia = {};

const pinia = {
  install(app) {
    setActivePinia(this);
    app.provide(piniaSymbol, this);
  }
}

// defineStore
function useStore() {
  let pinia = instance && inject(piniaSymbol);
  if (pinia) {
    setActivePinia(pinia);
  }
  pinia = activePinia;
  // ... ...
}
```

## storeToRefs

该方法与 `toRefs` 的最大区别就是，会将方法给过滤掉，并不会把 `store` 中所有解构出来的值都变成 `ref`; 

```js
function storeToRefs(store) {
  // store 是个 reactive 不能直接循环, 会触发 getter
  store = toRaw(store);
  const refs = {};
  for (let key in store) {
    const value = stroe[key];
    if (isRef(value) || isReactive(value)) {
      // 将 store 中被结构的值修改为 ref
      refs[key] = toRef(store, key)
    }
  }
  return refs;
}
```