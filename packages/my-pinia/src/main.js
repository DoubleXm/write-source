import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { createPinia } from './pinia';
import { useCounter1 } from '../src/store/counter1';

function localPlugin({ store }) {
  const local = window.localStorage.getItem(`${store.$id}`);
  if (local) {
    store.$state = JSON.parse(local);
  }

  store.$subscribe(() => {
    window.localStorage.setItem(`${store.$id}`, JSON.stringify(store.$state));
  });
}

const pinia = createPinia();
pinia.use(localPlugin);

createApp(App).use(pinia).mount('#app');

const store = useCounter1();
console.log(store.count);
