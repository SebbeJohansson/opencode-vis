<template>
  <div
    class="term"
    @pointerdown.capture="onFocus"
    :data-tool-key="entry.toolKey ?? entry.callId ?? undefined"
    :data-message-key="entry.messageId ? buildMessageKey(entry.messageId, entry.sessionId) : undefined"
    :class="termClass"
    :style="termStyle"
  >
    <div class="term-titlebar" @pointerdown="onDragStart">
      {{ getEntryTitle(entry) }}
    </div>
    <div
      class="term-inner"
      :class="{ 'is-scrolling': entry.scroll }"
      :style="{
        '--scroll-distance': `${entry.scrollDistance}px`,
        '--scroll-duration': `${entry.scrollDuration}s`,
      }"
      @scroll="onFloatingScroll"
      @wheel="onFloatingWheel"
    >
      <div v-if="entry.isShell" class="xterm-host" :data-shell-id="entry.shellId"></div>
      <PermissionWindow
        v-else-if="entry.isPermission && entry.permissionRequest"
        :request="entry.permissionRequest"
        :is-submitting="isPermissionSubmitting(entry.permissionRequest.id)"
        :error="getPermissionError(entry.permissionRequest.id)"
        @reply="onPermissionReply"
      />
      <QuestionWindow
        v-else-if="entry.isQuestion && entry.questionRequest"
        :request="entry.questionRequest"
        :is-submitting="isQuestionSubmitting(entry.questionRequest.id)"
        :error="getQuestionError(entry.questionRequest.id)"
        @reply="onQuestionReply"
        @reject="onQuestionReject"
      />
      <DiffViewer
        v-else-if="entry.toolName === 'apply_patch' && entry.content"
        :code="''"
        :patch="entry.content"
        :lang="entry.toolLang ?? 'diff'"
        :theme="theme"
      />
      <MessageViewer
        v-else
        :code="renderCode"
        :lang="viewerLang"
        :theme="theme"
        :wrap-mode="viewerWrapMode"
        :gutter-mode="viewerGutterMode"
        :gutter-lines="viewerGutterLines"
        :grep-pattern="viewerGrepPattern"
        :is-message="entry.isMessage"
        @rendered="onRendered"
      />
    </div>
    <div
      v-if="showResizer"
      class="term-resizer"
      @pointerdown="onResizeStart"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DiffViewer from './DiffViewer.vue';
import MessageViewer from './MessageViewer.vue';
import PermissionWindow from './PermissionWindow.vue';
import QuestionWindow from './QuestionWindow.vue';

type PermissionReply = 'once' | 'always' | 'reject';
type QuestionAnswer = string[];

type ToolWindowEntry = {
  time: number;
  x: number;
  y: number;
  header: string;
  scroll: boolean;
  scrollDistance: number;
  scrollDuration: number;
  html: string;
  content?: string;
  toolLang?: string;
  grepPattern?: string;
  isWrite: boolean;
  isMessage: boolean;
  isSubagentMessage?: boolean;
  isReasoning?: boolean;
  isShell?: boolean;
  isPermission?: boolean;
  isQuestion?: boolean;
  role?: 'user' | 'assistant';
  toolStatus?: string;
  toolName?: string;
  toolKey?: string;
  toolWrapMode?: 'default' | 'soft';
  toolGutterMode?: 'default' | 'none' | 'grep-source';
  toolGutterLines?: string[];
  messageId?: string;
  sessionId?: string;
  messageAgent?: string;
  callId?: string;
  zIndex?: number;
  width?: number;
  height?: number;
  shellId?: string;
  permissionRequest?: { id: string };
  questionRequest?: { id: string };
};

