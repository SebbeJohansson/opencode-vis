/** One OpenCode-style SSE frame; the Claude translator emits the same shape. */
export type SseEnvelope = {
  directory: string;
  payload: { type: string; properties: Record<string, unknown> };
};

/** Event types the Claude translator emits. */
export type ClaudeEventType =
  | 'server.connected'
  | 'server.heartbeat'
  | 'session.created'
  | 'session.updated'
  | 'session.status'
  | 'message.updated'
  | 'message.part.updated'
  | 'permission.asked';

/** Claude session in OpenCode `SessionInfo` shape. */
export type ClaudeSessionInfo = {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  time: { created: number; updated: number };
};

export type ClaudeProjectInfo = {
  id: string;
  directory: string;
  name: string;
  sessionCount: number;
};

export type ClaudeMessagesResponse = {
  messages: unknown[];
  parts: unknown[];
};

export type ClaudeCreateSessionResponse = {
  sessionID: string;
  session: ClaudeSessionInfo;
};
