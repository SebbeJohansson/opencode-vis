<template>
  <div class="top-panel">
    <div v-if="copyToastVisible" class="copy-toast" role="status" aria-live="polite">Copied!</div>
    <div class="top-row">
      <div class="top-field">
         <Dropdown
           v-model="projectDirectoryValue"
           :label="selectedBaseWorktreeLabel"
           placeholder="Select directory"
           auto-close
         >
          <template #default>
             <div class="dropdown-list">
               <div v-if="projectDirectories.length === 0" class="dropdown-empty">No directories</div>
               <DropdownItem v-for="dir in projectDirectories" :key="dir" :value="dir">
                <span class="dropdown-item-label">{{ formatBaseWorktree(dir) }}</span>
              </DropdownItem>
            </div>
          </template>
        </Dropdown>
        <button type="button" class="control-button" @click="$emit('open-directory')"><Icon icon="lucide:folder-open" :width="12" :height="12" /> Open</button>
      </div>

      <div class="top-field">
         <Dropdown
           v-model="activeDirectoryValue"
           :label="selectedActiveDirectoryLabel"
           placeholder="Select worktree"
           :disabled="!projectDirectory"
           auto-close
         >
          <template #default="{ close }">
            <div class="dropdown-list">
              <div v-if="activeDirectories.length === 0" class="dropdown-empty">No worktrees</div>
              <DropdownItem
                v-for="directory in activeDirectories"
                :key="directory"
                :value="directory"
              >
                <span class="dropdown-item-label">{{ activeDirectoryLabel(directory) }}</span>
                <span class="dropdown-actions">
                  <button
                    v-if="activeDirectoryBranch(directory)"
                    type="button"
                    class="dropdown-copy"
                    @click.stop="copyActiveDirectoryBranch(directory)"
                  >
                    Copy
                  </button>
                  <span v-else class="dropdown-action-placeholder"></span>
                  <button
                    v-if="canDeleteActiveDirectory(directory)"
                    type="button"
                    class="dropdown-delete"
                    @click.stop="handleActiveDirectoryDelete(directory, close)"
                  >
                    Delete
                  </button>
                  <span v-else class="dropdown-action-placeholder"></span>
                </span>
              </DropdownItem>
            </div>
          </template>
        </Dropdown>
         <button
           type="button"
           class="control-button"
           :disabled="!projectDirectory"
           @click="$emit('create-worktree')"
         >
          <Icon icon="lucide:plus" :width="12" :height="12" /> Add
        </button>
      </div>

      <div class="top-field">
        <Dropdown
          v-model="sessionValue"
          :label="selectedSessionLabel"
          placeholder="Select session"
          :disabled="!activeDirectory"
          auto-close
        >
          <template #default="{ close }">
            <div class="dropdown-list">
              <div v-if="sessions.length === 0" class="dropdown-empty">No sessions</div>
              <DropdownItem v-for="session in sessions" :key="session.id" :value="session.id">
                <span class="session-status-icon" :title="sessionStatusText(session.id)">
                  {{ sessionStatusIcon(session.id) }}
                </span>
                <span class="dropdown-item-label">{{ sessionLabel(session) }}</span>
                <button
                  type="button"
                  class="dropdown-delete"
                  @click.stop="handleSessionDelete(session.id, close)"
                >
                  Delete
                </button>
              </DropdownItem>
            </div>
          </template>
        </Dropdown>
        <button type="button" class="control-button" @click="$emit('new-session')"><Icon icon="lucide:plus" :width="12" :height="12" /> New</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Icon } from '@iconify/vue';
import Dropdown from './Dropdown.vue';
import DropdownItem from './Dropdown/Item.vue';

type SessionInfo = {
  id: string;
  projectID?: string;
  parentID?: string;
  title?: string;
  slug?: string;
  directory?: string;
};

const props = defineProps<{
  projectDirectories: string[];
  projectDirectory: string;
  activeDirectories: string[];
  activeDirectory: string;
  activeDirectoryMeta?: Record<string, { branch?: string }>;
  sessions: SessionInfo[];
  sessionStatusById?: Record<string, 'busy' | 'idle' | 'retry'>;
  selectedSessionId: string;
  homePath?: string;
}>();

const emit = defineEmits<{
  (event: 'update:project-directory', value: string): void;
  (event: 'update:active-directory', value: string): void;
  (event: 'update:selected-session-id', value: string): void;
  (event: 'open-directory'): void;
  (event: 'create-worktree'): void;
  (event: 'new-session'): void;
  (event: 'delete-active-directory', value: string): void;
  (event: 'delete-session', value: string): void;
}>();

const projectDirectoryValue = computed({
  get: () => props.projectDirectory,
  set: (value) => emit('update:project-directory', value),
});

