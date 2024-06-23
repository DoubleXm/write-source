<template>
  <div style="display: flex;">
    <button @click="increment">Increment</button>
    <span style="padding-right: 10px;">{{ store.count }}</span>
    <span>{{ store.double }}</span>
    <button @click="store.$dispose">停止响应式</button>
    <button @click="store.$state = { count: 200 }">$state</button>
  </div>
</template>

<script setup>
import { watch } from 'vue';
import { useCounter2 } from '../store/counter2'

const store = useCounter2();

function increment() {
  store.$patch((state) => {
    state.count++;
    state.testCount++;
  });
}

store.$subscribe((mutation) => {
  console.log('subscribe', mutation);
});
</script>