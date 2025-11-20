// useTheme.ts
import { ref, computed, watchEffect, onMounted } from 'vue';

export type ThemeName = 'dark' | 'light' | 'synthwave';

const THEME_KEY = 'ui-theme';

// Singleton state
const theme = ref<ThemeName>('dark');
const resolved = computed(() => theme.value);
const themeClass = computed(() => `theme-${resolved.value}`);

let initialized = false;

function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-dark', 'theme-light', 'theme-synthwave');
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

  const initial: ThemeName =
    raw === 'light' || raw === 'synthwave' ? raw : 'dark';
  theme.value = initial;

  if (raw === 'system') {
    try {
      localStorage.setItem(THEME_KEY, 'dark');
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
