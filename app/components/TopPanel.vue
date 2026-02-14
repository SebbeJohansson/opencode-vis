<template>
  <div class="top-panel">
    <div v-if="copyToastVisible" class="copy-toast" role="status" aria-live="polite">Copied!</div>
    <div class="top-row">
      <div class="top-field tree-dropdown-container">
        <Dropdown
          v-model="dropdownValue"
          :label="selectedLabel"
          placeholder="Select session..."
          auto-close
          class="tree-dropdown"
          :disabled="false"
        >
          <template #default="{ close }">
            <div class="tree-menu">
              <div class="tree-search" @click.stop>
                <Icon icon="lucide:search" class="search-icon" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search worktrees, sandboxes, sessions..."
                  class="search-input"
                  @click.stop
                />
                <button v-if="searchQuery" class="clear-search" @click.stop="searchQuery = ''">
                  <Icon icon="lucide:x" />
                </button>
              </div>

              <div class="tree-content">
                <div v-if="filteredTreeData.length === 0" class="tree-empty">
                  No matches found
                </div>

                <div
                  v-for="worktree in filteredTreeData"
                  :key="worktree.directory"
                  class="tree-group worktree-group"
                >
                  <div class="group-header worktree-header">
                    <div class="header-main">
                      <Icon icon="lucide:folder-git-2" class="group-icon" />
                      <span class="group-label" :title="worktree.directory">
                        {{ worktree.name ? `${worktree.name} (${worktree.label})` : worktree.label }}
                      </span>
                    </div>
                    <div class="header-actions">
                      <button
                        type="button"
                        class="action-button"
                        title="Create new worktree from this worktree"
                        @click.stop="handleCreateWorktree(worktree.directory, close)"
                      >
                        <Icon icon="lucide:copy-plus" />
                      </button>
                    </div>
                  </div>

                  <div class="group-children">
                    <div
                      v-for="sandbox in worktree.sandboxes"
                      :key="sandbox.directory"
                      class="tree-group sandbox-group"
                    >
                      <div class="group-header sandbox-header">
                        <div class="header-main">
                          <Icon icon="lucide:box" class="group-icon" />
                          <span class="group-label" :title="sandbox.directory">
                            {{ formatSandboxLabel(sandbox.directory, worktree.directory) }}
                          </span>
                          <span v-if="sandbox.branch" class="branch-badge">
                            <Icon icon="lucide:git-branch" class="branch-icon" />
                            {{ sandbox.branch }}
                          </span>
                        </div>
                        <div class="header-actions">
                          <button
                            v-if="sandbox.branch"
                            type="button"
                            class="action-button"
                            title="Copy branch name"
                            @click.stop="copyText(sandbox.branch)"
                          >
                            <Icon icon="lucide:copy" />
                          </button>
                          <button
                            v-if="canDeleteSandbox(sandbox.directory, worktree.directory)"
                            type="button"
                            class="action-button delete-button"
                            title="Delete worktree"
                            @click.stop="handleSandboxDelete(sandbox.directory, close)"
                          >
                            <Icon icon="lucide:trash-2" />
                          </button>
                        </div>
                      </div>

                      <div class="group-children">
                        <DropdownItem
                          v-for="session in sandbox.sessions"
                          :key="session.id"
                          :value="session.id"
                          class="session-item"
                          :class="{ 'is-active': session.id === selectedSessionId }"
                          @click="handleSessionSelect(worktree.directory, sandbox.directory, session.id, close)"
                        >
                          <span class="session-status-icon" :title="session.status">
                            {{ sessionStatusIcon(session.status) }}
                          </span>
                          <span class="dropdown-item-label">
                            {{ session.title || session.slug || session.id }}
                          </span>
                          <div class="session-actions">
                            <button
                              type="button"
                              class="action-button delete-button"
                              title="Delete session"
                              @click.stop="handleSessionDelete(session.id, close)"
                            >
                              <Icon icon="lucide:trash-2" />
                            </button>
                          </div>
                        </DropdownItem>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Dropdown>
        <button type="button" class="control-button" @click="$emit('new-session')">
          <Icon icon="lucide:plus" :width="12" :height="12" /> New
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Icon } from '@iconify/vue';
import Dropdown from './Dropdown.vue';
import DropdownItem from './Dropdown/Item.vue';