const props = defineProps<{
  entry: ToolWindowEntry;
  getEntryTitle: (entry: ToolWindowEntry) => string;
  resolveAgentTone: (agent?: string) => string;
  buildMessageKey: (messageId: string, sessionId?: string) => string;
  onFocusEntry: (entry: ToolWindowEntry, event: PointerEvent) => void;
  onDragEntry: (entry: ToolWindowEntry, event: PointerEvent) => void;
  onResizeEntry: (entry: ToolWindowEntry, event: PointerEvent) => void;
  onFloatingScrollEntry: (entry: ToolWindowEntry, event: Event) => void;
  onFloatingWheelEntry: (entry: ToolWindowEntry, event: WheelEvent) => void;
  onRenderedEntry: (entry: ToolWindowEntry) => void;
  isPermissionSubmitting: (requestId: string) => boolean;
  getPermissionError: (requestId: string) => string;
  onPermissionReply: (payload: { requestId: string; reply: PermissionReply }) => void;
  isQuestionSubmitting: (requestId: string) => boolean;
  getQuestionError: (requestId: string) => string;
  onQuestionReply: (payload: { requestId: string; answers: QuestionAnswer[] }) => void;
  onQuestionReject: (requestId: string) => void;
  theme: string;
}>();

const entry = computed(() => props.entry);

const showResizer = computed(
  () =>
    entry.value.isReasoning ||
    entry.value.isSubagentMessage ||
    entry.value.isShell ||
    entry.value.isPermission ||
    entry.value.isQuestion,
);

const agentColor = computed(() => {
  if (entry.value.isMessage) {
    return props.resolveAgentTone(entry.value.messageAgent);
  }
  return undefined;
});

const termClass = computed(() => ({
  'is-write': entry.value.isWrite,
  'is-message': entry.value.isSubagentMessage,
  'is-tool-error': entry.value.toolStatus === 'error',
  'is-apply-patch': entry.value.toolName === 'apply_patch',
  'is-reasoning': entry.value.isReasoning || entry.value.isSubagentMessage,
  'is-shell': entry.value.isShell,
  'is-permission': entry.value.isPermission,
  'is-question': entry.value.isQuestion,
}));

const termStyle = computed(() => {
  const base: Record<string, string | number | undefined> = {
    left: `${entry.value.x ?? 0}px`,
    top: `calc(var(--tool-top-offset) + ${entry.value.y ?? 0}px)`,
    '--term-width': entry.value.width ? `${entry.value.width}px` : undefined,
    '--term-height': entry.value.height ? `${entry.value.height}px` : undefined,
    zIndex: entry.value.zIndex ?? undefined,
  };
  
  if (agentColor.value) {
    const c = agentColor.value;
    base.borderColor = c;
    base['--term-border-color'] = c;
  }
  return base;
});

const titlebarStyle = computed(() => {
  if (agentColor.value) {
    const c = agentColor.value;
    let bg = c;
    if (c.startsWith('#') && c.length === 7) {
      bg = `${c}2E`; // ~0.18
    }
    return {
      background: bg,
      borderBottomColor: `${c}59`, // ~0.35
      color: '#e2e8f0'
    };
  }
  return {};
});

const renderCode = computed(() => {
  const body = entry.value.content ?? '';
  if (entry.value.isMessage) return body;
  return `${entry.value.header ?? ''}${body}`;
});

const viewerLang = computed(() => entry.value.toolLang ?? (entry.value.isMessage ? 'markdown' : 'text'));

const viewerWrapMode = computed<'default' | 'soft'>(() => {
  if (entry.value.isMessage) return 'soft';
  return entry.value.toolWrapMode ?? 'default';
});

const viewerGutterMode = computed<'none' | 'single' | 'double'>(() => {
  if (entry.value.isMessage || entry.value.isReasoning || entry.value.isSubagentMessage) return 'none';
  if (entry.value.toolGutterMode === 'grep-source') return 'single';
  if (entry.value.toolGutterMode === 'none') return 'none';
  return 'single';
});

const viewerGutterLines = computed(() =>
  entry.value.toolName === 'grep' || entry.value.toolGutterMode === 'grep-source'
    ? entry.value.toolGutterLines
    : undefined,
);

const viewerGrepPattern = computed(() =>
  entry.value.toolName === 'grep' || entry.value.toolGutterMode === 'grep-source'
    ? entry.value.grepPattern
    : undefined,
);

function onFocus(event: PointerEvent) {
  props.onFocusEntry(entry.value, event);
}

function onDragStart(event: PointerEvent) {
  props.onDragEntry(entry.value, event);
}

