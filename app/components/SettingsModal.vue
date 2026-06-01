<template>
  <dialog
    ref="dialogRef"
    class="modal-backdrop"
    @close="$emit('close')"
    @cancel.prevent
    @click.self="dialogRef?.close()"
  >
    <div class="modal">
      <header class="modal-header">
        <div class="modal-title">Settings</div>
        <button type="button" class="modal-close-button" @click="dialogRef?.close()">
          <Icon icon="lucide:x" :width="14" :height="14" />
        </button>
      </header>
      <div class="modal-body">
        <div class="setting-row setting-row--column">
          <div class="setting-info">
            <div class="setting-label">Theme</div>
            <div class="setting-description">
              Choose a color theme for the interface.
            </div>
          </div>
          <select v-model="selectedTheme" class="setting-select">
            <option v-for="theme in themes" :key="theme.id" :value="theme.id">
              {{ theme.name }}
            </option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Enter to send</div>
            <div class="setting-description">
              Send messages by pressing Enter. When off, use Ctrl+Enter.
            </div>
          </div>
          <label class="toggle-switch">
            <input v-model="enterToSend" type="checkbox" class="toggle-input" />
            <span class="toggle-track" />
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Full screen floating windows</div>
            <div class="setting-description">
              Allow floating windows to appear over the header and message input area.
            </div>
          </div>
          <label class="toggle-switch">
            <input v-model="fullScreenFloating" type="checkbox" class="toggle-input" />
            <span class="toggle-track" />
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Require .git to open project</div>
            <div class="setting-description">
              Only allow opening directories that contain a .git folder.
            </div>
          </div>
          <label class="toggle-switch">
            <input v-model="requireGitDirectory" type="checkbox" class="toggle-input" />
            <span class="toggle-track" />
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Remember model per agent</div>
            <div class="setting-description">
              Automatically restore the last used model when switching between agent modes.
            </div>
          </div>
          <label class="toggle-switch">
            <input v-model="rememberModelPerAgent" type="checkbox" class="toggle-input" />
            <span class="toggle-track" />
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Peon Ping audio stream</div>
            <div class="setting-description">
              Play audio from a local Peon Ping stream (requires the stream to be running).
            </div>
          </div>
          <label class="toggle-switch">
            <input v-model="peonPingEnabled" type="checkbox" class="toggle-input" />
            <span class="toggle-track" />
          </label>
        </div>
        <div v-if="peonPingEnabled" class="setting-row setting-row--column">
          <div class="setting-info">
            <div class="setting-label">Stream URL</div>
            <div class="setting-description">
              URL of the audio stream to connect to.
            </div>
          </div>
          <input
            v-model="peonPingUrl"
            type="url"
            class="setting-url-input"
            placeholder="http://localhost:8000/peon"
          />
          <div v-if="!peonPingUrl.trim()" class="setting-hint">
            Enter a stream URL to start playing.
          </div>
        </div>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useSettings } from '../composables/useSettings';
import { useTheme } from '../composables/useTheme';

const props = defineProps<{
  open: boolean;
}>();

defineEmits<{
  (event: 'close'): void;
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const { enterToSend, fullScreenFloating, requireGitDirectory, rememberModelPerAgent, peonPingEnabled, peonPingUrl } = useSettings();
const { themeId, setTheme, themes } = useTheme();
const selectedTheme = computed<string>({
  get: () => themeId.value,
  set: (value) => setTheme(value),
});

watch(
  () => props.open,
  (open) => {
    const el = dialogRef.value;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  },
);
</script>

<style scoped>
.modal-backdrop {
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
  color: inherit;
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-backdrop:not([open]) {
  display: none;
}

.modal-backdrop::backdrop {
  background: color-mix(in srgb, var(--theme-bg-base) 65%, transparent);
}

.modal {
  width: min(480px, 95vw);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--theme-bg-overlay);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  box-shadow: 0 12px 32px color-mix(in srgb, var(--theme-bg-base) 45%, transparent);
  color: var(--theme-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.modal-title {
  font-size: 14px;
  font-weight: 600;
}

.modal-close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: transparent;
  color: var(--theme-text-muted);
  cursor: pointer;
}

.modal-close-button:hover {
  background: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--theme-bg-hover);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-bg-base) 45%, transparent);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-secondary);
}

.setting-description {
  font-size: 11px;
  color: var(--theme-text-subtle);
}

.toggle-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  width: 36px;
  height: 20px;
  background: var(--theme-border);
  border-radius: 10px;
  position: relative;
  transition: background 0.2s;
}

.toggle-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--theme-text-muted);
  border-radius: 50%;
  transition:
    transform 0.2s,
    background 0.2s;
}

.toggle-input:checked + .toggle-track {
  background: var(--theme-accent-strong);
}

.toggle-input:checked + .toggle-track::after {
  transform: translateX(16px);
  background: var(--theme-text-inverse);
}

.setting-row--column {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.setting-url-input {
  width: 100%;
  padding: 6px 10px;
  background: var(--theme-bg-base);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  outline: none;
  box-sizing: border-box;
}

.setting-url-input::placeholder {
  color: var(--theme-border-strong);
}

.setting-url-input:focus {
  border-color: var(--theme-accent-strong);
}

.setting-select {
  width: 100%;
  padding: 6px 10px;
  background: var(--theme-bg-base);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
}

.setting-select:focus {
  border-color: var(--theme-accent-strong);
}

.setting-hint {
  font-size: 11px;
  color: var(--theme-warning);
}
</style>