export type TopPanelSession = {
  id: string;
  title?: string;
  slug?: string;
  status: 'busy' | 'idle' | 'retry' | 'unknown';
  timeUpdated?: number;
};

export type TopPanelSandbox = {
  directory: string;
  branch?: string;
  sessions: TopPanelSession[];
  latestUpdated: number;
};

export type TopPanelWorktree = {
  directory: string;
  label: string;
  name?: string;
  sandboxes: TopPanelSandbox[];
  latestUpdated: number;
};

const props = defineProps<{
  treeData: TopPanelWorktree[];
  projectDirectory: string;
  activeDirectory: string;
  selectedSessionId: string;
  homePath?: string;
}>();

const emit = defineEmits<{
  (event: 'select-session', payload: { worktree: string; directory: string; sessionId: string }): void;
  (event: 'create-worktree-from', worktree: string): void;
  (event: 'new-session'): void;
  (event: 'delete-active-directory', value: string): void;
  (event: 'delete-session', value: string): void;
}>();

const searchQuery = ref('');
const copyToastVisible = ref(false);
let copyToastTimer: ReturnType<typeof setTimeout> | null = null;

// Dummy v-model for Dropdown to keep it happy, though we handle selection manually
const dropdownValue = computed({
  get: () => props.selectedSessionId,
  set: () => { /* no-op */ },
});

const selectedLabel = computed(() => {
  // Find current session in tree
  for (const worktree of props.treeData) {
    for (const sandbox of worktree.sandboxes) {
      const session = sandbox.sessions.find(s => s.id === props.selectedSessionId);
      if (session) {
        const status = sessionStatusIcon(session.status);
        const title = session.title || session.slug || session.id;
        const worktreeLabel = worktree.name || worktree.label;
        const sandboxLabel = formatSandboxLabel(sandbox.directory, worktree.directory);
        // Format: [Status] SessionTitle (Worktree / Sandbox)
        // Shorten if needed
        return `${status} ${title} (${worktreeLabel} / ${sandboxLabel})`;
      }
    }
  }
  return 'Select session...';
});

const filteredTreeData = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  
  // 1. Filter phase
  const filtered = props.treeData.map(worktree => {
    const worktreeMatch = 
      worktree.label.toLowerCase().includes(query) || 
      (worktree.name && worktree.name.toLowerCase().includes(query));

    const sandboxes = worktree.sandboxes.map(sandbox => {
      const sandboxLabel = formatSandboxLabel(sandbox.directory, worktree.directory);
      const sandboxMatch = 
        sandboxLabel.toLowerCase().includes(query) ||
        (sandbox.branch && sandbox.branch.toLowerCase().includes(query));

      const sessions = sandbox.sessions.filter(session => {
        if (worktreeMatch || sandboxMatch) return true;
        const title = session.title || '';
        const slug = session.slug || '';
        return (
          title.toLowerCase().includes(query) ||
          slug.toLowerCase().includes(query) ||
          session.id.toLowerCase().includes(query)
        );
      });

      return {
        ...sandbox,
        sessions,
        matches: sandboxMatch || sessions.length > 0
      };
    }).filter(s => worktreeMatch || s.matches);

    return {
      ...worktree,
      sandboxes: sandboxes.map(({ matches: _, ...s }) => s),
      matches: worktreeMatch || sandboxes.length > 0
    };
  }).filter(w => w.matches);

  // 2. Limit phase (apply limits only if no search query)
  if (!query) {
    return filtered.slice(0, 5).map(worktree => ({
      ...worktree,
      sandboxes: worktree.sandboxes.slice(0, 3).map(sandbox => ({
        ...sandbox,
        sessions: sandbox.sessions.slice(0, 5)
      }))
    }));
  }

  return filtered.map(({ matches: _, ...w }) => w);
});

