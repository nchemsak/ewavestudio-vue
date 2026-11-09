// src/composables/usePhoneMode.ts
// Phone mode: on a touch phone held sideways the app shows a layout made for it
// (PhoneLayout.vue); held upright, a hint to turn it (PhoneHint.vue). Either way, "Full layout"
// shows the normal layout instead, remembered on that phone (localStorage `phone-layout`), and
// File → Phone layout brings phone mode back.
//
// A phone is a touch screen (pointer: coarse) with a short side of 500 px or less: phones are
// 320–480 px on their short side, tablets 600 px and up.
import { ref, computed } from 'vue';
import { storageKey } from '../lib/storage/namespace';

const KEY = storageKey('phone-layout');
export const PHONE_LANDSCAPE = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';
export const PHONE_PORTRAIT = '(orientation: portrait) and (max-width: 500px) and (pointer: coarse)';

const landscape = ref(false);
const portrait = ref(false);
const full = ref(false);
let started = false;

function start() {
	if (started || typeof window === 'undefined' || !window.matchMedia) return;
	started = true;
	try { full.value = localStorage.getItem(KEY) === 'full'; } catch { /* private mode */ }
	const l = window.matchMedia(PHONE_LANDSCAPE);
	const p = window.matchMedia(PHONE_PORTRAIT);
	const read = () => { landscape.value = l.matches; portrait.value = p.matches; };
	read();
	l.addEventListener?.('change', read);
	p.addEventListener?.('change', read);
}

// Phone mode is on: the phone layout shows
const active = computed(() => landscape.value && !full.value);
// The phone is upright: the hint to turn it shows
const hint = computed(() => portrait.value && !full.value);
// On a phone, whichever way it's held (File → Phone layout shows only here)
const onPhone = computed(() => landscape.value || portrait.value);

function setFull(on: boolean) {
	full.value = on;
	try {
		if (on) localStorage.setItem(KEY, 'full');
		else localStorage.removeItem(KEY);
	} catch { /* private mode: for this visit only */ }
}

export function usePhoneMode() {
	start();
	return { active, hint, onPhone, full, setFull };
}
