import { defineStore } from '../pinia';

export const useCounter1 = defineStore({
  id: 'counter1',
  state: () => ({
    count: 0,
    testCount: 0,
  }),
  actions: {
    increment() {
      this.count++;
      this.testCount++;
    },
  },
  getters: {
    double() {
      return this.count * 2;
    },
  },
});
