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
        <div class="modal-title">Hidden Models</div>
        <button type="button" class="modal-close-button" @click="dialogRef?.close()">
          <Icon icon="lucide:x" :width="14" :height="14" />
        </button>
      </header>
      <div class="modal-description">
        Unchecked models are hidden from the model picker. They remain available if directly
        referenced by a session.
      </div>
      <div class="modal-body">
        <div v-if="groupedOptions.length === 0" class="empty-state">No models available.</div>
        <template v-for="group in groupedOptions" :key="group.providerID">
          <div class="provider-label">{{ group.providerLabel }}</div>
          <label
            v-for="model in group.models"
            :key="model.id"
            class="model-row"
            :class="{ 'model-row--hidden': isHidden(model.id) }"
          >
            <input
              type="checkbox"
              class="model-checkbox"
              :checked="!isHidden(model.id)"
              @change="toggleHidden(model.id)"
            />
            <div class="model-info">
              <span class="model-name">{{ model.displayName }}</span>
              <span class="model-path">{{ model.providerID }}/{{ model.modelID }}</span>
            </div>
          </label>
        </template>
      </div>
      <footer class="modal-footer">
        <button type="button" class="reset-button" @click="resetAll">Show all models</button>
      </footer>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useHiddenModels } from '../composables/useHiddenModels';

type ModelOption = {
  id: string;
  modelID: string;
  displayName: string;
  providerID?: string;
  providerLabel?: string;
};

const props = defineProps<{
  open: boolean;
  allModelOptions: ModelOption[];
}>();

defineEmits<{
  (event: 'close'): void;
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const { hiddenModels, isHidden, toggleHidden } = useHiddenModels();

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

const groupedOptions = computed(() => {
  const groups = new Map<string, { providerID: string; providerLabel: string; models: ModelOption[] }>();
  for (const model of props.allModelOptions) {
    const providerID = model.providerID ?? 'unknown';
    const providerLabel = model.providerLabel ?? providerID;
    if (!groups.has(providerID)) {
      groups.set(providerID, { providerID, providerLabel, models: [] });
    }
    groups.get(providerID)!.models.push(model);
  }
  return Array.from(groups.values());
});

function resetAll() {
  hiddenModels.value = [];
}
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
  background: rgba(2, 6, 23, 0.65);
}

.modal {
  width: min(480px, 95vw);
  max-height: min(600px, 90vh);
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 16px;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid #334155;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.45);
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
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
  border: 1px solid #334155;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}

.modal-close-button:hover {
  background: #1e293b;
  color: #e2e8f0;
}

.modal-description {
  font-size: 11px;
  color: #64748b;
  margin-top: 8px;
  flex-shrink: 0;
}

.modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.empty-state {
  font-size: 12px;
  color: #64748b;
  padding: 16px 0;
  text-align: center;
}

.provider-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 8px 8px 4px;
}

.provider-label:first-child {
  padding-top: 0;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
}

.model-row:hover {
  background: #1e293b;
}

.model-checkbox {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  accent-color: #3b82f6;
  cursor: pointer;
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.model-name {
  font-size: 12px;
  color: #e2e8f0;
  line-height: 1.2;
  transition: color 0.1s;
}

.model-path {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.2;
  transition: color 0.1s;
}

.model-row--hidden .model-name {
  color: #475569;
}

.model-row--hidden .model-path {
  color: #334155;
}

.modal-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding-top: 12px;
  margin-top: 4px;
  border-top: 1px solid #1e293b;
}

.reset-button {
  font-size: 11px;
  font-family: inherit;
  color: #64748b;
  background: transparent;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: color 0.1s, border-color 0.1s;
}

.reset-button:hover {
  color: #e2e8f0;
  border-color: #64748b;
}
</style>
