import { type Ref } from 'vue';
import type { GlobalEventMap } from '../types/message';
import { TypedEmitter } from '../utils/eventEmitter';

type PermissionReply = 'once' | 'always' | 'reject';

type SessionScope = {
  on<K extends keyof UseGlobalEventsMap>(
    event: K,
    listener: (payload: UseGlobalEventsMap[K]) => void,
  ): () => void;
};

type UseGlobalEventsMap = GlobalEventMap & {
  'raw:event': { payload: unknown; eventType: string; sessionId?: string };
  'session:info': {
    id: string;
    projectID?: string;
    parentID?: string;
    title?: string;
    slug?: string;
    directory?: string;
    eventType: string;
    payload: unknown;
  };
  'worktree:ready': { directory: string; branch?: string; payload: unknown; eventType: string };
  'project:updated': {
    id: string;
    worktree?: string;
    sandboxes?: string[];
    payload: unknown;
    eventType: string;
  };
  'todo:updated': { sessionID: string; todos: unknown[]; payload: unknown; eventType: string };
  'pty:event': {
    type: string;
    normalized: string;
    info: unknown;
    id?: string;
    exitCode?: number;
    payload: unknown;
    eventType: string;
    sessionId?: string;
  };
  'permission:asked': {
    requestID: string;
    request: unknown;
    payload: unknown;
    eventType: string;
    sessionId?: string;
  };
  'permission:replied': {
    requestID: string;
    reply?: PermissionReply;
    sessionID?: string;
    payload: unknown;
    eventType: string;
    sessionId?: string;
  };
  'question:asked': {
    requestID: string;
    request: unknown;
    payload: unknown;
    eventType: string;
    sessionId?: string;
  };
  'question:replied': {
    requestID: string;
    payload: unknown;
    eventType: string;
    sessionId?: string;
  };
  'question:rejected': {
    requestID: string;
    payload: unknown;
    eventType: string;
    sessionId?: string;
  };
  'message:parsed': { message: unknown; payload: unknown; eventType: string; sessionId?: string };
  'message:finish': {
    finish?: string;
    sessionId?: string;
    messageId?: string;
    parentID?: string;
    error?: { name: string; message: string } | null;
    payload: unknown;
    eventType: string;
  };
  'message:usage': {
    messageId: string;
    sessionId?: string;
    usage: unknown;
    payload: unknown;
    eventType: string;
  };
  'message:step-finish': {
    reason?: string;
    sessionId?: string;
    messageId?: string;
    payload: unknown;
    eventType: string;
  };
  'file:read': { entries: unknown[]; payload: unknown; eventType: string; sessionId?: string };
  'patch:applied': { entries: unknown[]; payload: unknown; eventType: string; sessionId?: string };
  'session:diff': { payload: unknown; eventType: string; sessionId?: string };
  'connection:open': { event: Event };
  'connection:error': { event: Event };
  'connection:reconnecting': { attempt: number };
};

type Dependencies = {
  baseUrl: string;
  FILE_READ_EVENT_TYPES: Set<string>;
  FILE_WRITE_EVENT_TYPES: Set<string>;
  MESSAGE_EVENT_TYPES: Set<string>;
  normalizeEventType: (value: string) => string;
  extractSessionId: (payload: unknown) => string | undefined;
  extractMessageTextFromParts: (parts: unknown) => string | undefined;
  parseUserMessageMeta: (value: unknown) => unknown;
  extractMessageTime: (value?: Record<string, unknown>) => number | undefined;
  recentUserInputs: Array<{ text: string; time: number }>;
  storeUserMessageMeta: (id: string, meta: unknown) => void;
  storeUserMessageTime: (id: string, value: number) => void;
  resolveMessageUsage: (payload: unknown, eventType: string) => unknown;
  parsePermissionRequest: (value: unknown, fallbackSessionId?: string) => unknown;
  parseQuestionRequest: (value: unknown, fallbackSessionId?: string) => unknown;
  normalizeTodoItems: (value: unknown) => unknown[];
  parsePtyInfo: (value: unknown) => unknown;
  parsePatchTextBlocks: (patchText: string) => Array<{ path: string; content: string }>;
  guessLanguage: (path?: string, eventType?: string) => string;
  shouldRenderToolWindow: (tool: string) => boolean;
  extractToolOutputText: (output: unknown) => string | undefined;
  formatToolValue: (value: unknown) => string;
  renderWorkerHtml: (args: Record<string, unknown>) => Promise<string>;
  renderReadHtmlFromApi: (args: Record<string, unknown>) => Promise<string>;
  resolveReadWritePath: (
    input?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
    state?: Record<string, unknown>,
  ) => string;
  guessLanguageFromPath: (path?: string) => string;
  resolveReadRange: (input?: Record<string, unknown>) => { offset?: number; limit?: number };
  renderEditDiffHtml: (args: {
    diff: string;
    code?: string;
    after?: string;
    lang: string;
  }) => (() => Promise<string>) | string;
  formatGlobToolTitle: (input?: Record<string, unknown>) => string;
  formatListToolTitle: (input?: Record<string, unknown>) => string;
  formatWebfetchToolTitle: (input?: Record<string, unknown>) => string;
  formatQueryToolTitle: (input?: Record<string, unknown>) => string;
  formatTaskToolOutput: (value: string) => string;
  DefaultContent: unknown;
  log: (...args: unknown[]) => void;
};

