<template>
  <div class="tp-window">
    <div class="tp-header">
      <div class="tp-title">Tool permissions</div>
      <div class="tp-scope">{{ scopeLabel }}</div>
    </div>

    <div class="tp-tabs">
      <button
        type="button"
        class="tp-tab"
        :class="{ 'is-active': tab === 'pending' }"
        @click="tab = 'pending'"
      >
        Pending
        <span v-if="pendingRequests.length > 0" class="tp-badge">{{ pendingRequests.length }}</span>
      </button>
      <button
        type="button"
        class="tp-tab"
        :class="{ 'is-active': tab === 'effective' }"
        @click="tab = 'effective'"
      >
        Effective ({{ table.length }})
      </button>
      <button
        type="button"
        class="tp-tab"
        :class="{ 'is-active': tab === 'blocked' }"
        @click="tab = 'blocked'"
      >
        Blocked
        <span v-if="blocked.length > 0" class="tp-badge is-warn">{{ blocked.length }}</span>
      </button>
    </div>

    <div class="tp-body">
      <!-- Pending approvals: the only thing actually grantable at runtime. -->
      <template v-if="tab === 'pending'">
        <div v-if="pendingRequests.length === 0" class="tp-empty">
          Nothing is waiting for approval.
        </div>
        <div v-for="request in pendingRequests" :key="request.id" class="tp-request">
          <div class="tp-request-head">
            <span class="tp-chip is-ask">ask</span>
            <span class="tp-request-name">{{ request.permission }}</span>
          </div>
          <ul v-if="request.patterns.length > 0" class="tp-patterns">
            <li v-for="pattern in request.patterns" :key="pattern">{{ pattern }}</li>
          </ul>
          <div v-if="permissionError(request.id)" class="tp-error">
            {{ permissionError(request.id) }}
          </div>
          <div class="tp-actions">
            <button
              type="button"
              class="tp-button is-once"
              :disabled="isSubmitting(request.id)"
              @click="reply(request.id, 'once')"
            >
              Allow once
            </button>
            <button
              type="button"
              class="tp-button is-always"
              :disabled="isSubmitting(request.id)"
              @click="reply(request.id, 'always')"
            >
              Always allow
            </button>
            <button
              type="button"
              class="tp-button is-reject"
              :disabled="isSubmitting(request.id)"
              @click="reply(request.id, 'reject')"
            >
              Deny
            </button>
          </div>
        </div>
      </template>

      <!-- Effective permission table resolved from global/agent/session rules. -->
      <template v-else-if="tab === 'effective'">
        <div class="tp-row tp-row-head">
          <span>Tool</span>
          <span>Action</span>
          <span>Source</span>
        </div>
        <div
          v-for="entry in table"
          :key="entry.permission"
          class="tp-row"
          :class="{ 'is-open': expanded === entry.permission }"
          @click="toggle(entry.permission)"
        >
          <span class="tp-row-name">{{ entry.permission }}</span>
          <span class="tp-chip" :class="chipClass(entry.action)">{{ entry.action }}</span>
          <span class="tp-row-source">{{ entry.source }}</span>

          <div v-if="expanded === entry.permission" class="tp-row-detail" @click.stop>
            <div v-if="entry.rules.length > 0" class="tp-rules">
              <div v-for="(item, index) in entry.rules" :key="index" class="tp-rule">
                <code>{{ item.rule.pattern || '*' }}</code>
                <span class="tp-chip is-small" :class="chipClass(item.rule.action)">
                  {{ item.rule.action }}
                </span>
                <span class="tp-rule-source">{{ item.source }}</span>
              </div>
            </div>
            <div v-else class="tp-empty">
              No explicit rule. Using the server default ({{ entry.action }}).
            </div>

            <div class="tp-snippet-head">
              Set in opencode.json — the server has no API to change this at runtime.
            </div>
            <pre class="tp-snippet">{{ snippetFor(entry.permission) }}</pre>
            <button type="button" class="tp-button is-copy" @click="copySnippet(entry.permission)">
              {{ copied === entry.permission ? 'Copied' : 'Copy snippet' }}
            </button>
          </div>
        </div>
      </template>

      <!-- Everything currently denied or blocked, so "what is not allowed" is one glance. -->
      <template v-else>
        <div v-if="blocked.length === 0" class="tp-empty">Nothing is denied.</div>
        <div v-for="entry in blocked" :key="entry.permission" class="tp-row is-static">
          <span class="tp-row-name">{{ entry.permission }}</span>
          <span class="tp-chip is-deny">deny</span>
          <span class="tp-row-source">{{ entry.source }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PermissionRule } from '../../types/sse';
