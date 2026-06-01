import { ref, watch, effectScope } from 'vue';
import { StorageKeys, storageGet, storageKey, storageSet } from '../utils/storageKeys';
import {
  DEFAULT_THEME_ID,
  THEMES,
  getTheme,
  listThemes,
  type ThemeDefinition,
} from '../utils/themes';

const initialId = (() => {
  const stored = storageGet(StorageKeys.settings.theme);
  if (stored && THEMES[stored]) return stored;
  return DEFAULT_THEME_ID;
})();

const themeId = ref<string>(initialId);

function applyTheme(theme: ThemeDefinition) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.palette)) {
    root.style.setProperty(`--theme-${key}`, value);
  }
  root.setAttribute('data-theme', theme.id);
  root.style.colorScheme = theme.mode;
}

// Apply immediately on module load to avoid a flash of default theme.
applyTheme(getTheme(themeId.value));

const scope = effectScope(true);
scope.run(() => {
  watch(themeId, (value) => {
    const theme = getTheme(value);
    applyTheme(theme);
    storageSet(StorageKeys.settings.theme, theme.id);
  });
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey(StorageKeys.settings.theme)) {
      const next = event.newValue;
      if (next && THEMES[next]) themeId.value = next;
    }
  });
}

export function useTheme() {
  function setTheme(id: string) {
    if (!THEMES[id]) return;
    themeId.value = id;
  }
  return {
    themeId,
    setTheme,
    themes: listThemes(),
    getTheme,
  };
}
