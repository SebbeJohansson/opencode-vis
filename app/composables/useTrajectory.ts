// ---------------------------------------------------------------------------
// Trajectory
// ---------------------------------------------------------------------------
// Flattens the session's append-only record (messages + parts) into a single
// ordered event stream: system prompts, user turns, context injections,
// assistant text, reasoning, tool calls/results and subagent scheduling.
//
// The chat view groups this same data by thread; the trajectory view keeps it
// flat and chronological so every record the model saw can be inspected in the
// order it happened.
// ---------------------------------------------------------------------------

import { computed, shallowRef, watchEffect, type Ref } from 'vue';
import { useMessages } from './useMessages';
import type { MessageTokens } from '../types/message';
import type { MessageInfo, MessagePart, ToolPart } from '../types/sse';

export type TrajectoryKind =
  | 'system'
  | 'user'
  | 'context'
  | 'assistant'
  | 'reasoning'
  | 'tool'
  | 'subtask'
  | 'error';

/** Timeline row an event belongs to. */
export type TrajectoryLane = 'input' | 'model' | 'tools';

export type TrajectoryStatus = 'pending' | 'running' | 'completed' | 'error';

export type TrajectoryEvent = {
  /** Stable list key. */
  key: string;
  kind: TrajectoryKind;
  lane: TrajectoryLane;
  /** 1-based user turn this event belongs to. */
  turn: number;
  /** 1-based model step (one assistant request) within the turn. */
  step: number;
  /** Position in the flattened stream. */
  index: number;
  time: number;
  endTime?: number;
  durationMs?: number;
  /** Short label: tool name, role, or record type. */
  title: string;
  /** One-line summary of the input side of the record. */
  preview: string;
  /** One-line summary of the output side, when the record has one. */
  resultPreview?: string;
  status?: TrajectoryStatus;
  messageId: string;
  sessionId: string;
  parentMessageId?: string;
  agent?: string;
  model?: string;
  toolName?: string;
  callId?: string;
  /** What went in: tool input, message info, prompt text. */
  payload?: unknown;
  /** What came back: tool output, error text, message text. */
  result?: string;
  tokens?: MessageTokens;
  cost?: number;
  /** The untouched record, used by the detail panel and export. */
  raw: unknown;
};

export type TrajectoryStats = {
  turns: number;
  steps: number;
  calls: number;
  events: number;
  startTime?: number;
  endTime?: number;
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  /** Share of prompt tokens served from cache, 0-1. */
  cacheHitRate: number | null;
  /** Output tokens per second of model time. */
  tokensPerSecond: number | null;
  cost: number;
};

const LANE_BY_KIND: Record<TrajectoryKind, TrajectoryLane> = {
  system: 'input',
  user: 'input',
  context: 'input',
  assistant: 'model',
  reasoning: 'model',
  subtask: 'model',
  error: 'model',
  tool: 'tools',
};

const CONTEXT_MARKERS = [
  '<system-reminder',
  '<user-prompt-submit',
  '<command-name>',
  '<local-command',
  '<environment_details',
];