export function useGlobalEvents(deps: Dependencies) {
  const emitter = new TypedEmitter<UseGlobalEventsMap>();
  let src: EventSource | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;

  function parsePayload(raw: string) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  function resolveEventType(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return eventType;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    return (
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType
    );
  }

  function extractMessageError(
    info: Record<string, unknown> | undefined,
  ): { name: string; message: string } | null {
    const error = info?.error;
    if (!error || typeof error !== 'object') return null;
    const record = error as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : '';
    const data =
      record.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>)
        : undefined;
    const message =
      typeof data?.message === 'string'
        ? data.message
        : typeof record.message === 'string'
          ? record.message
          : '';
    if (!name) return null;
    return { name, message };
  }

  function extractMessage(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    if (!deps.MESSAGE_EVENT_TYPES.has(eventType)) return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const info =
      properties?.info && typeof properties.info === 'object'
        ? (properties.info as Record<string, unknown>)
        : undefined;
    const part =
      properties?.part && typeof properties.part === 'object'
        ? (properties.part as Record<string, unknown>)
        : undefined;
    const data =
      (record.data as Record<string, unknown> | undefined) ??
      nestedPayload ??
      (record.result as Record<string, unknown> | undefined);

    const messageObject =
      (properties?.message as Record<string, unknown> | undefined) ??
      (data?.message as Record<string, unknown> | undefined) ??
      (record.message as Record<string, unknown> | undefined);
    const partType =
      (part?.type as string | undefined) ??
      (properties?.type as string | undefined) ??
      (data?.type as string | undefined) ??
      (messageObject?.type as string | undefined);
    const partText = typeof part?.text === 'string' ? (part.text as string) : undefined;
    const messageFromPart =
      partText && (!partType || partType.includes('text') || partType === 'reasoning')
        ? partText
        : undefined;
    const partId = typeof part?.id === 'string' ? (part.id as string) : undefined;
    const messageFromObject =
      (messageObject &&
        (typeof messageObject.content === 'string'
          ? messageObject.content
          : typeof messageObject.text === 'string'
            ? messageObject.text
            : undefined)) ??
      (messageObject && deps.extractMessageTextFromParts(messageObject.parts));

    const message = messageFromPart ?? messageFromObject;

    if (typeof message !== 'string') return null;

    if (partType && (partType.startsWith('input') || partType.startsWith('step-'))) return null;

    const role =
      (part?.role as string | undefined) ??
      (messageObject?.role as string | undefined) ??
      (info?.role as string | undefined) ??
      (properties?.role as string | undefined) ??
      (data?.role as string | undefined) ??
      (record.role as string | undefined);
    let resolvedRole = role as 'user' | 'assistant' | undefined;
    if (!resolvedRole) {
      const normalized = message.trim();
      const recentMatch = deps.recentUserInputs.find((entry) => entry.text === normalized);
      if (recentMatch) resolvedRole = 'user';
    }

    const userMeta =
      deps.parseUserMessageMeta(info) ??
      deps.parseUserMessageMeta(messageObject as Record<string, unknown> | undefined);
    const messageTime =
      deps.extractMessageTime(info) ??
      deps.extractMessageTime(messageObject as Record<string, unknown> | undefined);

    const messageId =
      (part?.messageID as string | undefined) ??
      (messageObject?.id as string | undefined) ??
      (messageObject?.messageId as string | undefined) ??
      (info?.id as string | undefined) ??
      (properties?.messageId as string | undefined) ??
      (properties?.id as string | undefined) ??
      (data?.messageId as string | undefined) ??
      (data?.id as string | undefined) ??
      (record.messageId as string | undefined) ??
      (record.id as string | undefined) ??
      (properties?.sessionID as string | undefined);
    const id = (part?.id as string | undefined) ?? messageId ?? 'message:default';

    if (userMeta) {
      deps.storeUserMessageMeta(messageId ?? id, userMeta);
    }
    if (typeof messageTime === 'number') {
      deps.storeUserMessageTime(messageId ?? id, messageTime);
    }

    return {
      id,
      messageId,
      content: message,
      bodyContent: messageFromObject,
      role: resolvedRole,
      partId,
      partType,
      isPartUpdatedEvent: deps.normalizeEventType(eventType) === 'messagepartupdated',
      userMeta,
      messageTime,
    };
  }

  function extractStepFinish(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    if (!deps.MESSAGE_EVENT_TYPES.has(eventType)) return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const part =
      properties?.part && typeof properties.part === 'object'
        ? (properties.part as Record<string, unknown>)
        : undefined;
    const partType = typeof part?.type === 'string' ? part.type : undefined;
    if (partType !== 'step-finish') return null;
    const reason = typeof part?.reason === 'string' ? (part.reason as string) : undefined;
    const sessionId = typeof part?.sessionID === 'string' ? (part.sessionID as string) : undefined;
    const messageId = typeof part?.messageID === 'string' ? (part.messageID as string) : undefined;
    return { reason, sessionId, messageId };
  }

  function extractMessageFinish(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const info =
      (properties?.info && typeof properties.info === 'object'
        ? (properties.info as Record<string, unknown>)
        : undefined) ??
      (record.info && typeof record.info === 'object'
        ? (record.info as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type || !type.toLowerCase().includes('message.updated')) return null;
    const finish =
      (typeof info?.finish === 'string' ? (info.finish as string) : undefined) ??
      (typeof record.finish === 'string' ? (record.finish as string) : undefined);
    const error = extractMessageError(info);
    if (!finish && !error) return null;
    const sessionId =
      typeof info?.sessionID === 'string'
        ? (info.sessionID as string)
        : typeof (record.sessionID as string | undefined) === 'string'
          ? (record.sessionID as string)
          : undefined;
    const messageId =
      typeof info?.id === 'string'
        ? (info.id as string)
        : typeof (info?.messageId as string | undefined) === 'string'
          ? (info?.messageId as string)
          : undefined;
    const parentID = typeof info?.parentID === 'string' ? (info.parentID as string) : undefined;
    return { finish, sessionId, messageId, parentID, error };
  }

  function extractUsageUpdate(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    if (!deps.MESSAGE_EVENT_TYPES.has(eventType)) return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const info =
      properties?.info && typeof properties.info === 'object'
        ? (properties.info as Record<string, unknown>)
        : undefined;
    const part =
      properties?.part && typeof properties.part === 'object'
        ? (properties.part as Record<string, unknown>)
        : undefined;
    const partType = typeof part?.type === 'string' ? part.type : undefined;
    const isMessageUpdated = String(eventType).toLowerCase().includes('message.updated');
    if (partType && partType !== 'step-finish' && !isMessageUpdated) return null;
    const usage = deps.resolveMessageUsage(payload, eventType);
    if (!usage) return null;
    const messageId =
      (part?.messageID as string | undefined) ??
      (info?.id as string | undefined) ??
      (info?.messageId as string | undefined) ??
      (properties?.messageId as string | undefined) ??
      (properties?.id as string | undefined) ??
      (record.messageId as string | undefined) ??
      (record.id as string | undefined);
    const sessionId =
      (typeof part?.sessionID === 'string' ? (part.sessionID as string) : undefined) ??
      (typeof info?.sessionID === 'string' ? (info.sessionID as string) : undefined) ??
      deps.extractSessionId(payload);
    if (!messageId) return null;
    return { messageId, sessionId, usage };
  }

  function extractPermissionAsked(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const data =
      (record.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>)
        : undefined) ??
      (record.result && typeof record.result === 'object'
        ? (record.result as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (
      normalized !== 'permissionasked' &&
      normalized !== 'permissionupdated' &&
      normalized !== 'permissionupdate'
    )
      return null;
    const request = properties ?? data;
    return deps.parsePermissionRequest(request, deps.extractSessionId(payload));
  }

  function extractPermissionReplied(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (normalized !== 'permissionreplied') return null;
    const requestID =
      (properties?.permissionID as string | undefined) ??
      (properties?.permissionId as string | undefined) ??
      (properties?.requestID as string | undefined) ??
      (properties?.id as string | undefined) ??
      (record.permissionID as string | undefined) ??
      (record.id as string | undefined);
    const replyCandidate =
      (properties?.response as string | undefined) ?? (properties?.reply as string | undefined);
    const reply =
      replyCandidate === 'once' || replyCandidate === 'always' || replyCandidate === 'reject'
        ? (replyCandidate as PermissionReply)
        : undefined;
    const sessionID =
      (properties?.sessionID as string | undefined) ??
      (properties?.sessionId as string | undefined) ??
      (properties?.session_id as string | undefined) ??
      deps.extractSessionId(payload);
    if (!requestID) return null;
    return { requestID, reply, sessionID };
  }

  function extractQuestionAsked(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const data =
      (record.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>)
        : undefined) ??
      (record.result && typeof record.result === 'object'
        ? (record.result as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (
      normalized !== 'questionasked' &&
      normalized !== 'questionupdated' &&
      normalized !== 'questionupdate'
    )
      return null;
    const request = properties ?? data;
    return deps.parseQuestionRequest(request, deps.extractSessionId(payload));
  }

  function extractQuestionReplied(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (normalized !== 'questionreplied') return null;
    const requestID =
      (properties?.questionID as string | undefined) ??
      (properties?.questionId as string | undefined) ??
      (properties?.requestID as string | undefined) ??
      (properties?.id as string | undefined) ??
      (record.questionID as string | undefined) ??
      (record.id as string | undefined);
    if (!requestID) return null;
    return { requestID };
  }

  function extractQuestionRejected(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (normalized !== 'questionrejected') return null;
    const requestID =
      (properties?.questionID as string | undefined) ??
      (properties?.questionId as string | undefined) ??
      (properties?.requestID as string | undefined) ??
      (properties?.id as string | undefined) ??
      (record.questionID as string | undefined) ??
      (record.id as string | undefined);
    if (!requestID) return null;
    return { requestID };
  }

  function extractSessionInfo(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (typeof type !== 'string' || !type.startsWith('session.')) return null;
    const info =
      properties?.info && typeof properties.info === 'object'
        ? (properties.info as Record<string, unknown>)
        : undefined;
    if (!info || typeof info.id !== 'string') return null;
    const sessionInfo: {
      id: string;
      projectID?: string;
      parentID?: string;
      title?: string;
      slug?: string;
      directory?: string;
    } = { id: info.id as string };
    if (typeof info.projectID === 'string') sessionInfo.projectID = info.projectID as string;
    if (typeof info.parentID === 'string') sessionInfo.parentID = info.parentID as string;
    if (typeof info.title === 'string') sessionInfo.title = info.title as string;
    if (typeof info.slug === 'string') sessionInfo.slug = info.slug as string;
    if (typeof info.directory === 'string') sessionInfo.directory = info.directory as string;
    return sessionInfo;
  }

  function extractTodoUpdated(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (normalized !== 'todoupdated') return null;
    const sessionID =
      (typeof properties?.sessionID === 'string' && properties.sessionID) ||
      (typeof properties?.sessionId === 'string' && properties.sessionId) ||
      deps.extractSessionId(payload);
    if (!sessionID) return null;
    return {
      sessionID,
      todos: deps.normalizeTodoItems(properties?.todos),
    };
  }

  function extractPtyEvent(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (!normalized.startsWith('pty')) return null;
    const infoRaw =
      properties?.info && typeof properties.info === 'object' ? properties.info : undefined;
    const info = deps.parsePtyInfo(infoRaw);
    const id =
      (properties?.id as string | undefined) ??
      ((info as Record<string, unknown> | undefined)?.id as string | undefined) ??
      (record.id as string | undefined);
    const exitCode =
      typeof properties?.exitCode === 'number'
        ? properties.exitCode
        : typeof (properties as Record<string, unknown>)?.exitCode === 'string'
          ? Number(properties?.exitCode)
          : undefined;
    return { type, normalized, info, id, exitCode };
  }

  function extractPatch(payload: unknown) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const data =
      (record.data as Record<string, unknown> | undefined) ??
      nestedPayload ??
      (record.result as Record<string, unknown> | undefined);
    const messageObject =
      (properties?.message as Record<string, unknown> | undefined) ??
      (data?.message as Record<string, unknown> | undefined) ??
      (record.message as Record<string, unknown> | undefined);
    const part =
      (properties?.part && typeof properties.part === 'object'
        ? (properties.part as Record<string, unknown>)
        : undefined) ??
      (data?.part && typeof data.part === 'object'
        ? (data.part as Record<string, unknown>)
        : undefined) ??
      (record.part && typeof record.part === 'object'
        ? (record.part as Record<string, unknown>)
        : undefined) ??
      (messageObject?.part && typeof messageObject.part === 'object'
        ? (messageObject.part as Record<string, unknown>)
        : undefined);

    if (part?.type !== 'tool' || part?.tool !== 'apply_patch') return null;

    const callId =
      (part?.callID as string | undefined) ??
      (part?.callId as string | undefined) ??
      (properties?.callID as string | undefined) ??
      (properties?.callId as string | undefined);
    const state =
      part?.state && typeof part.state === 'object'
        ? (part.state as Record<string, unknown>)
        : undefined;
    const status = typeof state?.status === 'string' ? state.status : undefined;
    if (!status || status === 'pending' || status === 'running') return null;

    const input =
      state?.input && typeof state.input === 'object'
        ? (state.input as Record<string, unknown>)
        : undefined;
    const metadata =
      state?.metadata && typeof state.metadata === 'object'
        ? (state.metadata as Record<string, unknown>)
        : undefined;

    const patchText = typeof input?.patchText === 'string' ? input.patchText : '';
    const parsedBlocks = patchText ? deps.parsePatchTextBlocks(patchText) : [];
    if (parsedBlocks.length === 0) return null;

    const metadataFilesRaw = Array.isArray(metadata?.files) ? metadata.files : [];
    const metadataFileRecords = metadataFilesRaw.map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const relativePath =
        (typeof record.relativePath === 'string' && record.relativePath) ||
        (typeof record.filePath === 'string' && record.filePath) ||
        (typeof record.file === 'string' && record.file) ||
        undefined;
      const diff = typeof record.diff === 'string' ? record.diff : undefined;
      const before = typeof record.before === 'string' ? record.before : undefined;
      const after = typeof record.after === 'string' ? record.after : undefined;
      return { relativePath, diff, before, after, record };
    });

    const baseCallId = callId ?? 'apply_patch';
    const entries = parsedBlocks.map((block, index) => {
      const mf = metadataFileRecords[index];
      return {
        content: block.content,
        path: block.path,
        code: mf?.before,
        after: mf?.after,
        isWrite: true,
        callId: `${baseCallId}:${index}`,
        toolStatus: status,
        toolName: 'apply_patch',
        toolTitle: block.path,
        lang: deps.guessLanguage(block.path),
        view: 'diff' as const,
      };
    });
    return entries;
  }

  function extractFileRead(payload: unknown, eventType: string) {
    if (typeof payload === 'string') {
      if (deps.FILE_READ_EVENT_TYPES.has(eventType) || deps.FILE_WRITE_EVENT_TYPES.has(eventType)) {
        return { content: payload, path: undefined, isWrite: deps.FILE_WRITE_EVENT_TYPES.has(eventType) };
      }
      return null;
    }

    if (!payload || typeof payload !== 'object') return null;

    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const part =
      properties?.part && typeof properties.part === 'object'
        ? (properties.part as Record<string, unknown>)
        : undefined;
    const tool = part?.tool;
    if (part?.type === 'tool' && typeof tool === 'string') {
      if (!deps.shouldRenderToolWindow(tool) || tool === 'apply_patch') return null;
      const state =
        part?.state && typeof part.state === 'object'
          ? (part.state as Record<string, unknown>)
          : undefined;
      const status = typeof state?.status === 'string' ? state.status : undefined;
      if (!status || status === 'pending') return null;
      const input =
        state?.input && typeof state.input === 'object'
          ? (state.input as Record<string, unknown>)
          : undefined;
      const metadata =
        state?.metadata && typeof state.metadata === 'object'
          ? (state.metadata as Record<string, unknown>)
          : undefined;
      const output =
        state?.output ?? (state?.metadata as Record<string, unknown> | undefined)?.output;
      const callId =
        (part?.callID as string | undefined) ??
        (part?.callId as string | undefined) ??
        (properties?.callID as string | undefined) ??
        (properties?.callId as string | undefined);
      const outputText = output !== undefined ? deps.extractToolOutputText(output) : undefined;
      const stateError = state?.error;
      const errorText =
        typeof stateError === 'string'
          ? stateError
          : stateError !== undefined
            ? deps.formatToolValue(stateError)
            : undefined;

      const toolPrefix = (label: string, detail?: string) => {
        const d = detail?.trim();
        return d ? `[${label}] ${d}` : `[${label}]`;
      };

      switch (tool) {
        case 'bash': {
          const command = typeof input?.command === 'string' ? input.command.trim() : '';
          const titleDetail = command ? command.split('\n')[0].slice(0, 80) : undefined;
          const bashOutput = outputText ?? errorText ?? '';
          const bashLines: string[] = [];
          if (command) bashLines.push(`$ ${command}`);
          if (bashOutput.trim()) {
            if (bashLines.length > 0) bashLines.push('');
            bashLines.push(bashOutput);
          }
          const bashCode = bashLines.length === 0 && status === 'running' ? '$' : bashLines.join('\n');
          return {
            content: () => deps.renderWorkerHtml({
              id: `bash-${callId ?? Date.now().toString(36)}`,
              code: bashCode,
              lang: 'shellscript',
              theme: 'github-dark',
              gutterMode: 'none',
            }),
            variant: 'term' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('SHELL', titleDetail),
          };
        }
        case 'read': {
          if (status === 'running') return null;
          const readPath = deps.resolveReadWritePath(input, metadata, state);
          const readLang = deps.guessLanguageFromPath(readPath);
          const readRange = deps.resolveReadRange(input);
          return {
            content: () =>
              deps.renderReadHtmlFromApi({
                callId,
                path: readPath,
                lang: readLang,
                lineOffset: readRange.offset,
                lineLimit: readRange.limit,
                fallbackText: outputText,
              }),
            variant: 'code' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('READ', readPath),
          };
        }
        case 'grep': {
          if (status === 'running') return null;
          const grepCode = outputText ?? errorText ?? '';
          const grepLineRe = /^\s*Line\s+(\d+):\s?/;
          const gutterLines = grepCode
            .split('\n')
            .map((line) => {
              const match = line.match(grepLineRe);
              return match?.[1] ?? '';
            });
          const grepPattern = typeof input?.pattern === 'string' ? input.pattern : undefined;
          return {
            content: () => deps.renderWorkerHtml({
              id: `grep-${callId ?? Date.now().toString(36)}`,
              code: grepCode.split('\n').map((line) => line.replace(grepLineRe, '')).join('\n'),
              lang: 'text',
              theme: 'github-dark',
              gutterMode: 'single',
              gutterLines,
              grepPattern,
            }),
            variant: 'code' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('GREP', deps.formatGlobToolTitle(input)),
          };
        }
        case 'glob': {
          if (status === 'running') return null;
          const globCode = outputText ?? errorText ?? '';
          return {
            content: () => deps.renderWorkerHtml({
              id: `glob-${callId ?? Date.now().toString(36)}`,
              code: globCode,
              lang: 'text',
              theme: 'github-dark',
              gutterMode: 'none',
            }),
            variant: 'term' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('GLOB', deps.formatGlobToolTitle(input)),
          };
        }
        case 'list': {
          const listCode = outputText ?? errorText ?? '';
          return {
            content: () => deps.renderWorkerHtml({
              id: `list-${callId ?? Date.now().toString(36)}`,
              code: listCode,
              lang: 'text',
              theme: 'github-dark',
              gutterMode: 'single',
            }),
            variant: 'code' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('LS', deps.formatListToolTitle(input)),
          };
        }
        case 'webfetch': {
          if (status === 'running') return null;
          const webfetchCode = outputText ?? errorText ?? '';
          const format = typeof input?.format === 'string' ? input.format.toLowerCase() : '';
          const webfetchLang =
            format === 'html' ? 'html' : format === 'markdown' ? 'markdown' : 'text';
          return {
            content: () => deps.renderWorkerHtml({
              id: `webfetch-${callId ?? Date.now().toString(36)}`,
              code: webfetchCode,
              lang: webfetchLang,
              theme: 'github-dark',
              gutterMode: 'none',
            }),
            variant: 'plain' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('FETCH', deps.formatWebfetchToolTitle(input)),
          };
        }
        case 'websearch':
        case 'codesearch': {
          if (status === 'running') return null;
          const searchPrefix = tool === 'websearch' ? 'SEARCH' : 'CODE';
          const searchCode = outputText ?? errorText ?? '';
          return {
            content: () => deps.renderWorkerHtml({
              id: `${tool}-${callId ?? Date.now().toString(36)}`,
              code: searchCode,
              lang: 'markdown',
              theme: 'github-dark',
              gutterMode: 'none',
            }),
            variant: 'plain' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix(searchPrefix, deps.formatQueryToolTitle(input)),
          };
        }
        case 'task': {
          const taskDescription = typeof input?.description === 'string' ? input.description.trim() : '';
          const taskPrompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
          const taskTitle = taskDescription || (taskPrompt ? taskPrompt.split('\n')[0].slice(0, 80) : '');
          const taskOutput = deps.formatTaskToolOutput(outputText ?? errorText ?? '');
          const taskCode = taskPrompt
            ? `## Input\n\n${taskPrompt}\n\n---\n\n## Output\n\n${taskOutput}`
            : taskOutput;
          return {
            content: () => deps.renderWorkerHtml({
              id: `task-${callId ?? Date.now().toString(36)}`,
              code: taskCode,
              lang: 'markdown',
              theme: 'github-dark',
              gutterMode: 'none',
            }),
            variant: 'term' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('TASK', taskTitle),
          };
        }
        case 'batch': {
          const batchCode = outputText ?? errorText ?? '';
          return {
            content: () => deps.renderWorkerHtml({
              id: `batch-${callId ?? Date.now().toString(36)}`,
              code: batchCode,
              lang: 'text',
              theme: 'github-dark',
              gutterMode: 'single',
            }),
            variant: 'code' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('BATCH'),
          };
        }
        case 'write': {
          const writePath = deps.resolveReadWritePath(input, metadata, state);
          const writeContent = typeof input?.content === 'string' ? input.content : '';
          const writeCode = writeContent || outputText || errorText || '';
          const inputFilePath = typeof input?.filePath === 'string' ? input.filePath : writePath;
          const writeLang = deps.guessLanguageFromPath(inputFilePath);
          return {
            content: () => deps.renderWorkerHtml({
              id: `write-${callId ?? Date.now().toString(36)}`,
              code: writeCode,
              lang: writeLang,
              theme: 'github-dark',
              gutterMode: 'single',
            }),
            variant: 'code' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('WRITE', writePath),
          };
        }
        case 'edit': {
          if (status === 'running') return null;
          const diff = typeof metadata?.diff === 'string' ? metadata.diff : '';
          if (!diff) return null;
          const editPath = deps.resolveReadWritePath(input, metadata, state);
          const filediff = metadata?.filediff && typeof metadata.filediff === 'object'
            ? (metadata.filediff as Record<string, unknown>)
            : undefined;
          const editCode = typeof filediff?.before === 'string' ? filediff.before : undefined;
          const editAfter = typeof filediff?.after === 'string' ? filediff.after : undefined;
          const editLang = deps.guessLanguageFromPath(editPath);
          return {
            content: deps.renderEditDiffHtml({ diff, code: editCode, after: editAfter, lang: editLang }),
            variant: 'diff' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('EDIT', editPath),
          };
        }
        case 'multiedit': {
          if (status === 'running') return null;
          const editPathMulti = deps.resolveReadWritePath(input, metadata, state);
          const multiLang = deps.guessLanguageFromPath(editPathMulti);
          const results = Array.isArray(metadata?.results) ? metadata.results : [];
          const editEntries = results
            .map((item) => {
              if (!item || typeof item !== 'object') return null;
              const r = item as Record<string, unknown>;
              const diff = r.diff;
              if (typeof diff !== 'string' || !diff.trim()) return null;
              const fd = r.filediff && typeof r.filediff === 'object'
                ? (r.filediff as Record<string, unknown>)
                : undefined;
              return {
                diff,
                code: typeof fd?.before === 'string' ? fd.before : undefined,
                after: typeof fd?.after === 'string' ? fd.after : undefined,
              };
            })
            .filter((item): item is { diff: string; code: string | undefined; after: string | undefined } => Boolean(item));
          if (editEntries.length > 1) {
            return editEntries.map((entry, index) => ({
              content: deps.renderEditDiffHtml({ diff: entry.diff, code: entry.code, after: entry.after, lang: multiLang }),
              variant: 'diff' as const,
              callId: callId ? `${callId}:${index}` : undefined,
              toolName: tool,
              toolStatus: status,
              title: toolPrefix('EDIT', editPathMulti ? `${editPathMulti} (${index + 1}/${editEntries.length})` : `(${index + 1}/${editEntries.length})`),
            }));
          }
          if (editEntries.length === 1) {
            return {
              content: deps.renderEditDiffHtml({ diff: editEntries[0].diff, code: editEntries[0].code, after: editEntries[0].after, lang: multiLang }),
              variant: 'diff' as const,
              callId,
              toolName: tool,
              toolStatus: status,
              title: toolPrefix('EDIT', editPathMulti),
            };
          }
          return null;
        }
        case 'plan_enter':
        case 'plan_exit': {
          return {
            component: deps.DefaultContent,
            props: { input, output: outputText, error: errorText, status, state, toolName: tool },
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix(tool === 'plan_enter' ? 'PLAN' : 'PLAN EXIT'),
          };
        }
        default:
          return null;
      }
    }
    const type =
      record.type ??
      record.event ??
      record.name ??
      record.command ??
      nestedPayload?.type ??
      eventType;

    if (
      typeof type === 'string' &&
      (deps.FILE_READ_EVENT_TYPES.has(type) || deps.FILE_WRITE_EVENT_TYPES.has(type))
    ) {
      const isWrite = deps.FILE_WRITE_EVENT_TYPES.has(type);
      if (isWrite) return null;
      const isDiffEvent = type.startsWith('session.diff');
      if (isDiffEvent) return null;
      const data =
        (record.data as Record<string, unknown> | undefined) ??
        (record.payload as Record<string, unknown> | undefined) ??
        (record.result as Record<string, unknown> | undefined) ??
        (record.file as Record<string, unknown> | undefined) ??
        (record.params as Record<string, unknown> | undefined) ??
        (record.arguments as Record<string, unknown> | undefined);
      const content =
        (data?.content as string | undefined) ??
        (data?.text as string | undefined) ??
        (data?.body as string | undefined) ??
        (data?.fileContent as string | undefined) ??
        ((data?.file as Record<string, unknown> | undefined)?.content as string | undefined) ??
        (isDiffEvent
          ? ((data?.diff as string | undefined) ?? (data?.patch as string | undefined))
          : undefined);

      const path =
        (data?.path as string | undefined) ??
        (data?.filePath as string | undefined) ??
        (data?.name as string | undefined) ??
        ((data?.file as Record<string, unknown> | undefined)?.path as string | undefined);

      if (typeof content === 'string') {
        return { content, path, isWrite };
      }
    }

    return null;
  }

  function extractWorktreeReady(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (normalized !== 'worktreeready') return null;
    const directory =
      (typeof record.directory === 'string' && record.directory) ||
      (typeof nestedPayload?.directory === 'string' && nestedPayload.directory) ||
      (typeof properties?.directory === 'string' && properties.directory)
        ? String(record.directory ?? nestedPayload?.directory ?? properties?.directory)
        : undefined;
    if (!directory) return null;
    const branch = typeof properties?.branch === 'string' ? properties.branch : undefined;
    return { directory, branch };
  }

  function extractProjectUpdated(payload: unknown, eventType: string) {
    if (!payload || typeof payload !== 'object') return null;
    const record = payload as Record<string, unknown>;
    const nestedPayload =
      record.payload && typeof record.payload === 'object'
        ? (record.payload as Record<string, unknown>)
        : undefined;
    const properties =
      (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
        ? (nestedPayload.properties as Record<string, unknown>)
        : undefined) ??
      (record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined);
    const type =
      (record.type as string | undefined) ??
      (record.event as string | undefined) ??
      (nestedPayload?.type as string | undefined) ??
      eventType;
    if (!type) return null;
    const normalized = deps.normalizeEventType(type);
    if (normalized !== 'projectupdated' && normalized !== 'projectupdate') return null;
    const id =
      (typeof properties?.id === 'string' && properties.id) ||
      (typeof record.id === 'string' && record.id) ||
      undefined;
    if (!id) return null;
    const worktree = typeof properties?.worktree === 'string' ? properties.worktree : undefined;
    const sandboxes = Array.isArray(properties?.sandboxes)
      ? properties.sandboxes.filter((entry) => typeof entry === 'string')
      : undefined;
    return { id, worktree, sandboxes };
  }

  function routePayload(payload: unknown, rawEventType: string) {
    const eventType = resolveEventType(payload, rawEventType);
    const sessionId = deps.extractSessionId(payload);
    emitter.emit('raw:event', { payload, eventType, sessionId });

    const permissionReplied = extractPermissionReplied(payload, eventType);
    if (permissionReplied) {
      emitter.emit('permission:replied', {
        ...permissionReplied,
        payload,
        eventType,
        sessionId,
      });
      return;
    }

    const questionReplied = extractQuestionReplied(payload, eventType);
    if (questionReplied) {
      emitter.emit('question:replied', { ...questionReplied, payload, eventType, sessionId });
      return;
    }

    const questionRejected = extractQuestionRejected(payload, eventType);
    if (questionRejected) {
      emitter.emit('question:rejected', { ...questionRejected, payload, eventType, sessionId });
      return;
    }

    const permissionAsked = extractPermissionAsked(payload, eventType);
    if (permissionAsked) {
      emitter.emit('permission:asked', {
        requestID: String((permissionAsked as Record<string, unknown>).id ?? ''),
        request: permissionAsked,
        payload,
        eventType,
        sessionId,
      });
      return;
    }

    const questionAsked = extractQuestionAsked(payload, eventType);
    if (questionAsked) {
      emitter.emit('question:asked', {
        requestID: String((questionAsked as Record<string, unknown>).id ?? ''),
        request: questionAsked,
        payload,
        eventType,
        sessionId,
      });
      return;
    }

    const worktreeReady = extractWorktreeReady(payload, eventType);
    if (worktreeReady) emitter.emit('worktree:ready', { ...worktreeReady, payload, eventType });

    const projectUpdated = extractProjectUpdated(payload, eventType);
    if (projectUpdated) emitter.emit('project:updated', { ...projectUpdated, payload, eventType });

    const sessionInfo = extractSessionInfo(payload, eventType);
    if (sessionInfo) emitter.emit('session:info', { ...sessionInfo, payload, eventType });

    if (eventType && eventType.startsWith('session.diff')) {
      emitter.emit('session:diff', { payload, eventType, sessionId });
      return;
    }

    const todoUpdate = extractTodoUpdated(payload, eventType);
    if (todoUpdate) emitter.emit('todo:updated', { ...todoUpdate, payload, eventType });

    const ptyEvent = extractPtyEvent(payload, eventType);
    if (ptyEvent) emitter.emit('pty:event', { ...ptyEvent, payload, eventType, sessionId });

    const stepFinish = extractStepFinish(payload, eventType);
    if (stepFinish) emitter.emit('message:step-finish', { ...stepFinish, payload, eventType });

    const usageUpdate = extractUsageUpdate(payload, eventType);
    if (usageUpdate) emitter.emit('message:usage', { ...usageUpdate, payload, eventType });

    const messageFinish = extractMessageFinish(payload, eventType);
    if (messageFinish) emitter.emit('message:finish', { ...messageFinish, payload, eventType });

    const patchEvents = extractPatch(payload);
    if (patchEvents) {
      emitter.emit('patch:applied', { entries: patchEvents, payload, eventType, sessionId });
      return;
    }

    const fileReadResult = extractFileRead(payload, eventType);
    if (fileReadResult) {
      const entries = Array.isArray(fileReadResult) ? fileReadResult : [fileReadResult];
      emitter.emit('file:read', { entries, payload, eventType, sessionId });
      return;
    }

    const message = extractMessage(payload, eventType);
    if (message) emitter.emit('message:parsed', { message, payload, eventType, sessionId });
  }

  function waitForOpen(timeoutMs = 5000) {
    return new Promise<void>((resolve, reject) => {
      const current = src;
      if (!current) {
        reject(new Error('SSE connection is not initialized.'));
        return;
      }
      if (current.readyState === EventSource.OPEN) {
        resolve();
        return;
      }
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('SSE connection failed.'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('SSE connection timed out.'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        current.removeEventListener('open', onOpen);
        current.removeEventListener('error', onError);
      };
      current.addEventListener('open', onOpen, { once: true });
      current.addEventListener('error', onError, { once: true });
    });
  }

  async function connect(options: { failFast?: boolean; timeoutMs?: number } = {}) {
    if (src) {
      if (options.failFast) {
        await waitForOpen(options.timeoutMs ?? 5000);
      }
      return;
    }

    deps.log('connecting...');
    src = new EventSource(`${deps.baseUrl}/global/event`);
    const handleEvent = (event: MessageEvent) => {
      const payload = parsePayload(event.data);
      const payloadText = typeof payload === 'string' ? payload : JSON.stringify(payload);
      deps.log(payloadText);
      routePayload(payload, event.type);
    };

    src.addEventListener('open', (event) => {
      reconnectAttempt = 0;
      emitter.emit('connection:open', { event });
    });
    src.addEventListener('message', handleEvent);
    deps.FILE_READ_EVENT_TYPES.forEach((eventType) => {
      src?.addEventListener(eventType, handleEvent);
    });
    deps.FILE_WRITE_EVENT_TYPES.forEach((eventType) => {
      src?.addEventListener(eventType, handleEvent);
    });
    deps.MESSAGE_EVENT_TYPES.forEach((eventType) => {
      src?.addEventListener(eventType, handleEvent);
    });
    src.addEventListener('error', (event) => {
      emitter.emit('connection:error', { event });
      src?.close();
      src = undefined;
      if (reconnectTimer) return;
      reconnectAttempt += 1;
      emitter.emit('connection:reconnecting', { attempt: reconnectAttempt });
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, 1000);
    });

    if (options.failFast) {
      await waitForOpen(options.timeoutMs ?? 5000);
    }
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    src?.close();
    src = undefined;
  }

  function on<K extends keyof UseGlobalEventsMap>(
    event: K,
    listener: (payload: UseGlobalEventsMap[K]) => void,
  ) {
    return emitter.on(event, listener);
  }

  function session(
    selectedSessionId: Ref<string>,
    sessionParentById: Ref<Map<string, string>>,
  ): SessionScope {
    const allowedSessionIds = () => {
      const rootId = selectedSessionId.value;
      const allowed = new Set<string>();
      if (!rootId) return allowed;

      const childrenByParent = new Map<string, string[]>();
      sessionParentById.value.forEach((parentId, sessionId) => {
        if (!parentId) return;
        const bucket = childrenByParent.get(parentId) ?? [];
        bucket.push(sessionId);
        childrenByParent.set(parentId, bucket);
      });
      const stack = [rootId];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (allowed.has(current)) continue;
        allowed.add(current);
        const children = childrenByParent.get(current);
        if (children) stack.push(...children);
      }
      return allowed;
    };

    return {
      on<K extends keyof UseGlobalEventsMap>(
        event: K,
        listener: (payload: UseGlobalEventsMap[K]) => void,
      ) {
        return on(event, (payload) => {
          const rec = payload as Record<string, unknown>;
          const sessionId =
            (typeof rec.sessionId === 'string' ? rec.sessionId : undefined) ??
            (typeof rec.sessionID === 'string' ? rec.sessionID : undefined);
          if (!sessionId) {
            listener(payload);
            return;
          }
          const allowed = allowedSessionIds();
          if (allowed.size === 0 || !allowed.has(sessionId)) return;
          listener(payload);
        });
      },
    };
  }

  return {
    on,
    connect,
    disconnect,
    session,
    parsePayload,
    extractMessage,
    extractMessageFinish,
    extractUsageUpdate,
    extractPermissionAsked,
    extractPermissionReplied,
    extractQuestionAsked,
    extractQuestionReplied,
    extractQuestionRejected,
    extractSessionInfo,
    extractTodoUpdated,
    extractPtyEvent,
    extractPatch,
    extractFileRead,
    extractStepFinish,
  };
}
