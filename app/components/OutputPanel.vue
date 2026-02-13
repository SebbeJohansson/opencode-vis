<template>
  <div class="output-panel-root">
    <div class="output-panel-shell">
      <div
        ref="panelEl"
        class="output-panel-scroll"
        @scroll="handleScroll"
        @wheel="$emit('wheel', $event)"
        @touchmove="$emit('touchmove')"
      >
        <div ref="contentEl" class="output-panel-content">
          <template v-for="root in visibleRoots" :key="root.id">
            <div class="thread-block">
              <button
                v-if="root.role === 'user' && root.sessionId"
                type="button"
                class="ib-action ib-top-right"
                @click="confirmFork(root)"
              >
                FORK
              </button>

              <div class="thread-user" :style="getUserBoxStyle(root)">
                <div v-if="root.role === 'user'" class="ib-msg-block ib-msg-user">
                  <div class="ib-msg-row">
                    <MessageViewer
                      :code="root.content"
                      :lang="'markdown'"
                      :theme="theme"
                      @rendered="handleMessageRendered(getThreadUserRenderKey(root))"
                    />
                    <div
                      v-if="root.attachments && root.attachments.length > 0"
                      class="output-entry-attachments"
                    >
                      <img
                        v-for="item in root.attachments"
                        :key="item.id"
                        class="output-entry-attachment clickable"
                        :src="item.url"
                        :alt="item.filename"
                        loading="lazy"
                        @click="$emit('open-image', { url: item.url, filename: item.filename })"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="formatThreadTargetLabel(root)" class="ib-round-target" :style="getRoundTargetStyle(root)">
                {{ formatThreadTargetLabel(root) }}
              </div>

              <div v-if="hasAssistantMessages(root)" class="thread-assistant">
                <Transition name="ib-fade" mode="out-in">
                  <div class="ib-msg-block ib-msg-assistant" :key="getThreadTransitionKey(root)">
                    <div class="ib-msg-body">
                      <MessageViewer
                        :code="getFinalAnswerContent(root)"
                        :lang="'markdown'"
                        :theme="theme"
                        @rendered="handleMessageRendered(getThreadAssistantRenderKey(root))"
                      />
                    </div>
                    <div
                      v-if="isThreadStreaming(root)"
                      class="ib-streaming-indicator"
                    >
                      streaming...
                    </div>
                    <div
                      v-if="getFinalAnswer(root)?.attachments && (getFinalAnswer(root)?.attachments?.length ?? 0) > 0"
                      class="output-entry-attachments"
                    >
                      <img
                        v-for="item in getFinalAnswer(root)?.attachments ?? []"
                        :key="item.id"
                        class="output-entry-attachment clickable"
                        :src="item.url"
                        :alt="item.filename"
                        loading="lazy"
                        @click="$emit('open-image', { url: item.url, filename: item.filename })"
                      />
                    </div>
                    <button
                      v-if="showHistoryButton(root)"
                      type="button"
                      class="ib-action ib-action-history"
                      :title="`${getAssistantMessages(root).length} messages - click to view history`"
                      @click="showThreadHistory(root)"
                    >
                      History ({{ getAssistantMessages(root).length }})
                    </button>
                  </div>
                </Transition>
              </div>

              <div v-if="getThreadError(root)" class="ib-error-bar">
                <span class="ib-error-icon">⊘</span>
                <span class="ib-error-text">{{ formatMessageError(getThreadError(root)!) }}</span>
              </div>

              <div class="ib-footer">
                <span class="ib-footer-meta">{{ formatThreadFooterMeta(root) }}</span>
                <span class="ib-footer-actions">
                  <button
                    v-if="hasThreadDiffs(root)"
                    type="button"
                    class="ib-action ib-action-diff"
                    @click="showThreadDiff(root)"
                  >
                    DIFF
                  </button>
                  <button
                    v-if="canRevertThread(root)"
                    type="button"
                    class="ib-action ib-action-danger"
                    @click="confirmRevert(root)"
                  >
                    REVERT
                  </button>
                </span>
              </div>
            </div>
          </template>
          <button
            v-show="!isFollowing"
            type="button"
            class="follow-button"
            aria-label="Scroll to latest"
            @click="$emit('resume-follow')"
          >
            <Icon icon="lucide:arrow-down" :width="14" :height="14" />
          </button>
        </div>
      </div>
      
      <!-- History Popup -->
      <div v-if="activeHistoryRoot" class="history-overlay" @click.self="closeHistory">
        <div class="history-popup">
          <div class="history-header">
            <h3 class="history-title">Thread History</h3>
            <button type="button" class="history-close" @click="closeHistory">
              <Icon icon="lucide:x" :width="16" :height="16" />
            </button>
          </div>
          <div class="history-list">
            <div 
              v-for="(msg, index) in getAssistantMessages(activeHistoryRoot)" 
              :key="msg.id" 
              class="history-item"
              :class="{ 'is-latest': index === getAssistantMessages(activeHistoryRoot).length - 1 }"
            >
              <div class="history-meta">
                <span class="history-index">#{{ index + 1 }}</span>
                <span class="history-time">{{ formatMessageTime(msg.time) }}</span>
                <span v-if="msg.agent" class="history-agent">{{ msg.agent }}</span>
              </div>
              <div class="history-content-wrapper">
                <MessageViewer
                  :code="msg.content"
                  :lang="'markdown'"
                  :theme="theme"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="statusbar" role="status" aria-live="polite">
        <div class="statusbar-section statusbar-left">
          <span class="statusbar-text">{{ thinkingDisplayText }}</span>
        </div>
        <div
          class="statusbar-section statusbar-right"
          :class="{ 'is-error': isStatusError, 'is-retry': isRetryStatus }"
        >
          {{ statusText }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { Transition, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MessageViewer from './MessageViewer.vue';
import type { Message } from '../types/message';

type DiffEntry = { file: string; diff: string; before?: string; after?: string };
type LegacyQueueMessage = {
  isMessage?: boolean;
  isSubagentMessage?: boolean;
  messageId?: string;
  messageKey?: string;
  sessionId?: string;
  role?: 'user' | 'assistant';
  content?: string;
  messageAgent?: string;
  messageModel?: string;
  messageProviderId?: string;
  messageModelId?: string;
  messageVariant?: string;
  messageTime?: number;
  messageUsage?: Message['usage'];
  attachments?: Message['attachments'];
  messageError?: { name: string; message: string } | null;
  status?: Message['status'];
};

const props = defineProps<{
  roots?: Message[];
  getChildren?: (parentId: string) => Message[];
  getThread?: (rootId: string) => Message[];
  getFinalAnswer?: (rootId: string) => Message | undefined;
  queue?: unknown[];
  isFollowing: boolean;
  statusText: string;
  isStatusError: boolean;
  isThinking: boolean;
  isRetryStatus?: boolean;
  busyDescendantCount?: number;
  theme: string;
  resolveAgentColor?: (agent?: string) => string;
  messageDiffs?: Map<string, DiffEntry[]>;
}>();

const emit = defineEmits<{
  (event: 'scroll'): void;
  (event: 'wheel', eventArg: WheelEvent): void;
  (event: 'touchmove'): void;
  (event: 'resume-follow'): void;
  (event: 'fork-message', payload: { sessionId: string; messageId: string }): void;
  (event: 'revert-message', payload: { sessionId: string; messageId: string }): void;
  (event: 'show-message-diff', payload: { messageKey: string; diffs: DiffEntry[] }): void;
  (event: 'open-image', payload: { url: string; filename: string }): void;
  (event: 'message-rendered'): void;
  (event: 'content-resized'): void;
  (event: 'initial-render-complete'): void;
}>();

function followDebug(event: string, detail?: Record<string, unknown>) {
  const t = typeof performance !== 'undefined' ? Number(performance.now().toFixed(1)) : 0;
  if (detail) {
    console.debug(`[output-panel] ${event}`, { t, ...detail });
    return;
  }
  console.debug(`[output-panel] ${event}`, { t });
}

const legacyThreads = computed(() => {
  const raw = Array.isArray(props.queue) ? props.queue : [];
  const normalized: Message[] = [];
  for (let index = 0; index < raw.length; index++) {
    const item = raw[index] as LegacyQueueMessage;
    if (!item?.isMessage || item.isSubagentMessage) continue;
    const role = item.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const id = item.messageId ?? item.messageKey ?? `legacy:${index}`;
    const sessionId = item.sessionId ?? 'legacy';
    normalized.push({
      id,
      sessionId,
      role,
      content: item.content ?? '',
      status: item.status ?? 'complete',
      agent: item.messageAgent,
      model: item.messageModel,
      providerId: item.messageProviderId,
      modelId: item.messageModelId,
      variant: item.messageVariant,
      time: item.messageTime,
      usage: item.messageUsage,
      attachments: item.attachments,
      error: item.messageError ?? null,
    });
  }
  const roots: Message[] = [];
  const byParent = new Map<string, Message[]>();
  const byRoot = new Map<string, Message[]>();
  let activeRootId = '';
  normalized.forEach((message) => {
    if (message.role === 'user') {
      activeRootId = message.id;
      roots.push(message);
      byRoot.set(activeRootId, [message]);
      return;
    }
    if (!activeRootId) return;
    message.parentId = activeRootId;
    const children = byParent.get(activeRootId) ?? [];
    children.push(message);
    byParent.set(activeRootId, children);
    const thread = byRoot.get(activeRootId) ?? [];
    thread.push(message);
    byRoot.set(activeRootId, thread);
  });
  return { roots, byParent, byRoot };
});

const visibleRoots = computed(() => {
  const roots = props.roots ?? [];
  if (roots.length > 0) return roots;
  return legacyThreads.value.roots;
});

function getThread(rootId: string): Message[] {
  if (props.getThread) return props.getThread(rootId);
  const roots = props.roots ?? [];
  if (roots.length > 0) {
    const root = roots.find((item) => item.id === rootId);
    return root ? [root] : [];
  }
  return legacyThreads.value.byRoot.get(rootId) ?? [];
}

function getChildren(parentId: string): Message[] {
  if (props.getChildren) return props.getChildren(parentId);
  const roots = props.roots ?? [];
  if (roots.length > 0) return [];
  return legacyThreads.value.byParent.get(parentId) ?? [];
}

function getFinalAnswer(root: Message): Message | undefined {
  if (props.getFinalAnswer) return props.getFinalAnswer(root.id);
  const assistants = getThread(root.id).filter((msg) => msg.role === 'assistant');
  return assistants[assistants.length - 1];
}

function getFinalAnswerContent(root: Message): string {
  return getFinalAnswer(root)?.content ?? '';
}

function getAssistantMessages(root: Message): Message[] {
  return getThread(root.id).filter((msg) => msg.role === 'assistant');
}

function isThreadStreaming(root: Message): boolean {
  const directChildren = getChildren(root.id);
  if (directChildren.some((child) => child.role === 'assistant' && child.status === 'streaming')) {
    return true;
  }
  return getAssistantMessages(root).some((message) => message.status === 'streaming');
}

function hasAssistantMessages(root: Message): boolean {
  return getAssistantMessages(root).length > 0;
}

function showHistoryButton(root: Message): boolean {
  const count = getAssistantMessages(root).length;
  return count > 1 || (props.isThinking && isThreadStreaming(root));
}

function showThreadHistory(root: Message) {
  activeHistoryRoot.value = root;
}

function closeHistory() {
  activeHistoryRoot.value = null;
}

function getThreadError(root: Message): { name: string; message: string } | null {
  const final = getFinalAnswer(root);
  if (final?.error) return final.error;
  const thread = getThread(root.id);
  for (let index = thread.length - 1; index >= 0; index--) {
    const error = thread[index].error;
    if (error) return error;
  }
  return null;
}

function formatMessageError(error: { name: string; message: string }): string {
  if (error.name === 'MessageAbortedError') return error.message || 'Aborted';
  const parts: string[] = [];
  if (error.name) parts.push(error.name);
  if (error.message) parts.push(error.message);
  return parts.join(': ') || 'Error';
}

function getThreadDiffs(root: Message): DiffEntry[] {
  const final = getFinalAnswer(root);
  return final?.diffs ?? root.diffs ?? [];
}

function hasThreadDiffs(root: Message): boolean {
  return getThreadDiffs(root).length > 0;
}

function showThreadDiff(root: Message) {
  const diffs = getThreadDiffs(root);
  if (diffs.length === 0) return;
  const messageKey = getFinalAnswer(root)?.id ?? root.id;
  emit('show-message-diff', { messageKey, diffs });
}

function canRevertThread(root: Message): boolean {
  return root.role === 'user' && Boolean(root.sessionId) && hasThreadDiffs(root);
}

function confirmFork(root: Message) {
  if (root.role !== 'user' || !root.sessionId || !root.id) return;
  if (!window.confirm('Fork from this message?')) return;
  emit('fork-message', { sessionId: root.sessionId, messageId: root.id });
}

function confirmRevert(root: Message) {
  if (root.role !== 'user' || !root.sessionId || !root.id) return;
  if (!window.confirm('Revert to this message?')) return;
  emit('revert-message', { sessionId: root.sessionId, messageId: root.id });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatThreadTargetLabel(root: Message): string {
  const final = getFinalAnswer(root);
  const parts: string[] = [];
  if (final?.agent) parts.push(capitalize(final.agent));
  const modelPath =
    final?.providerId && final?.modelId
      ? `${final.providerId}/${final.modelId}`
      : final?.model || '';
  if (modelPath) parts.push(modelPath);
  if (final?.variant) parts.push(`(${final.variant})`);
  return parts.join(' ');
}

function getRoundTargetStyle(root: Message) {
  const final = getFinalAnswer(root);
  const color = props.resolveAgentColor ? props.resolveAgentColor(final?.agent) : '#4ade80';
  return { color };
}

function getUserBoxStyle(root: Message) {
  const color = props.resolveAgentColor ? props.resolveAgentColor(root.agent) : '#334155';
  if (color.startsWith('#') && color.length === 7) {
    return { borderLeftColor: `${color}99` };
  }
  return { borderLeftColor: color };
}

function formatThreadTimestamp(root: Message): string {
  return formatMessageTime(getFinalAnswer(root)?.time ?? root.time);
}

function formatThreadElapsed(root: Message): string {
  const final = getFinalAnswer(root);
  const start = root.time;
  const end = final?.time;
  if (typeof start !== 'number' || typeof end !== 'number') return '';
  const sec = Math.round((end - start) / 1000);
  if (sec < 1) return '';
  if (sec < 60) return `thought ${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `thought ${min}m${rem}s` : `thought ${min}m`;
}

function formatThreadFooterMeta(root: Message): string {
  const parts: string[] = [];
  const timestamp = formatThreadTimestamp(root);
  if (timestamp) parts.push(timestamp);
  const usage = formatMessageUsage(getFinalAnswer(root));
  if (usage) parts.push(usage);
  const elapsed = formatThreadElapsed(root);
  if (elapsed) parts.push(elapsed);
  return parts.join(', ');
}

function formatMessageUsage(message?: Message): string {
  if (!message?.usage || message.role !== 'assistant') return '';
  const tokens = message.usage.tokens;
  if (!tokens) return '';
  const input = formatCompactCount(tokens.input);
  const output = formatCompactCount(tokens.output);
  const reasoning = formatCompactCount(tokens.reasoning);
  if (input === '0' && output === '0' && reasoning === '0') return '';
  const cost = typeof message.usage.cost === 'number' ? formatCost(message.usage.cost) : '$--';
  return `In ${input} / Out ${output} / Reason ${reasoning} / ${cost}`;
}

function formatCompactCount(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (value <= 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function formatCost(value: number) {
  if (!Number.isFinite(value)) return '$--';
  if (value === 0) return '$0.000';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(3)}`;
}

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

const panelEl = ref<HTMLDivElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
const pendingInitialRenderKeys = ref(new Set<string>());
const initialRenderTrackingActive = ref(false);
const renderedKeys = ref(new Set<string>());
const thinkingFrames = ['', '.', '..', '...'];
const thinkingIndex = ref(0);
const thinkingSuffix = ref('');
const activeHistoryRoot = ref<Message | null>(null);
let thinkingTimer: number | undefined;
let contentResizeObserver: ResizeObserver | undefined;

const thinkingDisplayText = computed(() => {
  if (!props.isThinking) return '🟢 Idle';
  const descendants = props.busyDescendantCount ?? 0;
  const total = Math.max(1, 1 + descendants);
  const heads = '🤔'.repeat(Math.min(total, 8));
  return `${heads} Thinking${thinkingSuffix.value}`;
});

function getThreadUserRenderKey(root: Message): string {
  return `thread-user:${root.id}`;
}

function getThreadAssistantRenderKey(root: Message): string {
  const final = getFinalAnswer(root);
  return `thread-assistant:${root.id}:${final?.id ?? 'none'}`;
}

function getThreadTransitionKey(root: Message): string {
  return getFinalAnswer(root)?.id ?? root.id;
}

function isRootRendered(root: Message): boolean {
  const keys = [getThreadUserRenderKey(root)];
  if (hasAssistantMessages(root)) keys.push(getThreadAssistantRenderKey(root));
  return keys.every((key) => renderedKeys.value.has(key));
}

function collectInitialRenderKeys(): Set<string> {
  const keys = new Set<string>();
  visibleRoots.value.forEach((root) => {
    keys.add(getThreadUserRenderKey(root));
    if (hasAssistantMessages(root)) keys.add(getThreadAssistantRenderKey(root));
  });
  return keys;
}

function beginInitialRenderTracking() {
  const keys = collectInitialRenderKeys();
  pendingInitialRenderKeys.value = keys;
  initialRenderTrackingActive.value = keys.size > 0;
  followDebug('beginInitialRenderTracking', { keyCount: keys.size });
  if (keys.size === 0) emit('initial-render-complete');
}

function handleScroll() {
  initialRenderTrackingActive.value = false;
  followDebug('handleScroll');
  emit('scroll');
}

function handleMessageRendered(renderKey: string) {
  renderedKeys.value.add(renderKey);
  followDebug('message-rendered', {
    renderKey,
    pendingBefore: pendingInitialRenderKeys.value.size,
    tracking: initialRenderTrackingActive.value,
  });
  emit('message-rendered');
  if (!initialRenderTrackingActive.value) return;
  const keys = pendingInitialRenderKeys.value;
  keys.delete(renderKey);
  if (keys.size > 0) return;
  initialRenderTrackingActive.value = false;
  followDebug('initial-render-complete:all-rendered');
  emit('initial-render-complete');
}

function setupContentResizeObserver() {
  contentResizeObserver?.disconnect();
  contentResizeObserver = undefined;
  if (typeof ResizeObserver === 'undefined') return;
  const target = contentEl.value;
  if (!target) return;
  contentResizeObserver = new ResizeObserver(() => {
    followDebug('content-resized', { rootCount: visibleRoots.value.length });
    emit('content-resized');
  });
  contentResizeObserver.observe(target);
}

watch(
  () => props.isThinking,
  (active) => {
    if (!active) {
      if (thinkingTimer !== undefined) {
        window.clearInterval(thinkingTimer);
        thinkingTimer = undefined;
      }
      thinkingIndex.value = 0;
      thinkingSuffix.value = '';
      return;
    }
    thinkingIndex.value = 0;
    thinkingSuffix.value = thinkingFrames[thinkingIndex.value] ?? '';
    if (thinkingTimer !== undefined) window.clearInterval(thinkingTimer);
    thinkingTimer = window.setInterval(() => {
      thinkingIndex.value = (thinkingIndex.value + 1) % thinkingFrames.length;
      thinkingSuffix.value = thinkingFrames[thinkingIndex.value] ?? '';
    }, 350);
  },
  { immediate: true },
);

watch(contentEl, () => {
  setupContentResizeObserver();
});

watch(
  () => visibleRoots.value.length,
  (length, previous) => {
    if (length === 0) {
      pendingInitialRenderKeys.value = new Set<string>();
      initialRenderTrackingActive.value = false;
      renderedKeys.value = new Set<string>();
      return;
    }
    if (previous === 0) beginInitialRenderTracking();
  },
);

onMounted(() => {
  setupContentResizeObserver();
  nextTick(() => {
    beginInitialRenderTracking();
    followDebug('mounted:content-resized-kickoff');
    emit('content-resized');
  });
});

onBeforeUnmount(() => {
  contentResizeObserver?.disconnect();
  contentResizeObserver = undefined;
  if (thinkingTimer !== undefined) window.clearInterval(thinkingTimer);
});

defineExpose({ panelEl });
</script>

<style scoped>
.output-panel-root {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.output-panel-shell {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 12px;
  background-clip: padding-box;
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.45);
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
}

.output-panel-scroll {
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.output-panel-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 100%;
}

.output-entry-attachments {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
  margin-top: 6px;
}

.output-entry-attachment {
  width: 100%;
  max-height: 180px;
  border-radius: 8px;
  border: 1px solid #1e293b;
  object-fit: cover;
  background: #0b1320;
}

.output-entry-attachment.clickable {
  cursor: pointer;
}

.follow-button {
  position: sticky;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  width: 36px;
  height: 36px;
  aspect-ratio: 1 / 1;
  box-sizing: border-box;
  border-radius: 999px;
  border: 1px solid #334155;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  font-size: 18px;
  line-height: 1;
  display: grid;
  place-items: center;
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.45);
  cursor: pointer;
  align-self: center;
  margin-top: 4px;
  z-index: 2;
}

.statusbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  border-top: none;
  background: transparent;
  color: #94a3b8;
  font-size: 8pt;
  line-height: 1.2;
  margin: 0;
  border-radius: 0;
  box-sizing: border-box;
  z-index: 2;
}

.statusbar-section {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.statusbar-right {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.statusbar-right.is-error,
.statusbar-right.is-retry {
  color: #fecaca;
}

.follow-button:hover {
  background: rgba(30, 41, 59, 0.98);
}

.thread-block {
  background: rgba(2, 6, 23, 0.6);
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
}

.thread-user {
  border-left: 3px solid;
  padding-left: 8px;
  width: 100%;
  box-sizing: border-box;
}

.ib-round-target {
  font-size: 10px;
  font-weight: 600;
  margin-top: 4px;
  opacity: 0.7;
}

.ib-msg-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ib-msg-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ib-msg-user {
  font-size: 13px;
  padding: 4px 0;
}

.ib-msg-assistant {
  margin-top: 4px;
}

.thread-assistant {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.ib-msg-body {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  --message-line-height: 1.2;
  line-height: var(--message-line-height);
  padding-top: 3px;
  padding-left: 6px;
}

.ib-streaming-indicator {
  margin-top: 4px;
  padding-left: 6px;
  font-size: 10px;
  color: rgba(148, 163, 184, 0.85);
}

.ib-footer-meta {
  font-size: 10px;
  color: rgba(148, 163, 184, 0.7);
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ib-top-right {
  float: right;
  margin: -2px -2px 4px 8px;
}

.ib-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.ib-footer-actions {
  display: flex;
  gap: 4px;
  flex: 0 0 auto;
}

.ib-action {
  border: 1px solid rgba(148, 163, 184, 0.65);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.75);
  color: #bfdbfe;
  font-size: 10px;
  line-height: 1;
  padding: 3px 7px;
  cursor: pointer;
  white-space: nowrap;
}

.ib-action:hover {
  background: rgba(30, 41, 59, 0.92);
}

.ib-action-diff {
  border-color: rgba(96, 165, 250, 0.7);
  background: rgba(30, 58, 138, 0.35);
  color: #bfdbfe;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.ib-action-diff:hover {
  background: rgba(30, 64, 175, 0.55);
}

.ib-action-danger {
  border-color: rgba(248, 113, 113, 0.7);
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
}

.ib-action-danger:hover {
  background: rgba(153, 27, 27, 0.5);
}

.ib-action-history {
  border-color: rgba(148, 163, 184, 0.5);
  background: rgba(30, 41, 59, 0.35);
  color: #94a3b8;
  font-size: 10px;
  margin-top: 4px;
  align-self: flex-end;
}

.ib-action-history:hover {
  background: rgba(51, 65, 85, 0.55);
  color: #cbd5e1;
}

.ib-error-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(127, 29, 29, 0.3);
  border: 1px solid rgba(248, 113, 113, 0.4);
  color: #fca5a5;
  font-size: 11px;
  line-height: 1.3;
}

.ib-error-icon {
  flex-shrink: 0;
  font-size: 13px;
  color: #f87171;
}

.ib-error-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ib-fade-enter-active,
.ib-fade-leave-active {
  transition: opacity 0.3s ease;
}

.ib-fade-enter-from,
.ib-fade-leave-to {
  opacity: 0;
}

.history-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(2px);
}

.history-popup {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 85%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.history-header {
  padding: 12px 16px;
  border-bottom: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1e293b;
}

.history-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.history-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.history-close:hover {
  background: #334155;
  color: #fff;
}

.history-list {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-item {
  border: 1px solid #1e293b;
  border-radius: 8px;
  background: #020617;
  overflow: hidden;
}

.history-item.is-latest {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.history-meta {
  padding: 6px 10px;
  background: #0f172a;
  border-bottom: 1px solid #1e293b;
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
</style>
