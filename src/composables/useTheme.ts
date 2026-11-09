// useTheme.ts
import { ref, computed, watchEffect, onMounted } from 'vue';
import { storageKey } from '../lib/storage/namespace';

// 'light' has no button (only a choice saved before it was hidden applies it); 'sand' is the
// light-coloured theme with a button
export const THEMES = ['dark', 'light', 'synthwave', 'sand', 'analog', 'slate'] as const;
export type ThemeName = (typeof THEMES)[number];

const THEME_KEY = storageKey('ui-theme');

// Singleton state
const theme = ref<ThemeName>('synthwave');
const resolved = computed(() => theme.value);
const themeClass = computed(() => `theme-${resolved.value}`);

let initialized = false;

function apply() {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	root.classList.remove(...THEMES.map((t) => `theme-${t}`));
	root.classList.add(themeClass.value);
}

function init() {
	if (initialized) return;
	initialized = true;

	let raw: ThemeName | 'system' | null = null;
	try {
		raw = localStorage.getItem(THEME_KEY) as any;
	} catch {
		raw = null;
	}

	const initial: ThemeName = (THEMES as readonly string[]).includes(raw as string)
		? (raw as ThemeName)
		: 'synthwave';

	theme.value = initial;

	if (raw === 'system') {
		try {
			localStorage.setItem(THEME_KEY, 'synthwave');
		} catch { }
	}

	onMounted(apply);
	watchEffect(apply);
}

export function useTheme() {
	init();

	function setTheme(next: ThemeName) {
		theme.value = next;
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch { }
	}

	return { theme, resolved, themeClass, setTheme };
}