const activeDirectoryValue = computed({
  get: () => props.activeDirectory,
  set: (value) => emit('update:active-directory', value),
});

const sessionValue = computed({
  get: () => props.selectedSessionId,
  set: (value) => emit('update:selected-session-id', value),
});

const selectedBaseWorktreeLabel = computed(() =>
  props.projectDirectory ? formatBaseWorktree(props.projectDirectory) : '',
);

const selectedActiveDirectoryLabel = computed(() => {
  if (!props.activeDirectory) return '';
  return activeDirectoryLabel(props.activeDirectory);
});

const selectedSessionLabel = computed(() => {
  const session = props.sessions.find((item) => item.id === props.selectedSessionId);
  if (!session) return '';
  return `${sessionStatusIcon(session.id)} ${sessionLabel(session)}`;
});
const copyToastVisible = ref(false);
let copyToastTimer: ReturnType<typeof setTimeout> | null = null;

function sessionLabel(session: SessionInfo) {
  return session.title || session.slug || session.id;
}

function sessionStatusIcon(sessionId: string) {
  const status = props.sessionStatusById?.[sessionId];
  if (status === 'busy') return '🤔';
  if (status === 'retry') return '🔴';
  if (status === 'idle') return '🟢';
  return '⚪';
}

function sessionStatusText(sessionId: string) {
  const status = props.sessionStatusById?.[sessionId];
  if (status === 'busy') return 'busy';
  if (status === 'retry') return 'retry';
  if (status === 'idle') return 'idle';
  return 'unknown';
}

function activeDirectoryLabel(directory: string) {
  const branch = activeDirectoryBranch(directory);
  if (branch) return branch;
  return directory;
}

function normalizeDirectory(value: string) {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed || value;
}

function formatBaseWorktree(path: string) {
  const home = normalizeDirectory(props.homePath ?? '');
  const target = normalizeDirectory(path);
  if (!home || !target.startsWith('/')) return path;
  if (target === home) return '~';
  const prefix = `${home}/`;
  if (target.startsWith(prefix)) return `~/${target.slice(prefix.length)}`;
  return path;
}

function activeDirectoryBranch(directory: string) {
  const key = normalizeDirectory(directory);
  return props.activeDirectoryMeta?.[key]?.branch ?? '';
}

function canDeleteActiveDirectory(directory: string) {
  const base = normalizeDirectory(props.projectDirectory);
  if (!base) return true;
  return normalizeDirectory(directory) !== base;
}

async function copyActiveDirectoryBranch(directory: string) {
  const branch = activeDirectoryBranch(directory).trim();
  if (!branch) return;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
  try {
    await navigator.clipboard.writeText(branch);
    showCopyToast();
  } catch {
    return;
  }
}

function showCopyToast() {
  copyToastVisible.value = true;
  if (copyToastTimer) clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => {
    copyToastVisible.value = false;
    copyToastTimer = null;
  }, 1400);
}

onBeforeUnmount(() => {
  if (copyToastTimer) {
    clearTimeout(copyToastTimer);
    copyToastTimer = null;
  }
});

function handleActiveDirectoryDelete(directory: string, close?: () => void) {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(`Delete worktree "${activeDirectoryLabel(directory)}"?`);
    if (!confirmed) return;
  }
  emit('delete-active-directory', directory);
  close?.();
}

function handleSessionDelete(id: string, close?: () => void) {
  if (typeof window !== 'undefined') {
    const session = props.sessions.find((item) => item.id === id);
    const label = session ? sessionLabel(session) : id;
    const confirmed = window.confirm(`Delete session "${label}"?`);
    if (!confirmed) return;
  }
  emit('delete-session', id);
  close?.();
}
</script>

<style scoped>
.top-panel {
  position: relative;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.45);
  z-index: 20;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
}

.top-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-wrap: wrap;
}

.top-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 260px;
  min-width: 0;
}

.dropdown-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropdown-empty {
  padding: 6px 8px;
  font-size: 12px;
  color: #94a3b8;
}

.dropdown-item-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-status-icon {
  flex: 0 0 auto;
  width: 1.5em;
  text-align: center;
  opacity: 0.95;
}

.dropdown-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.dropdown-action-placeholder {
  width: 44px;
  height: 22px;
  flex: 0 0 auto;
}

.dropdown-delete {
  flex: 0 0 auto;
  background: #991b1b;
  color: #fee2e2;
  border: 1px solid #b91c1c;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 10px;
  cursor: pointer;
}

.dropdown-delete:hover {
  background: #b91c1c;
}

.dropdown-copy {
  flex: 0 0 auto;
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 10px;
  cursor: pointer;
}

.dropdown-copy:hover {
  background: #334155;
}

.copy-toast {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 120;
  background: #14532d;
  color: #dcfce7;
  border: 1px solid #166534;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 11px;
}

.control-button {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.control-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