import {
  buildConfigSnippet,
  resolvePermissionTable,
  type EffectivePermission,
  type PermissionAction,
  type RulesetLayer,
} from '../../utils/permissions';

type PendingRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
};

type PermissionReply = 'once' | 'always' | 'reject';

const props = defineProps<{
  /** Rules from the root opencode.json config. */
  globalRules?: PermissionRule[];
  /** Rules contributed by the currently selected agent. */
  agentRules?: PermissionRule[];
  /** Rules attached to the active session. */
  sessionRules?: PermissionRule[];
  pendingRequests?: PendingRequest[];
  submittingById?: Record<string, boolean>;
  errorById?: Record<string, string>;
  agentName?: string;
  sessionId?: string;
}>();

const emit = defineEmits<{
  (event: 'reply', payload: { requestId: string; reply: PermissionReply }): void;
}>();

const tab = ref<'pending' | 'effective' | 'blocked'>('pending');
const expanded = ref<string>('');
const copied = ref<string>('');

const pendingRequests = computed(() => props.pendingRequests ?? []);

const layers = computed<RulesetLayer[]>(() => [
  { source: 'global', rules: props.globalRules ?? [] },
  { source: 'agent', rules: props.agentRules ?? [] },
  { source: 'session', rules: props.sessionRules ?? [] },
]);

const table = computed<EffectivePermission[]>(() => resolvePermissionTable(layers.value));

const blocked = computed(() => table.value.filter((entry) => entry.action === 'deny'));

const scopeLabel = computed(() => {
  const parts: string[] = [];
  if (props.agentName) parts.push(props.agentName);
  if (props.sessionId) parts.push(props.sessionId.slice(0, 8));
  return parts.join(' / ') || 'global';
});

function chipClass(action: PermissionAction | string) {
  if (action === 'allow') return 'is-allow';
  if (action === 'deny') return 'is-deny';
  return 'is-ask';
}

function toggle(permission: string) {
  expanded.value = expanded.value === permission ? '' : permission;
}

function snippetFor(permission: string) {
  const current = table.value.find((entry) => entry.permission === permission);
  return buildConfigSnippet(permission, current?.action === 'allow' ? 'ask' : 'allow');
}

async function copySnippet(permission: string) {
  try {
    await navigator.clipboard.writeText(snippetFor(permission));
    copied.value = permission;
    setTimeout(() => {
      if (copied.value === permission) copied.value = '';
    }, 1500);
  } catch {
    // Clipboard can be blocked; the snippet is still selectable in the UI.
  }
}

function isSubmitting(requestId: string) {
  return Boolean(props.submittingById?.[requestId]);
}

function permissionError(requestId: string) {
  return props.errorById?.[requestId] ?? '';
}

function reply(requestId: string, value: PermissionReply) {
  if (isSubmitting(requestId)) return;
  emit('reply', { requestId, reply: value });
}
</script>

<style scoped>
.tp-window {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 8px;
  height: 100%;
  min-height: 0;
  padding: 8px;
  box-sizing: border-box;
  color: var(--theme-text-secondary);
  font-size: 12px;
}

.tp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tp-title {
  font-size: 13px;
  font-weight: 700;
}

.tp-scope {
  font-size: 11px;
  color: var(--theme-text-muted);
}

.tp-tabs {
  display: flex;
  gap: 4px;
}