function collapse(text: string, limit = 240): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit)}…`;
}

function compactJson(value: unknown, limit = 200): string {
  if (value === undefined || value === null) return '';
  try {
    const json = JSON.stringify(value);
    if (!json) return '';
    return json.length <= limit ? json : `${json.slice(0, limit)}…`;
  } catch {
    return String(value);
  }
}

/** Injected context looks like a user message but was never typed by a human. */
function isInjectedText(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase();
  return CONTEXT_MARKERS.some((marker) => head.includes(marker));
}

function toolStatus(part: ToolPart): TrajectoryStatus {
  return part.state.status;
}

function toolTimes(part: ToolPart): { start?: number; end?: number } {
  const state = part.state;
  if (state.status === 'running') return { start: state.time.start };
  if (state.status === 'completed' || state.status === 'error') {
    return { start: state.time.start, end: state.time.end };
  }
  return {};
}

function toolResultText(part: ToolPart): string | undefined {
  const state = part.state;
  if (state.status === 'completed') return state.output;
  if (state.status === 'error') return state.error;
  return undefined;
}

/**
 * Parts carry ascending ids within a message, so id order is creation order —
 * more reliable than timestamps, which several part types omit entirely.
 */
function sortParts(parts: MessagePart[]): MessagePart[] {
  return [...parts].sort((a, b) => a.id.localeCompare(b.id));
}

function messageAgent(info: MessageInfo): string | undefined {
  return info.agent;
}

function hasInput(part: ToolPart): boolean {
  const input = part.state.input;
  return !!input && Object.keys(input).length > 0;
}

/**
 * Folds a follow-up part for an already-seen callID into its record: whichever
 * side carries the tool name, the input or the output fills in the gaps, and the
 * terminal status wins over the pending/running one.
 */
function mergeToolPart(
  event: TrajectoryEvent,
  part: ToolPart,
  times: { start?: number; end?: number },
  output?: string,
): void {
  if (part.tool && !event.toolName) {
    event.toolName = part.tool;
    event.title = part.tool;
  }
  if (hasInput(part) && event.payload === undefined) {
    event.payload = part.state.input;
    event.preview = compactJson(part.state.input);
  }
  if (output !== undefined && event.result === undefined) {
    event.result = output;
    event.resultPreview = output ? collapse(output, 200) : undefined;
  }
  if (times.start !== undefined && (event.time <= 0 || times.start < event.time)) {
    event.time = times.start;
  }
  if (times.end !== undefined && (event.endTime === undefined || times.end > event.endTime)) {
    event.endTime = times.end;
    event.durationMs = event.time > 0 ? Math.max(0, times.end - event.time) : undefined;
  }
  const status = part.state.status;
  if (status === 'completed' || status === 'error') event.status = status;
  event.raw = Array.isArray(event.raw) ? [...event.raw, part] : [event.raw, part];
}

export function buildTrajectory(msg: ReturnType<typeof useMessages>): {
  events: TrajectoryEvent[];
  stats: TrajectoryStats;
} {
  const events: TrajectoryEvent[] = [];
  let index = 0;
  let turn = 0;
  let lastSystem: string | undefined;

  // One logical tool call per callID. The Claude Code proxy emits the call and
  // its result as two separate parts (the result carries no tool name or input),
  // so without this they would read as two unrelated records.
  const toolCallsById = new Map<string, TrajectoryEvent>();

  const push = (event: Omit<TrajectoryEvent, 'index' | 'lane'>): TrajectoryEvent => {
    const created = { ...event, index: index++, lane: LANE_BY_KIND[event.kind] };
    events.push(created);
    return created;
  };

  for (const root of msg.roots.value) {
    turn += 1;
    let step = 0;

    if (root.role === 'user') {
      const system = root.system?.trim();
      if (system && system !== lastSystem) {
        push({
          key: `system:${root.id}`,
          kind: 'system',
          turn,
          step: 0,
          time: root.time.created,
          title: lastSystem ? 'System Prompt Updated' : 'Initial System Prompt',
          preview: collapse(system),
          messageId: root.id,
          sessionId: root.sessionID,
          agent: messageAgent(root),
          payload: { system },
          result: system,
          raw: { type: 'system', messageID: root.id, system },
        });
        lastSystem = system;
      }

      for (const part of sortParts(msg.getParts(root.id))) {
        if (part.type === 'text') {
          if (!part.text.trim()) continue;
          const injected = part.synthetic === true || isInjectedText(part.text);
          push({
            key: `part:${part.messageID}:${part.id}`,
            kind: injected ? 'context' : 'user',
            turn,
            step: 0,
            time: part.time?.start ?? root.time.created,
            endTime: part.time?.end,
            title: injected ? 'Context Injection' : 'User Message',
            preview: collapse(part.text),
            messageId: root.id,
            sessionId: root.sessionID,
            agent: messageAgent(root),
            payload: part.metadata ?? undefined,
            result: part.text,
            raw: part,
          });
          continue;
        }
        if (part.type === 'file') {
          push({
            key: `part:${part.messageID}:${part.id}`,
            kind: 'context',
            turn,
            step: 0,
            time: root.time.created,
            title: 'Attachment',
            preview: `${part.filename ?? part.url} (${part.mime})`,
            messageId: root.id,
            sessionId: root.sessionID,
            payload: { mime: part.mime, filename: part.filename, url: part.url },
            raw: part,
          });
          continue;
        }
        if (part.type === 'agent') {
          push({
            key: `part:${part.messageID}:${part.id}`,
            kind: 'context',
            turn,
            step: 0,
            time: root.time.created,
            title: 'Agent Switch',
            preview: part.name,
            messageId: root.id,
            sessionId: root.sessionID,
            payload: { name: part.name },
            raw: part,
          });
        }
      }
    }

    const thread = root.role === 'user' ? msg.getThread(root.id) : [root];
    for (const info of thread) {
      if (info.role !== 'assistant') continue;
      step += 1;
      const stepNumber = step;
      const usage = msg.getUsage(info.id);
      const model = msg.getModelPath(info.id);
      const parts = sortParts(msg.getParts(info.id));

      for (const part of parts) {
        const base = {
          turn,
          step: stepNumber,
          messageId: info.id,
          sessionId: info.sessionID,
          parentMessageId: info.parentID,
          agent: messageAgent(info),
          model,
        };

        if (part.type === 'text') {
          if (!part.text.trim()) continue;
          push({
            ...base,
            key: `part:${part.messageID}:${part.id}`,
            kind: 'assistant',
            time: part.time?.start ?? info.time.created,
            endTime: part.time?.end,
            durationMs:
              part.time?.end !== undefined && part.time?.start !== undefined
                ? part.time.end - part.time.start
                : undefined,
            title: 'Assistant Message',
            preview: collapse(part.text),
            status: part.time?.end === undefined ? 'running' : 'completed',
            tokens: usage?.tokens,
            cost: usage?.cost,
            result: part.text,
            raw: part,
          });
          continue;
        }

        if (part.type === 'reasoning') {
          if (!part.text.trim()) continue;
          push({
            ...base,
            key: `part:${part.messageID}:${part.id}`,
            kind: 'reasoning',
            time: part.time.start,
            endTime: part.time.end,
            durationMs: part.time.end !== undefined ? part.time.end - part.time.start : undefined,
            title: 'Reasoning',
            preview: collapse(part.text),
            status: part.time.end === undefined ? 'running' : 'completed',
            result: part.text,
            payload: part.metadata ?? undefined,
            raw: part,
          });
          continue;
        }

        if (part.type === 'tool') {
          const times = toolTimes(part);
          const output = toolResultText(part);
          const existing = part.callID ? toolCallsById.get(part.callID) : undefined;
          if (existing) {
            mergeToolPart(existing, part, times, output);
            continue;
          }
          const created = push({
            ...base,
            key: `part:${part.messageID}:${part.id}`,
            kind: 'tool',
            time: times.start ?? info.time.created,
            endTime: times.end,
            durationMs:
              times.start !== undefined && times.end !== undefined
                ? times.end - times.start
                : undefined,
            title: part.tool || 'tool',
            preview:
              compactJson(part.state.input) ||
              ('title' in part.state ? (part.state.title ?? '') : ''),
            resultPreview: output ? collapse(output, 200) : undefined,
            status: toolStatus(part),
            toolName: part.tool || undefined,
            callId: part.callID,
            payload: hasInput(part) ? part.state.input : undefined,
            result: output,
            raw: part,
          });
          if (part.callID) toolCallsById.set(part.callID, created);
          continue;
        }

        if (part.type === 'subtask') {
          push({
            ...base,
            key: `part:${part.messageID}:${part.id}`,
            kind: 'subtask',
            time: info.time.created,
            title: 'Subagent',
            preview: `${part.agent}: ${collapse(part.description || part.prompt, 160)}`,
            payload: {
              agent: part.agent,
              description: part.description,
              prompt: part.prompt,
              model: part.model,
              command: part.command,
            },
            result: part.prompt,
            raw: part,
          });
          continue;
        }

        if (part.type === 'compaction') {
          push({
            ...base,
            key: `part:${part.messageID}:${part.id}`,
            kind: 'context',
            time: info.time.created,
            title: part.auto ? 'Auto Compaction' : 'Compaction',
            preview: 'Conversation history compacted',
            raw: part,
          });
          continue;
        }

        if (part.type === 'patch') {
          push({
            ...base,
            key: `part:${part.messageID}:${part.id}`,
            kind: 'context',
            time: info.time.created,
            title: 'Patch',
            preview: part.files.join(', '),
            payload: { hash: part.hash, files: part.files },
            raw: part,
          });
          continue;
        }

        if (part.type === 'retry') {
          push({
            ...base,
            key: `part:${part.messageID}:${part.id}`,
            kind: 'error',
            time: part.time.created,
            title: `Retry #${part.attempt}`,
            preview: collapse(part.error.data?.message ?? part.error.name),
            status: 'error',
            payload: part.error,
            result: part.error.data?.message,
            raw: part,
          });
        }
      }

      const error = msg.getError(info.id);
      if (error) {
        push({
          turn,
          step: stepNumber,
          key: `error:${info.id}`,
          kind: 'error',
          time: info.time.completed ?? info.time.created,
          title: error.name || 'Error',
          preview: collapse(error.message || 'Request failed'),
          status: 'error',
          messageId: info.id,
          sessionId: info.sessionID,
          parentMessageId: info.parentID,
          agent: messageAgent(info),
          model,
          payload: error,
          result: error.responseBody ?? error.message,
          raw: info.error ?? error,
        });
      }
    }
  }

  return { events, stats: computeStats(events, msg) };
}

