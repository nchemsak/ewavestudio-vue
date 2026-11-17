import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

import './assets/styles/_bootstrap-custom.scss';
import './assets/styles/pedalMockups.css'; // PEDAL MOCKUPS (branch only)

const app = createApp(App);
app.use(createPinia());
app.mount('#app');