.tp-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 8px;
  padding: 4px 9px;
  border: 1px solid var(--theme-border-subtle);
  background: transparent;
  color: var(--theme-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.tp-tab.is-active {
  color: var(--theme-text-secondary);
  border-color: var(--theme-border);
  background: color-mix(in srgb, var(--theme-bg-base) 60%, transparent);
}

.tp-badge {
  border-radius: 999px;
  padding: 0 5px;
  font-size: 10px;
  background: color-mix(in srgb, var(--theme-info) 35%, transparent);
}

.tp-badge.is-warn {
  background: color-mix(in srgb, var(--theme-danger-strong) 35%, transparent);
}

.tp-body {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px;
}

.tp-row {
  display: grid;
  grid-template-columns: 1fr auto 72px;
  gap: 8px;
  align-items: center;
  padding: 5px 8px;
  border: 1px solid var(--theme-border-subtle);
  border-radius: 8px;
  cursor: pointer;
}

.tp-row.is-static {
  cursor: default;
}

.tp-row-head {
  border: 0;
  cursor: default;
  color: var(--theme-text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tp-row.is-open {
  background: color-mix(in srgb, var(--theme-bg-base) 45%, transparent);
}

.tp-row-name {
  font-weight: 600;
  word-break: break-all;
}

.tp-row-source {
  color: var(--theme-text-muted);
  font-size: 10px;
  text-align: right;
}

.tp-row-detail {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--theme-border-subtle);
  padding-top: 6px;
  cursor: default;
}

.tp-rules {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tp-rule {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tp-rule-source {
  color: var(--theme-text-muted);
  font-size: 10px;
}

.tp-chip {
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid transparent;
}

.tp-chip.is-small {
  font-size: 9px;
  padding: 0 6px;
}

.tp-chip.is-allow {
  background: color-mix(in srgb, var(--theme-success) 18%, transparent);
  border-color: color-mix(in srgb, var(--theme-success) 55%, transparent);
}

.tp-chip.is-ask {
  background: color-mix(in srgb, var(--theme-info) 20%, transparent);
  border-color: color-mix(in srgb, var(--theme-info) 55%, transparent);
}

.tp-chip.is-deny {
  background: color-mix(in srgb, var(--theme-danger-strong) 20%, transparent);
  border-color: color-mix(in srgb, var(--theme-danger-strong) 55%, transparent);
}

.tp-snippet-head {
  color: var(--theme-text-muted);
  font-size: 10px;
}

.tp-snippet {
  margin: 0;
  padding: 6px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-bg-base) 70%, transparent);
  font-size: 10px;
  overflow: auto;
  white-space: pre;
}

.tp-request {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--theme-info) 45%, transparent);
  border-radius: 8px;
  padding: 8px;
}

.tp-request-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tp-request-name {
  font-weight: 600;
}

.tp-patterns {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--theme-text-muted);
}

.tp-patterns li {
  word-break: break-all;
}

.tp-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.tp-button {
  border-radius: 8px;
  padding: 4px 9px;
  border: 1px solid var(--theme-border);
  background: var(--theme-bg-base);
  color: var(--theme-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.tp-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.tp-button.is-once {
  background: color-mix(in srgb, var(--theme-info) 25%, transparent);
  border-color: color-mix(in srgb, var(--theme-info) 70%, transparent);
}

.tp-button.is-always {
  background: color-mix(in srgb, var(--theme-success) 18%, transparent);
  border-color: color-mix(in srgb, var(--theme-success) 60%, transparent);
}

.tp-button.is-reject {
  background: color-mix(in srgb, var(--theme-danger-strong) 18%, transparent);
  border-color: color-mix(in srgb, var(--theme-danger-strong) 60%, transparent);
}

.tp-button.is-copy {
  align-self: flex-start;
}

.tp-error {
  color: var(--theme-danger);
  font-size: 11px;
}

.tp-empty {
  color: var(--theme-text-subtle);
  font-size: 11px;
  padding: 6px 2px;
}
</style>