function computeStats(
  events: TrajectoryEvent[],
  msg: ReturnType<typeof useMessages>,
): TrajectoryStats {
  const stats: TrajectoryStats = {
    turns: 0,
    steps: 0,
    calls: 0,
    events: events.length,
    elapsedMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheHitRate: null,
    tokensPerSecond: null,
    cost: 0,
  };

  const seenSteps = new Set<string>();
  let start: number | undefined;
  let end: number | undefined;
  let modelMs = 0;

  for (const event of events) {
    if (event.turn > stats.turns) stats.turns = event.turn;
    if (event.kind === 'tool') stats.calls += 1;
    if (event.step > 0) seenSteps.add(`${event.turn}:${event.step}`);
    if (event.time > 0 && (start === undefined || event.time < start)) start = event.time;
    const last = event.endTime ?? event.time;
    if (last > 0 && (end === undefined || last > end)) end = last;
  }
  stats.steps = seenSteps.size;

  // Token accounting lives on the assistant message, not on its parts, so it is
  // summed once per message rather than once per event.
  const countedMessages = new Set<string>();
  for (const event of events) {
    if (event.lane !== 'model' || countedMessages.has(event.messageId)) continue;
    countedMessages.add(event.messageId);
    const usage = msg.getUsage(event.messageId);
    if (!usage) continue;
    stats.inputTokens += usage.tokens.input;
    stats.outputTokens += usage.tokens.output;
    stats.reasoningTokens += usage.tokens.reasoning;
    stats.cacheRead += usage.tokens.cache?.read ?? 0;
    stats.cacheWrite += usage.tokens.cache?.write ?? 0;
    stats.cost += usage.cost ?? 0;
    const info = msg.get(event.messageId);
    if (info?.role === 'assistant' && info.time.completed) {
      modelMs += info.time.completed - info.time.created;
    }
  }

  stats.startTime = start;
  stats.endTime = end;
  stats.elapsedMs = start !== undefined && end !== undefined ? Math.max(0, end - start) : 0;

  const prompt = stats.inputTokens + stats.cacheRead;
  stats.cacheHitRate = prompt > 0 ? stats.cacheRead / prompt : null;
  stats.tokensPerSecond = modelMs > 0 ? stats.outputTokens / (modelMs / 1000) : null;

  return stats;
}

/**
 * @param enabled While false the stream is not rebuilt, so a hidden trajectory
 * costs nothing during streaming. The last built snapshot is kept, which is what
 * lets the view hold its selection and search across tab switches.
 */
export function useTrajectory(enabled?: Ref<boolean>) {
  const msg = useMessages();
  const live = computed(() => buildTrajectory(msg));
  const snapshot = shallowRef<{ events: TrajectoryEvent[]; stats: TrajectoryStats }>({
    events: [],
    stats: computeStats([], msg),
  });

  watchEffect(() => {
    if (enabled && !enabled.value) return;
    snapshot.value = live.value;
  });

  return {
    events: computed(() => snapshot.value.events),
    stats: computed(() => snapshot.value.stats),
  };
}
