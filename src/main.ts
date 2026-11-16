import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

import './assets/styles/_bootstrap-custom.scss';

// MOCKUP (plan item "One accent, one job"; not for merging): ?look=a|b and &labels=sans pick a
// look (src/assets/styles/_mockLook.scss)
{
    const q = new URLSearchParams(location.search);
    const look = q.get('look');
    if (look === 'a' || look === 'b') document.documentElement.classList.add(`look-${look}`);
    if (q.get('labels') === 'sans') document.documentElement.classList.add('labels-sans');
}

const app = createApp(App);
app.use(createPinia());
app.mount('#app');