function sessionStatusIcon(status: string) {
  if (status === 'busy') return '🤔';
  if (status === 'retry') return '🔴';
  if (status === 'idle') return '🟢';
  return '⚪';
}

function formatSandboxLabel(path: string, worktreePath: string) {
  const normalizedPath = path.replace(/\/+$/, '');
  const normalizedWorktree = worktreePath.replace(/\/+$/, '');
  
  if (normalizedPath === normalizedWorktree) return '.';
  
  if (normalizedPath.startsWith(normalizedWorktree + '/')) {
    return normalizedPath.slice(normalizedWorktree.length + 1);
  }
  
  return path.split('/').pop() || path;
}

function canDeleteSandbox(directory: string, worktreeDirectory: string) {
  // Can delete if it's not the main worktree root (unless it's a bare worktree maybe? logic copied from old TopPanel)
  const normalizedDir = directory.replace(/\/+$/, '');
  const normalizedWorktree = worktreeDirectory.replace(/\/+$/, '');
  return normalizedDir !== normalizedWorktree;
}

function handleSessionSelect(worktree: string, directory: string, sessionId: string, close: () => void) {
  emit('select-session', { worktree, directory, sessionId });
  close();
}

function handleCreateWorktree(worktree: string, close: () => void) {
  emit('create-worktree-from', worktree);
  close();
}

function handleSandboxDelete(directory: string, close?: () => void) {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(`Delete worktree "${directory}"?`);
    if (!confirmed) return;
  }
  emit('delete-active-directory', directory);
  close?.();
}

function handleSessionDelete(id: string, close?: () => void) {
  if (typeof window !== 'undefined') {
    const confirmed = window.confirm(`Delete session?`);
    if (!confirmed) return;
  }
  emit('delete-session', id);
  close?.();
}

async function copyText(text: string) {
  if (!text) return;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
  try {
    await navigator.clipboard.writeText(text);
    showCopyToast();
  } catch {
    // ignore
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
  align-items: center;
}

.tree-dropdown-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.tree-dropdown {
  flex: 1;
  min-width: 0;
}

.tree-menu {
  display: flex;
  flex-direction: column;
  max-height: 80vh; /* Allow it to be tall */
  width: 500px;     /* Wide enough for tree structure */
  background: #0f172a;
}

.tree-search {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #334155;
  position: sticky;
  top: 0;
  background: #0f172a;
  z-index: 10;
}

.search-icon {
  color: #64748b;
  width: 14px;
  height: 14px;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #e2e8f0;
  font-size: 13px;
  outline: none;
}

.search-input::placeholder {
  color: #64748b;
}

.clear-search {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.clear-search:hover {
  color: #e2e8f0;
}

.tree-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-empty {
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}

.tree-group {
  display: flex;
  flex-direction: column;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  user-select: none;
}

.worktree-header {
  background: #1e293b;
  color: #e2e8f0;
  font-weight: 600;
  font-size: 12px;
  padding: 6px 12px;
}

.sandbox-header {
  background: #0f172a;
  color: #94a3b8;
  font-size: 12px;
  padding: 4px 12px 4px 28px; /* Indent */
  border-bottom: none;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.group-icon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

.group-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.branch-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #334155;
  color: #94a3b8;
  border-radius: 4px;
  padding: 1px 4px;
  font-size: 10px;
  margin-left: 8px;
}

.branch-icon {
  width: 10px;
  height: 10px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0; /* Show on hover */
  transition: opacity 0.1s;
}

.group-header:hover .header-actions {
  opacity: 1;
}

.action-button {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.action-button:hover {
  background: #334155;
  color: #e2e8f0;
}

.delete-button:hover {
  background: #7f1d1d;
  color: #fecaca;
}

.group-children {
  display: flex;
  flex-direction: column;
}

/* Session items */
.session-item {
  padding-left: 44px !important; /* Indent for session */
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.session-item.is-active {
  background: #1e40af !important;
  color: #fff;
}

.session-status-icon {
  margin-right: 8px;
  font-size: 12px;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
}

.session-item:hover .session-actions {
  opacity: 1;
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
