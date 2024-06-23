<template>
  <div style="display: flex;">
    <button @click="store.increment">Increment</button>
    <span style="padding-right: 10px;">{{ store.count }}</span>
    <span style="padding-right: 10px;">{{ store.testCount }}</span>
    <span>{{ store.double }}</span>

    <button @click="store.$reset">Reset</button>
  </div>
</template>

<script setup>
import { watch } from 'vue';
import { useCounter1 } from '../store/counter1'

const store = useCounter1();

function increment() {
  store.$patch((state) => {
    state.count++;
  });
}

store.$subscribe((mutation) => {
  console.log('mutation', mutation);
});

store.$onAction(({ name, store: actionStore, args, after, onError }) => {
  console.log('action', name, actionStore, args, after, onError);

  after(() => {
    console.log('after action', store.count);
  });
  console.log(store.count)

  onError((e) => {
    console.log('on error', e);
  })
});
</script>