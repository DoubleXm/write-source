import { defineStore } from '../pinia';
import { ref, computed } from 'vue';

export const useCounter2 = defineStore('counter2', () => {
  const count = ref(0);
  const testCount = ref(0);

  const increment = () => {
    count.value++;
    testCount.value++;
  };
  const double = computed(() => count.value * 2);

  return { count, increment, double, testCount };
});
