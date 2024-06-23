import { isReactive, isRef, toRaw, toRef } from 'vue';

export function storeToRefs(store) {
  // 因为 store 是 reactive 不能直接循环，会触发 getter
  store = toRaw(store);
  const refs = {};
  for (let key in store) {
    const value = store[key];
    if (isRef(value) || isReactive(value)) {
      refs[key] = toRef(store, key);
    }
  }
  return refs;
}
