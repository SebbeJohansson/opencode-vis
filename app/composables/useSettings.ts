import { ref, watch, effectScope } from 'vue';
import { StorageKeys, storageGet, storageKey, storageSet } from '../utils/storageKeys';

const enterToSend = ref(storageGet(StorageKeys.settings.enterToSend) === 'true');
const suppressAutoWindows = ref(storageGet(StorageKeys.settings.suppressAutoWindows) === 'true');
const fullScreenFloating = ref(storageGet(StorageKeys.settings.fullScreenFloating) === 'true');

// Run watchers in a detached effectScope so they are not tied to any component
// lifecycle and reliably persist setting changes to localStorage.
const scope = effectScope(true);
scope.run(() => {
  watch(enterToSend, (value) => {
    storageSet(StorageKeys.settings.enterToSend, String(value));
  });

  watch(suppressAutoWindows, (value) => {
    storageSet(StorageKeys.settings.suppressAutoWindows, String(value));
  });

  watch(fullScreenFloating, (value) => {
    storageSet(StorageKeys.settings.fullScreenFloating, String(value));
  });
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey(StorageKeys.settings.enterToSend)) {
      enterToSend.value = event.newValue === 'true';
    }
    if (event.key === storageKey(StorageKeys.settings.suppressAutoWindows)) {
      suppressAutoWindows.value = event.newValue === 'true';
    }
    if (event.key === storageKey(StorageKeys.settings.fullScreenFloating)) {
      fullScreenFloating.value = event.newValue === 'true';
    }
  });
}

export function useSettings() {
  return { enterToSend, suppressAutoWindows, fullScreenFloating };
}
