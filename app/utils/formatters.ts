export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function contextSeverityClass(percent: number): string {
  if (percent >= 90) return 'ib-ctx-critical';
  if (percent >= 75) return 'ib-ctx-high';
  if (percent >= 50) return 'ib-ctx-moderate';
  return 'ib-ctx-low';
}

export function formatMessageTime(value?: number): string {
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

export type MessageErrorLike = {
  name: string;
  message: string;
  statusCode?: number;
  responseBody?: string;
};

/** Why a tool call was blocked, and whether the user can do anything about it. */
export type BlockedToolInfo = {
  tool: string;
  /** Short machine-readable reason. */
  reason: 'summary' | 'permission' | 'disabled' | 'unknown';
  /** Human-facing one-liner shown in the collapsed error bar. */
  label: string;
  /** Longer explanation shown when the bar is expanded. */
  explanation: string;
  /**
   * True when the block can be lifted at runtime by replying to a pending
   * permission request. False means it is config-only or not user-fixable.
   */
  grantable: boolean;
};

const SUMMARY_BLOCK_RE = /tool call not allowed while generating summary:\s*([\w.-]+)/i;
const PERMISSION_BLOCK_RE =
  /(?:permission (?:denied|rejected)|rejected by user)(?:[^\w]+(?:for|tool)?[^\w]*)?([\w.-]+)?/i;
const DISABLED_TOOL_RE = /tool (?:is )?(?:not available|disabled|not enabled):?\s*([\w.-]+)/i;

/**
 * Detect whether an error represents a blocked tool call and describe it in
 * terms the user can act on.
 */
export function detectBlockedTool(error: MessageErrorLike): BlockedToolInfo | null {
  const message = error.message ?? '';

  const summaryMatch = SUMMARY_BLOCK_RE.exec(message);
  if (summaryMatch) {
    const tool = summaryMatch[1] ?? 'tool';
    return {
      tool,
      reason: 'summary',
      label: `${tool} blocked during summary generation`,
      explanation:
        `The model tried to call \`${tool}\` while OpenCode was compacting the session into a ` +
        `summary. Compaction runs with no tools available, so the server rejects any tool call. ` +
        `This is not a permission you can grant — it is fixed by pointing compaction at a model ` +
        `that does not emit stray tool calls, via the "compaction" agent model in opencode.json.`,
      grantable: false,
    };
  }

  const disabledMatch = DISABLED_TOOL_RE.exec(message);
  if (disabledMatch) {
    const tool = disabledMatch[1] ?? 'tool';
    return {
      tool,
      reason: 'disabled',
      label: `${tool} is disabled for this agent`,
      explanation:
        `\`${tool}\` is not in the tool set for the current agent. Enable it in the agent's ` +
        `permission config in opencode.json or the agent markdown front matter.`,
      grantable: false,
    };
  }

  const permissionMatch = PERMISSION_BLOCK_RE.exec(message);
  if (permissionMatch) {
    const tool = permissionMatch[1] ?? 'tool';
    return {
      tool,
      reason: 'permission',
      label: `${tool} was not allowed`,
      explanation:
        `A permission request for \`${tool}\` was denied. If the request is still pending you ` +
        `can approve it inline; otherwise adjust the permission rules in opencode.json.`,
      grantable: true,
    };
  }

  return null;
}

/** A model-level failure, as opposed to a tool or transport failure. */
export type ModelErrorInfo = {
  reason: 'unsupported' | 'not-found' | 'unauthorized' | 'quota';
  label: string;
  explanation: string;
};

const MODEL_UNSUPPORTED_RE =
  /(requested model is not supported|model .*not supported|unsupported model|model_not_supported)/i;
const MODEL_NOT_FOUND_RE =
  /(model .*not found|unknown model|no such model|ModelNotFoundError|does not exist)/i;
const MODEL_AUTH_RE = /(unauthorized|invalid api key|authentication.*fail|forbidden|401|403)/i;
const MODEL_QUOTA_RE = /(quota|rate.?limit|too many requests|429|insufficient.*credit)/i;

/**
 * Recognize errors that mean "this model cannot be used", which is distinct
 * from a transient network problem and needs a different user action.
 */
export function detectModelError(error: MessageErrorLike): ModelErrorInfo | null {
  const message = `${error.name ?? ''} ${error.message ?? ''} ${error.responseBody ?? ''}`;

  if (MODEL_UNSUPPORTED_RE.test(message)) {
    return {
      reason: 'unsupported',
      label: 'Model not supported by this provider',
      explanation:
        'The provider rejected this model. It may be listed in the catalog but unavailable on ' +
        'your endpoint (common with GitHub Enterprise Copilot). Pick a different model.',
    };
  }

  if (MODEL_NOT_FOUND_RE.test(message)) {
    return {
      reason: 'not-found',
      label: 'Model not found',
      explanation:
        'The configured model does not exist for this provider. Check the model id in your ' +
        'opencode.json, including small_model and any agent model overrides.',
    };
  }

  if (MODEL_QUOTA_RE.test(message)) {
    return {
      reason: 'quota',
      label: 'Model quota or rate limit reached',
      explanation: 'The provider is throttling or has exhausted your quota. Retry later.',
    };
  }

  if (MODEL_AUTH_RE.test(message)) {
    return {
      reason: 'unauthorized',
      label: 'Model rejected your credentials',
      explanation: 'Authentication failed for this provider. Re-run `opencode auth login` for it.',
    };
  }

  return null;
}

export function formatMessageError(error: MessageErrorLike): string {
  if (error.name === 'MessageAbortedError') return error.message || 'Aborted';

  const blocked = detectBlockedTool(error);
  if (blocked) return blocked.label;

  const modelError = detectModelError(error);
  if (modelError) return modelError.label;

  const parts: string[] = [];
  if (error.name) parts.push(error.name);
  if (error.message) parts.push(error.message);
  return parts.join(': ') || 'Error';
}

export function formatElapsedTime(startMs?: number, endMs?: number): string {
  if (typeof startMs !== 'number' || typeof endMs !== 'number') return '';
  const sec = Math.round((endMs - startMs) / 1000);
  if (sec < 1) return '';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m${rem}s` : `${min}m`;
}
