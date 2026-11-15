import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

import './assets/styles/_bootstrap-custom.scss';

// MOCKUPS (not for main): ?pedals=a|b|c picks one of the pedal colour options
{
	const pick = new URLSearchParams(location.search).get('pedals');
	if (pick && /^[abc]$/.test(pick)) document.documentElement.classList.add(`pedals-${pick}`);
}

const app = createApp(App);
app.use(createPinia());
app.mount('#app');