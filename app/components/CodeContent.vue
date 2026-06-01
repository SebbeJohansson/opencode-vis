<template>
  <div class="code-content" :class="rootClass" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  html: string;
  variant?: 'code' | 'diff' | 'message' | 'binary' | 'term' | 'plain';
}>();

const rootClass = computed(() => {
  const v = props.variant ?? 'code';
  return {
    'is-diff': v === 'diff',
    'is-message': v === 'message',
    'is-binary': v === 'binary',
    'is-term': v === 'term',
    'is-plain': v === 'plain',
    'no-gutter': v === 'message' || v === 'binary' || v === 'term' || v === 'plain',
    'wrap-soft': v === 'message' || v === 'term',
  };
});
</script>

<style scoped>
.code-content {
  line-height: inherit;
  color: inherit;
  min-height: 1.2em;
}

.code-content :deep(pre),
.code-content :deep(code) {
  margin: 0;
  padding: 0;
  background: transparent !important;
  background-color: transparent !important;
  line-height: inherit !important;
  font-family: inherit;
  font-size: inherit;
  white-space: normal;
}

.code-content :deep(pre.shiki) {
  background: transparent !important;
  background-color: transparent !important;
  color: inherit;
  display: block;
  line-height: inherit !important;
}

.code-content :deep(code) {
  display: grid;
  grid-template-columns: max-content max-content 1fr;
  column-gap: 0;
}

.code-content :deep(.code-row) {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: start;
}

.code-content :deep(.code-gutter) {
  text-align: right;
  color: var(--theme-text-muted);
  white-space: pre;
  font-variant-numeric: tabular-nums;
  padding: 0 1ch 0 1ch;
  user-select: none;
}

.code-content :deep(.code-gutter.span-2) {
  grid-column: 1 / 3;
}

.code-content :deep(.line) {
  display: block;
  min-height: 1em;
  white-space: pre;
  box-sizing: border-box;
  padding-left: 1ch;
}

.code-content :deep(.line:empty)::after {
  content: ' ';
}

/* no-gutter */

.code-content.no-gutter :deep(code) {
  grid-template-columns: 1fr;
}

.code-content.no-gutter :deep(.code-gutter) {
  display: none;
}

.code-content.no-gutter :deep(.line) {
  padding-left: 0;
}

/* wrap-soft */

.code-content.wrap-soft :deep(.line) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* grep */

.code-content :deep(.grep-match) {
  color: var(--theme-highlight-fg);
  background: color-mix(in srgb, var(--theme-warning) 30%, transparent);
  border-radius: 2px;
  padding: 0 0.08em;
  font-weight: 700;
}

.code-content :deep(.grep-match strong) {
  font-weight: inherit;
}

/* diff */

.code-content.is-diff :deep(.code-row.line-added) {
  background: var(--theme-diff-hunk-bg);
}

.code-content.is-diff :deep(.code-row.line-added) .line {
  box-shadow: inset 3px 0 0 var(--theme-success);
  color: var(--theme-diff-add-text);
}

.code-content.is-diff :deep(.code-row.line-removed) {
  background: var(--theme-diff-header-bg);
}

.code-content.is-diff :deep(.code-row.line-removed) .line {
  box-shadow: inset 3px 0 0 var(--theme-danger-strong);
  color: var(--theme-diff-del-text);
}

.code-content.is-diff :deep(.code-row.line-hunk) {
  background: var(--theme-diff-hunk-bg);
}

.code-content.is-diff :deep(.code-row.line-hunk) .line {
  box-shadow: inset 3px 0 0 var(--theme-diff-hunk-border);
  color: var(--theme-text-secondary);
}

.code-content.is-diff :deep(.code-row.line-header) {
  background: var(--theme-diff-header-bg);
}

.code-content.is-diff :deep(.code-row.line-header) .line {
  box-shadow: inset 3px 0 0 var(--theme-diff-header-border);
  color: var(--theme-text-secondary);
}

/* binary (hexdump) */

.code-content.is-binary :deep(pre) {
  white-space: pre;
}

.code-content.is-binary :deep(code) {
  display: block;
  white-space: pre;
}

.code-content.is-binary :deep(.hexdump-address) {
  color: var(--theme-accent);
}

.code-content.is-binary :deep(.hexdump-separator) {
  color: var(--theme-text-subtle);
}

.code-content.is-binary :deep(.hexdump-control) {
  color: var(--theme-highlight-fg);
}

.code-content.is-binary :deep(.hexdump-ascii) {
  color: var(--theme-info-text);
}

.code-content.is-binary :deep(.hexdump-exascii) {
  color: var(--theme-danger);
}

.code-content.is-binary :deep(.hexdump-null) {
  color: var(--theme-text-subtle);
}

/* ── Mobile (< 768px) ── */
@media (max-width: 767px) {
  .code-content {
    min-width: 0;
    max-width: 100%;
  }

  .code-content :deep(code) {
    min-width: 0;
  }

  .code-content :deep(.line) {
    overflow-wrap: anywhere;
    word-break: break-all;
  }

  /* In non-wrapping variants (code/diff), allow horizontal scroll instead of breaking */
  .code-content:not(.wrap-soft) {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .code-content:not(.wrap-soft) :deep(.line) {
    overflow-wrap: normal;
    word-break: normal;
  }

  /* Reduce gutter padding on mobile */
  .code-content :deep(.code-gutter) {
    padding: 0 0.5ch;
  }
}
</style>