function onResizeStart(event: PointerEvent) {
  props.onResizeEntry(entry.value, event);
}

function onFloatingScroll(event: Event) {
  props.onFloatingScrollEntry(entry.value, event);
}

function onFloatingWheel(event: WheelEvent) {
  props.onFloatingWheelEntry(entry.value, event);
}

function onRendered() {
  props.onRenderedEntry(entry.value);
}
</script>

<style scoped>
.term {
  position: absolute;
  font-size: var(--term-font-size);
  --message-line-height: var(--term-line-height);
  --term-border-color: #1f2937;
  width: var(--term-width);
  height: var(--term-height);
  background: #050505;
  color: #f3f4f6;
  border: 1px solid #1f2937;
  overflow: hidden;
  font-family: var(--term-font-family);
  line-height: var(--term-line-height);
  padding: 0;
  z-index: 12;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.term.is-message,
.term.is-shell,
.term.is-message.agent-tone-build,
.term.is-message.agent-tone-plan {
  background: #050505;
  border-color: #1f2937;
  --term-border-color: #1f2937;
}

.term.is-message .term-titlebar,
.term.is-message.agent-tone-build .term-titlebar,
.term.is-message.agent-tone-plan .term-titlebar {
  background: rgba(2, 6, 23, 0.95);
  color: #cbd5e1;
  border-bottom: 1px solid rgba(148, 163, 184, 0.28);
}

.term.is-permission {
  background: #1f1303;
  border-color: #f59e0b;
  --term-border-color: #f59e0b;
}

.term.is-question {
  background: #07201b;
  border-color: #34d399;
  --term-border-color: #34d399;
}

.term.is-apply-patch,
.term.is-write {
  background: #190a24;
  border-color: #a855f7;
  --term-border-color: #a855f7;
}

.term.is-tool-error {
  background: #2a0f0f;
  border-color: #ef4444;
  --term-border-color: #ef4444;
}

.term.is-apply-patch .term-titlebar,
.term.is-write .term-titlebar {
  background: rgba(168, 85, 247, 0.18);
  color: #e9d5ff;
  border-bottom: 1px solid rgba(168, 85, 247, 0.35);
}

.term.is-tool-error .term-titlebar {
  background: rgba(239, 68, 68, 0.18);
  color: #fecaca;
  border-bottom: 1px solid rgba(239, 68, 68, 0.35);
}

.term.is-permission .term-titlebar {
  background: rgba(245, 158, 11, 0.18);
  color: #fcd34d;
  border-bottom: 1px solid rgba(245, 158, 11, 0.35);
}

.term.is-question .term-titlebar {
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
  border-bottom: 1px solid rgba(52, 211, 153, 0.35);
}

.term-titlebar {
  height: 22px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 12px;
  color: #cbd5e1;
  background: rgba(2, 6, 23, 0.95);
  border-bottom: 1px solid rgba(148, 163, 184, 0.28);
  cursor: grab;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.term-titlebar:active {
  cursor: grabbing;
}

.term-inner {
  margin: 0;
  white-space: normal;
  line-height: var(--term-line-height);
  padding: 2px;
  flex: 1;
  overflow: hidden;
}

.term.is-reasoning .term-inner,
.term.is-reasoning .term-inner {
  overflow: auto;
}

.term.is-shell .term-inner,
.term.is-permission .term-inner,
.term.is-question .term-inner {
  padding: 0;
  overflow: hidden;
}

.xterm-host {
  width: 100%;
  height: 100%;
  display: block;
}

.term-resizer {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: se-resize;
  background: transparent;
  z-index: 2;
}

.term-resizer::before {
  content: '';
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 0 5px 5px;
  border-color: transparent transparent var(--term-border-color) transparent;
}

.term-resizer:hover {
  filter: brightness(1.15);
}

.shiki-host {
  line-height: var(--term-line-height);
  color: #c9d1d9;
  display: block;
}

.term-inner.is-scrolling .shiki-host {
  animation: scroll-down var(--scroll-duration) linear forwards;
  will-change: transform;
}

@keyframes scroll-down {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(calc(-1 * var(--scroll-distance)));
  }
}
</style>
