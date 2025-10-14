import { ref, computed, watchEffect, onMounted } from 'vue';

export type ThemeName = 'dark' | 'light' | 'synthwave';

const THEME_KEY = 'ui-theme';

export function useTheme() {
  // Read stored theme; migrate old "system" to "dark"
  const raw = localStorage.getItem(THEME_KEY) as (ThemeName | 'system' | null);
  const initial: ThemeName = (raw === 'light' || raw === 'synthwave') ? raw : 'dark';

  const theme = ref<ThemeName>(initial);

  // For compatibility with existing uses of `resolved`, keep the computed,
  // but it now simply reflects the current theme (no system logic).
  const resolved = computed<'dark' | 'light' | 'synthwave'>(() => theme.value);

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
    // One-time migration if a legacy "system" was stored
    if (raw === 'system') {
      localStorage.setItem(THEME_KEY, 'dark');
    }
    apply();
  });

  watchEffect(apply);

  return { theme, resolved, themeClass, setTheme };
}
