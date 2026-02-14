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
                  v-if="root.role === 'user' && root.sessionID"
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
                      :code="getMessageContent(root)"
                      :lang="'markdown'"
                      :theme="theme"
                      @rendered="handleMessageRendered(getThreadUserRenderKey(root))"
                    />
                    <div
                      v-if="getMessageAttachments(root).length > 0"
                      class="output-entry-attachments"
                    >
                      <img
                        v-for="item in getMessageAttachments(root)"
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
                  <div class="ib-msg-block ib-msg-assistant" :key="getDeferredTransitionKey(root)">
                    <div class="ib-msg-body">
                      <MessageViewer
                        :html="getAssistantHtml(root)"
                      />
                    </div>
                    <div v-if="getMessageAttachments(getFinalAnswer(root)).length > 0" class="output-entry-attachments">
                      <img
                        v-for="item in getMessageAttachments(getFinalAnswer(root))"
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
                <span class="history-time">{{ formatMessageTime(getMessageTime(msg)) }}</span>
                <span v-if="msg.agent" class="history-agent">{{ msg.agent }}</span>
              </div>
              <div class="history-content-wrapper">
                <MessageViewer
                  :code="getMessageContent(msg)"
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
import { Transition, computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue';
import MessageViewer from './MessageViewer.vue';
import { renderWorkerHtml } from '../utils/workerRenderer';
import type { MessageAttachment, MessageDiffEntry, MessageStatus, MessageUsage } from '../types/message';
import type { MessageInfo } from '../types/sse';

type DiffEntry = { file: string; diff: string; before?: string; after?: string };

const props = defineProps<{
  roots?: MessageInfo[];
  getChildren?: (parentId: string) => MessageInfo[];
  getThread?: (rootId: string) => MessageInfo[];
  getFinalAnswer?: (rootId: string) => MessageInfo | undefined;
  getTextContent?: (messageId: string) => string;
  getImageAttachments?: (messageId: string) => MessageAttachment[] | undefined;
  getStatus?: (messageId: string) => MessageStatus;
  getUsage?: (messageId: string) => MessageUsage | undefined;
  getError?: (messageId: string) => { name: string; message: string } | null;
  getDiffs?: (messageId: string) => MessageDiffEntry[] | undefined;
  getModelPath?: (messageId: string) => string | undefined;
  getTime?: (messageId: string) => number | undefined;
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

const visibleRoots = computed(() => props.roots ?? []);

function getThread(rootId: string): MessageInfo[] {
  if (props.getThread) return props.getThread(rootId);
  const root = visibleRoots.value.find((item) => item.id === rootId);
  return root ? [root] : [];
}

function getChildren(parentId: string): MessageInfo[] {
  if (props.getChildren) return props.getChildren(parentId);
  return [];
}

function getFinalAnswer(root: MessageInfo): MessageInfo | undefined {
  if (props.getFinalAnswer) return props.getFinalAnswer(root.id);
  const assistants = getThread(root.id).filter((msg) => msg.role === 'assistant' && getMessageContent(msg).length > 0);
  return assistants[assistants.length - 1];
}

function getMessageContent(message?: MessageInfo): string {
  if (!message) return '';
  return props.getTextContent ? props.getTextContent(message.id) : '';
}

function getMessageAttachments(message?: MessageInfo): MessageAttachment[] {
  if (!message || !props.getImageAttachments) return [];
  return props.getImageAttachments(message.id) ?? [];
}

function getMessageStatus(message?: MessageInfo): MessageStatus {
  if (!message) return 'streaming';
  if (props.getStatus) return props.getStatus(message.id);
  if (message.role === 'user') return 'complete';
  if (message.error || message.finish === 'error') return 'error';
  if (message.time.completed !== undefined || message.finish) return 'complete';
  return 'streaming';
}

function getMessageError(message?: MessageInfo): { name: string; message: string } | null {
  if (!message) return null;
  if (props.getError) return props.getError(message.id);
  if (message.role !== 'assistant' || !message.error) return null;
  const data = message.error.data as Record<string, unknown> | undefined;
  const value = typeof data?.message === 'string' ? data.message : '';
  return { name: message.error.name, message: value };
}

function getMessageUsage(message?: MessageInfo): MessageUsage | undefined {
  if (!message || !props.getUsage) return undefined;
  return props.getUsage(message.id);
}

function getMessageDiffEntries(message?: MessageInfo): DiffEntry[] {
  if (!message) return [];
  if (props.getDiffs) return props.getDiffs(message.id) ?? [];
  if (message.role !== 'user' || !Array.isArray(message.summary?.diffs)) return [];
  return message.summary.diffs
    .filter((item) => Boolean(item.file))
    .map((item) => ({
      file: item.file,
      diff: '',
      before: item.before,
      after: item.after,
    }));
}

function getMessageModelPath(message?: MessageInfo): string {
  if (!message) return '';
  if (props.getModelPath) return props.getModelPath(message.id) ?? '';
  if (message.role === 'assistant') {
    if (message.providerID && message.modelID) return `${message.providerID}/${message.modelID}`;
    return message.modelID || message.providerID || '';
  }
  const providerId = message.model.providerID;
  const modelId = message.model.modelID;
  if (providerId && modelId) return `${providerId}/${modelId}`;
  return modelId || providerId || '';
}

function getMessageTime(message?: MessageInfo): number | undefined {
  if (!message) return undefined;
  if (props.getTime) return props.getTime(message.id);
  return typeof message.time.created === 'number' ? message.time.created : undefined;
}

function getFinalAnswerContent(root: MessageInfo): string {
  return getMessageContent(getFinalAnswer(root));
}

function getAssistantMessages(root: MessageInfo): MessageInfo[] {
  return getThread(root.id).filter((msg) => msg.role === 'assistant' && getMessageContent(msg).length > 0);
}

function isThreadStreaming(root: MessageInfo): boolean {
  const directChildren = getChildren(root.id);
  if (directChildren.some((child) => child.role === 'assistant' && getMessageStatus(child) === 'streaming')) {
    return true;
  }
  return getAssistantMessages(root).some((message) => getMessageStatus(message) === 'streaming');
}

function hasAssistantMessages(root: MessageInfo): boolean {
  return getAssistantMessages(root).length > 0;
}

function showHistoryButton(root: MessageInfo): boolean {
  const count = getAssistantMessages(root).length;
  return count > 1 || (props.isThinking && isThreadStreaming(root));
}

function showThreadHistory(root: MessageInfo) {
  activeHistoryRoot.value = root;
}

function closeHistory() {
  activeHistoryRoot.value = null;
}

function getThreadError(root: MessageInfo): { name: string; message: string } | null {
  const final = getFinalAnswer(root);
  const finalError = getMessageError(final);
  if (finalError) return finalError;
  const thread = getThread(root.id);
  for (let index = thread.length - 1; index >= 0; index--) {
    const error = getMessageError(thread[index]);
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

function getThreadDiffs(root: MessageInfo): DiffEntry[] {
  const final = getFinalAnswer(root);
  const map = props.messageDiffs;
  if (map && typeof map.get === 'function') {
    const keys = [
      final?.id,
      root.id,
      final?.sessionID && final?.id ? `${final.sessionID}:${final.id}` : undefined,
      root.sessionID && root.id ? `${root.sessionID}:${root.id}` : undefined,
    ].filter((value): value is string => Boolean(value));
    for (const key of keys) {
      const mapped = map.get(key);
      if (mapped && mapped.length > 0) return mapped;
    }
  }
  const finalDiffs = getMessageDiffEntries(final);
  if (finalDiffs.length > 0) return finalDiffs;
  return getMessageDiffEntries(root);
}

function hasThreadDiffs(root: MessageInfo): boolean {
  return getThreadDiffs(root).length > 0;
}

function showThreadDiff(root: MessageInfo) {
  const diffs = getThreadDiffs(root);
  if (diffs.length === 0) return;
  const messageKey = getFinalAnswer(root)?.id ?? root.id;
  emit('show-message-diff', { messageKey, diffs });
}

function canRevertThread(root: MessageInfo): boolean {
  return root.role === 'user' && Boolean(root.sessionID) && hasThreadDiffs(root);
}

function confirmFork(root: MessageInfo) {
  if (root.role !== 'user' || !root.sessionID || !root.id) return;
  if (!window.confirm('Fork from this message?')) return;
  emit('fork-message', { sessionId: root.sessionID, messageId: root.id });
}

function confirmRevert(root: MessageInfo) {
  if (root.role !== 'user' || !root.sessionID || !root.id) return;
  if (!window.confirm('Revert to this message?')) return;
  emit('revert-message', { sessionId: root.sessionID, messageId: root.id });
}

function formatThreadTargetLabel(root: MessageInfo): string {
  const final = getFinalAnswer(root);
  const parts: string[] = [];
  const agent = root.agent ?? final?.agent;
  if (agent) parts.push(`Agent ${agent}`);
  const modelPath = getMessageModelPath(root) || getMessageModelPath(final);
  if (modelPath) parts.push(modelPath);
  const variant = root.variant ?? final?.variant;
  if (variant) parts.push(`(${variant})`);
  return parts.join(' ');
}

function getRoundTargetStyle(root: MessageInfo) {
  const final = getFinalAnswer(root);
  const color = props.resolveAgentColor ? props.resolveAgentColor(root.agent ?? final?.agent) : '#4ade80';
  return { color };
}

function getUserBoxStyle(root: MessageInfo) {
  const final = getFinalAnswer(root);
  const color = props.resolveAgentColor ? props.resolveAgentColor(root.agent ?? final?.agent) : '#334155';
  if (color.startsWith('#') && color.length === 7) {
    return { borderLeftColor: `${color}99` };
  }
  return { borderLeftColor: color };
}

function formatThreadTimestamp(root: MessageInfo): string {
  return formatMessageTime(getMessageTime(getFinalAnswer(root)) ?? getMessageTime(root));
}

function formatThreadElapsed(root: MessageInfo): string {
  const final = getFinalAnswer(root);
  const start = getMessageTime(root);
  const end = getMessageTime(final);
  if (typeof start !== 'number' || typeof end !== 'number') return '';
  const sec = Math.round((end - start) / 1000);
  if (sec < 1) return '';
  if (sec < 60) return `thought ${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `thought ${min}m${rem}s` : `thought ${min}m`;
}

function formatThreadFooterMeta(root: MessageInfo): string {
  const parts: string[] = [];
  const timestamp = formatThreadTimestamp(root);
  if (timestamp) parts.push(timestamp);
  const contextPercent = formatContextPercent(getFinalAnswer(root));
  if (contextPercent) parts.push(contextPercent);
  const elapsed = formatThreadElapsed(root);
  if (elapsed) parts.push(elapsed);
  return parts.join(', ');
}

function formatContextPercent(message?: MessageInfo): string {
  const value = getMessageUsage(message)?.contextPercent;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
  return `ctx ${Math.round(value)}%`;
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
const activeHistoryRoot = ref<MessageInfo | null>(null);
let thinkingTimer: number | undefined;
let contentResizeObserver: ResizeObserver | undefined;

// --- Assistant reply pre-rendering ---
// rootId → pre-rendered HTML
const assistantHtmlCache = reactive(new Map<string, string>());
// rootId → confirmed transition key (deferred until pre-render completes)
const deferredKeyCache = reactive(new Map<string, string>());
// Ordering (non-reactive)
const submitSeqMap = new Map<string, number>();
const appliedSeqMap = new Map<string, number>();
// Deduplication
const lastSubmitted = new Map<string, { answerId: string; content: string; theme: string }>();

function submitAssistantRender(rootId: string, answerId: string, content: string) {
  const seq = (submitSeqMap.get(rootId) ?? 0) + 1;
  submitSeqMap.set(rootId, seq);

  const requestId = `assistant-${rootId}-${seq}`;
  renderWorkerHtml({
    id: requestId,
    code: content,
    lang: 'markdown',
    theme: props.theme,
    gutterMode: 'none',
  }).then((html) => {
    const applied = appliedSeqMap.get(rootId) ?? 0;
    if (seq <= applied) return;
    appliedSeqMap.set(rootId, seq);
    assistantHtmlCache.set(rootId, html);
    deferredKeyCache.set(rootId, answerId);
  });
}

function getDeferredTransitionKey(root: MessageInfo): string {
  return deferredKeyCache.get(root.id) ?? getThreadTransitionKey(root);
}

function getAssistantHtml(root: MessageInfo): string | undefined {
  return assistantHtmlCache.get(root.id);
}

watchEffect(() => {
  const theme = props.theme;
  for (const root of visibleRoots.value) {
    if (!hasAssistantMessages(root)) continue;
    const final = getFinalAnswer(root);
    const answerId = final?.id ?? root.id;
    const content = getFinalAnswerContent(root);

    const last = lastSubmitted.get(root.id);
    if (last && last.answerId === answerId && last.content === content && last.theme === theme) {
      continue;
    }
    lastSubmitted.set(root.id, { answerId, content, theme });
    submitAssistantRender(root.id, answerId, content);
  }
});

const thinkingDisplayText = computed(() => {
  if (!props.isThinking) return '🟢 Idle';
  const descendants = props.busyDescendantCount ?? 0;
  const total = Math.max(1, 1 + descendants);
  const heads = '🤔'.repeat(Math.min(total, 8));
  return `${heads} Thinking${thinkingSuffix.value}`;
});

function getThreadUserRenderKey(root: MessageInfo): string {
  return `thread-user:${root.id}`;
}

function getThreadAssistantRenderKey(root: MessageInfo): string {
  const final = getFinalAnswer(root);
  return `thread-assistant:${root.id}:${final?.id ?? 'none'}`;
}

function getThreadTransitionKey(root: MessageInfo): string {
  return getFinalAnswer(root)?.id ?? root.id;
}

function isRootRendered(root: MessageInfo): boolean {
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
