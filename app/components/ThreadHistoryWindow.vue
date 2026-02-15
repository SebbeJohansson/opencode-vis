<script setup lang="ts">
import MessageViewer from './MessageViewer.vue';
import type { MessageInfo, MessagePart, ToolPart } from '../types/sse';

type HistoryEntry =
  | { kind: 'message'; message: MessageInfo; time: number }
  | { kind: 'tool'; part: ToolPart; time: number };

const HISTORY_TOOL_NAMES = new Set(['bash', 'write', 'edit', 'multiedit', 'apply_patch']);

const props = defineProps<{
  messages: MessageInfo[];
  theme: string;
  getMessageContent: (messageId: string) => string;
  getParts?: (messageId: string) => MessagePart[];
}>();

const emit = defineEmits<{
  (event: 'open-history-tool', payload: { part: ToolPart }): void;
}>();

function formatMessageTime(value?: number) {
  if (typeof value !== 'number') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getToolPartTime(part: ToolPart): number {
  const state = part.state;
  if (state.status === 'running' || state.status === 'completed' || state.status === 'error') {
    return state.time.start;
  }
  return 0;
}

function getHistoryEntries(): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const msg of props.messages) {
    entries.push({ kind: 'message', message: msg, time: msg.time.created });
    if (!props.getParts) continue;
    const parts = props.getParts(msg.id);
    for (const part of parts) {
      if (part.type !== 'tool') continue;
      if (!HISTORY_TOOL_NAMES.has(part.tool)) continue;
      if (part.state.status === 'pending') continue;
      entries.push({ kind: 'tool', part, time: getToolPartTime(part) });
    }
  }
  return entries.sort((a, b) => a.time - b.time);
}

function getHistoryEntryKey(entry: HistoryEntry): string {
  return entry.kind === 'message' ? `msg:${entry.message.id}` : `tool:${entry.part.callID}`;
}

function toolBadgeLabel(tool: string): string {
  switch (tool) {
    case 'bash': return 'SHELL';
    case 'write': return 'WRITE';
    case 'edit': return 'EDIT';
    case 'multiedit': return 'EDIT';
    case 'apply_patch': return 'PATCH';
    default: return tool.toUpperCase();
  }
}

function toolSummary(part: ToolPart): string {
  const input = part.state.input;
  switch (part.tool) {
    case 'bash': {
      const cmd = typeof input?.command === 'string' ? input.command.trim() : '';
      return cmd ? `$ ${cmd.split('\n')[0].slice(0, 120)}` : '$ ...';
    }
    case 'write': {
      const path = typeof input?.filePath === 'string' ? input.filePath : '';
      return path || 'write';
    }
    case 'edit': {
      const path = typeof input?.filePath === 'string' ? input.filePath : '';
      return path || 'edit';
    }
    case 'multiedit': {
      const path = typeof input?.filePath === 'string' ? input.filePath : '';
      return path || 'multiedit';
    }
    case 'apply_patch': {
      const state = part.state;
      const metadata = (state.status === 'completed' || state.status === 'error' || state.status === 'running')
        ? state.metadata : undefined;
      const files = Array.isArray(metadata?.files) ? metadata.files : [];
      const paths = files
        .map((f: unknown) => {
          if (!f || typeof f !== 'object') return null;
          const r = f as Record<string, unknown>;
          return typeof r.relativePath === 'string' ? r.relativePath
            : typeof r.filePath === 'string' ? r.filePath
            : typeof r.file === 'string' ? r.file : null;
        })
        .filter(Boolean) as string[];
      return paths.length > 0 ? paths.join(', ') : 'patch';
    }
    default:
      return part.tool;
  }
}

function toolStatusLabel(part: ToolPart): string {
  return part.state.status;
}

function toolHeaderColor(tool: string): string {
  switch (tool) {
    case 'bash': return '#a855f7';
    case 'edit': case 'multiedit': return '#f97316';
    case 'write': return '#f97316';
    case 'apply_patch': return '#64748b';
    default: return '#64748b';
  }
}

