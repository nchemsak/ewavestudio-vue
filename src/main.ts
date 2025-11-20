import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// import 'bootstrap-icons/font/bootstrap-icons.css';
import './assets/styles/_bootstrap-custom.scss';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');