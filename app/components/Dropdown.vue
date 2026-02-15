<template>
  <div
    ref="root"
    class="ui-dropdown"
    :class="{ 'is-open': isActive, 'is-disabled': props.disabled }"
    :style="rootStyle"
  >
    <slot name="trigger">
      <button
        type="button"
        class="ui-dropdown-button"
        :class="props.buttonClass"
        :style="props.buttonStyle"
        :disabled="props.disabled"
        @click.stop="toggle"
        @keydown="onKeyDown"
      >
        <slot name="label">
          <span class="ui-dropdown-label">{{ displayLabel }}</span>
        </slot>
        <Icon class="ui-dropdown-icon" :icon="props.menuIcon ?? 'lucide:chevron-down'" :width="12" :height="12" />
      </button>
    </slot>
    <div
      v-if="isActive"
      ref="menu"
      class="ui-dropdown-menu"
      :class="props.popupClass"
      :style="[props.popupStyle, menuStyle]"
      role="listbox"
      tabindex="-1"
      @click.stop
      @keydown="onKeyDown"
    >
      <slot :close="close" />
    </div>
  </div>
</template>

<script lang="ts" setup generic="T">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  reactive,
  ref,
  watch,
  type StyleValue,
} from 'vue';
import { Icon } from '@iconify/vue';

export interface DropdownAPI {
  select: (item: unknown) => void;
  close: () => void;
  selected: unknown | undefined;
  update: () => Promise<void>;
}

const props = defineProps<{
  menuIcon?: string;
  modelValue?: T;
  label?: string;
  placeholder?: string;
  buttonClass?: unknown;
  buttonStyle?: StyleValue;
  popupClass?: unknown;
  popupStyle?: StyleValue;
  autoClose?: boolean;
  disabled?: boolean;
  open?: boolean;
}>();

const emit = defineEmits<{
  select: [T];
  'update:modelValue': [T];
  'update:open': [boolean];
}>();

const root = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const isActive = ref(false);
const anchorName = `--ui-dropdown-anchor-${Math.random().toString(36).slice(2, 10)}`;

const rootStyle = computed<StyleValue>(() => ({
  anchorName,
}));

const menuStyle = computed<StyleValue>(() => ({
  positionAnchor: anchorName,
}));

const displayLabel = computed(() => {
  if (props.label) return props.label;
  if (props.modelValue !== undefined && props.modelValue !== null) return String(props.modelValue);
  return props.placeholder ?? 'Select';
});

function toggle() {
  if (props.disabled) return;
  isActive.value = !isActive.value;
}

function close() {
  isActive.value = false;
}

watch(isActive, (active) => {
  if (!active) clearHighlight();
  emit('update:open', active);
  if (active) {
    nextTick(() => menu.value?.focus());
  }
});

watch(() => props.open, (value) => {
  if (value !== undefined && value !== isActive.value) {
    isActive.value = value;
  }
});

function getCandidateItems(): HTMLElement[] {
  if (!menu.value) return [];
  return Array.from(
    menu.value.querySelectorAll('.ui-input-candidate-item:not([aria-disabled="true"])'),
  );
}

function clearHighlight() {
  if (!menu.value) return;
  menu.value.querySelectorAll('.ui-input-candidate-item[aria-selected="true"]').forEach((el) => {
    el.setAttribute('aria-selected', 'false');
  });
}

function highlightItem(el: HTMLElement | undefined) {
  clearHighlight();
  if (!el) return;
  el.setAttribute('aria-selected', 'true');
  el.scrollIntoView({ block: 'nearest' });
}

function moveHighlight(direction: 'up' | 'down') {
  const items = getCandidateItems();
  if (items.length === 0) return;
  const currentIndex = items.findIndex((el) => el.getAttribute('aria-selected') === 'true');
  let nextIndex: number;
  if (direction === 'down') {
    nextIndex = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0;
  } else {
    nextIndex =
      currentIndex >= 0 ? (currentIndex - 1 + items.length) % items.length : items.length - 1;
  }
  highlightItem(items[nextIndex]);
}

function selectHighlighted() {
  const items = getCandidateItems();
  const current = items.find((el) => el.getAttribute('aria-selected') === 'true');
  if (current) {
    current.click();
    return true;
  }
  return false;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (isActive.value) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    return;
  }

  if (!isActive.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    moveHighlight('down');
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    moveHighlight('up');
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    selectHighlighted();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    e.stopPropagation();
    moveHighlight('down');
    return;
  }
}

function handlePointerDown(event: PointerEvent) {
  if (!root.value) return;
  if (root.value.contains(event.target as Node)) return;
  const menuEl = menu.value;
  if (menuEl && menuEl.contains(event.target as Node)) return;
  close();
}

onMounted(() => {
  window.addEventListener('pointerdown', handlePointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handlePointerDown);
});

const api = reactive({
  select(item: T) {
    if (props.autoClose !== false) close();
    if (item !== undefined) emit('update:modelValue', item);
    emit('select', item);
  },
  close,
  selected: computed(() => props.modelValue),
  async update() {},
});

provide('x-selectable', api);

defineExpose({ moveHighlight });
</script>

<style scoped>
.ui-dropdown {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.ui-dropdown.is-disabled {
  opacity: 0.6;
}

.ui-dropdown-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #0b1320;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
}

.ui-dropdown-button:disabled {
  cursor: default;
}

.ui-dropdown-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-dropdown-icon {
  opacity: 0.7;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
}

.ui-dropdown-menu {
  position: fixed;
  top: anchor(bottom);
  left: anchor(left);
  margin-top: 6px;
  width: anchor-size(width);
  max-width: calc(100vw - 16px);
  max-height: 60vh;
  position-try-fallbacks: flip-block;
  background: rgba(2, 6, 23, 0.98);
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 6px;
  scroll-padding: 6px;
  box-shadow: 0 12px 24px rgba(2, 6, 23, 0.45);
  overflow: auto;
  z-index: 120;
}
</style>
