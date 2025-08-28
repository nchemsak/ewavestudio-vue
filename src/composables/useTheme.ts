import { ref, computed, watchEffect, onMounted } from 'vue';

export type ThemeName = 'dark' | 'light' | 'synthwave' | 'system';

const THEME_KEY = 'ui-theme';

function systemPrefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function useTheme() {
  const stored = (localStorage.getItem(THEME_KEY) as ThemeName | null) ?? 'system';
  const theme = ref<ThemeName>(stored);

  // Resolved theme = explicit selection, or system choice
  const resolved = computed<'dark' | 'light' | 'synthwave'>(() => {
    if (theme.value === 'system') return systemPrefersDark() ? 'dark' : 'light';
    return theme.value;
  });

  // CSS applied to <html>
  const themeClass = computed(() => `theme-${resolved.value}`);

  function apply() {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'theme-synthwave');
    root.classList.add(themeClass.value);
  }

  function setTheme(next: ThemeName) {
    theme.value = next;
    localStorage.setItem(THEME_KEY, next);
  }

  onMounted(() => {
    apply();
    // keep in sync if user changes OS theme and we’re on “system”
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (theme.value === 'system') apply(); };
    mq.addEventListener?.('change', handler);
  });

  watchEffect(apply);

  return { theme, resolved, themeClass, setTheme };
}
    