function handleToolClick(part: ToolPart) {
  emit('open-history-tool', { part });
}
</script>

<template>
  <div class="thread-history-window">
    <div class="history-list">
      <template
        v-for="(entry, index) in getHistoryEntries()"
        :key="getHistoryEntryKey(entry)"
      >
        <!-- Message entry -->
        <div
          v-if="entry.kind === 'message'"
          class="history-item"
        >
          <div class="history-meta">
            <span class="history-index">#{{ index + 1 }}</span>
            <span class="history-time">{{ formatMessageTime(entry.message.time.created) }}</span>
            <span v-if="'agent' in entry.message && entry.message.agent" class="history-agent">{{ entry.message.agent }}</span>
          </div>
          <div class="history-content-wrapper">
            <MessageViewer
              :code="props.getMessageContent(entry.message.id)"
              :lang="'markdown'"
              :theme="theme"
            />
          </div>
        </div>
        <!-- Tool entry -->
        <div
          v-else
          class="history-item history-item-tool"
          :style="{ '--tool-color': toolHeaderColor(entry.part.tool) }"
          @click="handleToolClick(entry.part)"
        >
          <div class="history-meta">
            <span class="history-index">#{{ index + 1 }}</span>
            <span class="history-time">{{ formatMessageTime(entry.time) }}</span>
            <span class="history-tool-badge" :class="`history-tool-${entry.part.tool}`">{{ toolBadgeLabel(entry.part.tool) }}</span>
            <span class="history-tool-status" :class="`is-${toolStatusLabel(entry.part)}`">{{ toolStatusLabel(entry.part) }}</span>
          </div>
          <div class="history-tool-content">{{ toolSummary(entry.part) }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.thread-history-window {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.history-list {
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
}

.history-item {
  border: 1px solid #334155;
  border-radius: 8px;
  background: #020617;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-meta {
  padding: 6px 10px;
  background: color-mix(in srgb, #60a5fa 12%, #0f172a);
  border-bottom: 1px solid #1e293b;
  border-radius: 7px 7px 0 0;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: #94a3b8;
}

.history-index {
  font-weight: 600;
  color: #e2e8f0;
}

.history-agent {
  margin-left: auto;
  padding: 2px 6px;
  background: #1e293b;
  border-radius: 4px;
  color: #cbd5e1;
}

.history-content-wrapper {
  padding: 10px;
  font-size: 13px;
  line-height: 1.4;
}

.history-item-tool {
  cursor: pointer;
  border-color: color-mix(in srgb, var(--tool-color, #64748b) 40%, #1e293b);
  transition: border-color 0.15s, background 0.15s;
}

.history-item-tool:hover {
  border-color: color-mix(in srgb, var(--tool-color, #64748b) 60%, #1e293b);
  background: color-mix(in srgb, var(--tool-color, #64748b) 6%, #020617);
}

.history-item-tool .history-meta {
  background: color-mix(in srgb, var(--tool-color, #64748b) 18%, rgba(15, 23, 42, 0.95));
  border-bottom-color: color-mix(in srgb, var(--tool-color, #64748b) 25%, #1e293b);
}

.history-tool-badge {
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #e2e8f0;
  background: #334155;
}

.history-tool-badge.history-tool-bash {
  background: rgba(22, 78, 99, 0.7);
  color: #67e8f9;
}

.history-tool-badge.history-tool-write {
  background: rgba(21, 94, 117, 0.5);
  color: #a5f3fc;
}

.history-tool-badge.history-tool-edit,
.history-tool-badge.history-tool-multiedit {
  background: rgba(30, 58, 138, 0.5);
  color: #bfdbfe;
}

.history-tool-badge.history-tool-apply_patch {
  background: rgba(88, 28, 135, 0.5);
  color: #d8b4fe;
}

.history-tool-status {
  font-size: 10px;
  color: #64748b;
}

.history-tool-status.is-completed {
  color: #4ade80;
}

.history-tool-status.is-error {
  color: #f87171;
}

.history-tool-status.is-running {
  color: #fbbf24;
}

.history-tool-content {
  padding: 6px 10px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.4;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
