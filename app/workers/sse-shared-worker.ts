import type { TabToWorkerMessage, WorkerToTabMessage } from '../types/sse-worker';
import { createNotificationManager } from '../utils/notificationManager';
import {
  getCurrentProject,
  getSessionStatusMap,
  getVcsInfo,
  listProjects,
  listSessions,
  setAuthorization,
  setBaseUrl,
} from '../utils/opencode';
import { createSessionKey, parseSessionKey } from '../utils/sessionKey';
import { createSseConnection, type SseConnection } from '../utils/sseConnection';
import { createStateBuilder } from '../utils/stateBuilder';

type SharedWorkerSelf = {
  onconnect: ((event: MessageEvent) => void) | null;
};

declare const self: SharedWorkerSelf;

type ConnectionState = {
  key: string;
  baseUrl: string;
  authorization?: string;
  ports: Set<MessagePort>;
  client: SseConnection;
  connected: boolean;
  stateBuilder: ReturnType<typeof createStateBuilder>;
  notificationManager: ReturnType<typeof createNotificationManager>;
  bootstrapPromise?: Promise<void>;
  activeSelection: {
    port: MessagePort;
    key: string;
  } | null;
};

const connections = new Map<string, ConnectionState>();
const portToKey = new Map<MessagePort, string>();
let opencodeQueue: Promise<void> = Promise.resolve();

function toKey(baseUrl: string, authorization?: string) {
  return `${baseUrl.replace(/\/+$/, '')}\u0000${authorization ?? ''}`;
}

function send(port: MessagePort, message: WorkerToTabMessage) {
  port.postMessage(message);
}

function broadcast(state: ConnectionState, message: WorkerToTabMessage) {
  for (const port of state.ports) {
    send(port, message);
  }
}

function normalizeDirectory(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/\/+$/, '');
  return normalized || '/';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function asObjectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function asStatusMap(value: unknown): Record<string, { type?: string }> {
  const record = asRecord(value);
  if (!record) return {};
  return record as Record<string, { type?: string }>;
}

function getPacketPayload(packet: { payload?: unknown }) {
  return asRecord(packet.payload);
}

function getPacketInfo(payload: Record<string, unknown>) {
  const properties = asRecord(payload.properties);
  const infoFromProperties = properties ? asRecord(properties.info) : null;
  const directInfo = asRecord(payload.info);
  return infoFromProperties ?? directInfo;
}

function getRequestInfo(info: Record<string, unknown>) {
  return {
    requestId: asString(info.requestID) ?? '',
    sessionId: asString(info.sessionID) ?? '',
  };
}

function queueOpencodeTask<T>(state: ConnectionState, task: () => Promise<T>): Promise<T> {
  const run = opencodeQueue.then(async () => {
    setBaseUrl(state.baseUrl);
    setAuthorization(state.authorization);
    return task();
  });
  opencodeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function emitProjectUpdated(state: ConnectionState, projectId: string | null) {
  if (!projectId) return;
  const project = state.stateBuilder.getProject(projectId);
  if (!project) return;
  broadcast(state, {
    type: 'state.project-updated',
    projectId,
    project,
  });
}

function emitNotificationsUpdated(state: ConnectionState) {
  broadcast(state, {
    type: 'state.notifications-updated',
    notifications: state.notificationManager.getState(),
  });
}

function shouldSuppressIdleNotification(
  state: ConnectionState,
  projectId: string,
  rootSessionId: string,
) {
  if (!projectId || !rootSessionId) return false;
  const activeSelection = state.activeSelection;
  if (!activeSelection) return false;
  const parsed = parseSessionKey(activeSelection.key);
  if (!parsed) return false;
  if (parsed.projectId !== projectId) return false;
  const activeRootSessionId = state.stateBuilder.resolveRootSessionIdForProject(
    projectId,
    parsed.sessionId,
  );
  return activeRootSessionId === rootSessionId;
}

function emitNotificationShow(
  state: ConnectionState,
  key: string,
  kind: 'permission' | 'question' | 'idle',
) {
  if (!key) return;
  broadcast(state, {
    type: 'notification.show',
    key,
    kind,
  });
}

async function resolveUnknownSessionDirectory(
  state: ConnectionState,
  info: Record<string, unknown>,
) {
  const directory = normalizeDirectory(asString(info.directory) ?? '');
  if (!directory) return;

  const projectInfo = await queueOpencodeTask(state, async () => {
    const raw = await getCurrentProject(directory);
    return asRecord(raw);
  }).catch(() => null);
  if (!projectInfo) return;

  const worktree = normalizeDirectory(asString(projectInfo.worktree) ?? '');
  if (!worktree) return;

  const knownProjectId = state.stateBuilder.resolveProjectIdForDirectory(worktree);
  if (knownProjectId) {
    const changedProjectId = state.stateBuilder.registerSandboxDirectory(knownProjectId, directory);
    emitProjectUpdated(state, changedProjectId);
    const changedSessionProjectId = state.stateBuilder.applySessionMutated(
      info as Parameters<typeof state.stateBuilder.applySessionMutated>[0],
    );
    emitProjectUpdated(state, changedSessionProjectId);
    return;
  }

  if (directory !== worktree) {
    return;
  }

  const changedProjectId = state.stateBuilder.processProjectUpdated(
    projectInfo as Parameters<typeof state.stateBuilder.processProjectUpdated>[0],
  );
  emitProjectUpdated(state, changedProjectId);

  const changedSessionProjectId = state.stateBuilder.applySessionMutated(
    info as Parameters<typeof state.stateBuilder.applySessionMutated>[0],
  );
  emitProjectUpdated(state, changedSessionProjectId);
}

function handleStatePacket(
  state: ConnectionState,
  packet: { directory?: unknown; payload?: unknown },
) {
  const payload = getPacketPayload(packet);
  if (!payload) return;
  const packetType = asString(payload.type);
  if (!packetType) return;

  const packetDirectory = normalizeDirectory(asString(packet.directory) ?? '');
  const properties = asRecord(payload.properties);
  const info = getPacketInfo(payload);
  let projectId: string | null = null;
  let notificationsChanged = false;

  if (packetType === 'session.created' && info) {
    projectId = state.stateBuilder.processSessionCreated(
      info as unknown as Parameters<typeof state.stateBuilder.processSessionCreated>[0],
    );
    if (!projectId) {
      void resolveUnknownSessionDirectory(state, info);
    }
  }

  if (packetType === 'session.updated' && info) {
    projectId = state.stateBuilder.processSessionUpdated(
      info as unknown as Parameters<typeof state.stateBuilder.processSessionUpdated>[0],
    );
    if (!projectId) {
      void resolveUnknownSessionDirectory(state, info);
    }
  }

  if (packetType === 'session.deleted' && info) {
    const sessionId = asString(info.id) ?? '';
    const deletedDirectory = normalizeDirectory(asString(info.directory) ?? '');
    const deletedProjectId = state.stateBuilder.resolveProjectIdForDirectory(deletedDirectory);
    projectId = state.stateBuilder.processSessionDeleted(sessionId, deletedProjectId);
    if (deletedProjectId && sessionId) {
      const cleared = state.notificationManager.clearSession(deletedProjectId, sessionId);
      notificationsChanged = cleared || notificationsChanged;
    }
  }

  if (packetType === 'session.status' && properties) {
    const sessionId = asString(properties.sessionID) ?? '';
    const status = asString(asRecord(properties.status)?.type) ?? '';
    const statusProjectId = state.stateBuilder.resolveProjectIdForDirectory(packetDirectory);
    if (statusProjectId) {
      projectId = state.stateBuilder.processSessionStatus(sessionId, status, statusProjectId);
      const rootSessionId = state.stateBuilder.resolveRootSessionIdForProject(
        statusProjectId,
        sessionId,
      );
      if (rootSessionId) {
        const idleRequestId = `idle:${statusProjectId}:${rootSessionId}`;
        const treeIdle = state.stateBuilder.isSessionTreeIdle(statusProjectId, rootSessionId);

        if (!treeIdle) {
          notificationsChanged =
            state.notificationManager.removeNotification(idleRequestId) || notificationsChanged;
        } else if (!shouldSuppressIdleNotification(state, statusProjectId, rootSessionId)) {
          const added = state.notificationManager.addNotification(
            statusProjectId,
            rootSessionId,
            idleRequestId,
          );
          notificationsChanged = added || notificationsChanged;
          if (added) {
            emitNotificationShow(state, createSessionKey(statusProjectId, rootSessionId), 'idle');
          }
        }
      }
    }
  }

  if (packetType === 'project.updated' && info) {
    projectId = state.stateBuilder.processProjectUpdated(
      info as Parameters<typeof state.stateBuilder.processProjectUpdated>[0],
    );
  }

  if (packetType === 'vcs.branch.updated' && properties) {
    const directory = packetDirectory;
    const branch = asString(properties.branch) ?? '';
    projectId = state.stateBuilder.processVcsBranchUpdated(directory, branch);
  }

  if ((packetType === 'permission.asked' || packetType === 'question.asked') && info) {
    const request = getRequestInfo(info);
    const requestProjectId = state.stateBuilder.resolveProjectIdForDirectory(packetDirectory);
    if (requestProjectId && request.sessionId && request.requestId) {
      const added = state.notificationManager.addNotification(
        requestProjectId,
        request.sessionId,
        request.requestId,
      );
      notificationsChanged = added || notificationsChanged;
      if (added) {
        emitNotificationShow(
          state,
          createSessionKey(requestProjectId, request.sessionId),
          packetType === 'permission.asked' ? 'permission' : 'question',
        );
      }
    }
  }

  if (
    (packetType === 'permission.replied' ||
      packetType === 'question.replied' ||
      packetType === 'question.rejected') &&
    info
  ) {
    const request = getRequestInfo(info);
    notificationsChanged =
      state.notificationManager.removeNotification(request.requestId) || notificationsChanged;
  }

  if (packetType === 'worktree.ready') {
    const readyDirectory = packetDirectory;
    const readyBranch = asString(properties?.branch) ?? asString(info?.branch) ?? '';
    projectId =
      state.stateBuilder.processVcsBranchUpdated(readyDirectory, readyBranch) || projectId;
  }

  emitProjectUpdated(state, projectId);
  if (notificationsChanged) {
    emitNotificationsUpdated(state);
  }
}

async function bootstrapState(state: ConnectionState): Promise<void> {
  if (state.bootstrapPromise) {
    return state.bootstrapPromise;
  }

  const builder = createStateBuilder();
  const run = queueOpencodeTask(state, async () => {
    const projects = asObjectArray<Record<string, unknown>>(await listProjects());

    const worktreeSet = new Set<string>();
    const sandboxSet = new Set<string>();
    projects.forEach((project) => {
      const worktree = normalizeDirectory(asString(project.worktree) ?? '');
      if (worktree) {
        worktreeSet.add(worktree);
      }
      asStringArray(project.sandboxes).forEach((entry) => {
        const normalized = normalizeDirectory(entry);
        if (!normalized) return;
        sandboxSet.add(normalized);
      });
    });

    const worktreeToProjectId = new Map<string, string>();

    const syncDirectoryState = async (directory: string, projectId: string) => {
      const [sessions, statuses] = await Promise.all([
        listSessions({ directory, roots: true }),
        getSessionStatusMap(directory),
      ]);
      builder.applySessions(asObjectArray(sessions) as Parameters<typeof builder.applySessions>[0]);
      builder.applyStatuses(asStatusMap(statuses), projectId);
    };

    const fetchCurrentProject = async (directory: string) => {
      const raw = await getCurrentProject(directory);
      const project = asRecord(raw);
      if (!project) return null;
      const projectId = asString(project.id)?.trim() ?? '';
      const worktree = normalizeDirectory(asString(project.worktree) ?? '');
      if (!projectId || !worktree) return null;
      return {
        project,
        projectId,
        worktree,
      };
    };

    await Promise.all(
      Array.from(worktreeSet).map(async (directory) => {
        const current = await fetchCurrentProject(directory).catch(() => null);
        if (!current) return;

        builder.processProjectUpdated(
          current.project as Parameters<typeof builder.processProjectUpdated>[0],
        );
        worktreeToProjectId.set(current.worktree, current.projectId);

        await syncDirectoryState(directory, current.projectId);
      }),
    );

    await Promise.all(
      Array.from(sandboxSet).map(async (directory) => {
        const current = await fetchCurrentProject(directory).catch(() => null);
        if (!current) return;

        const parentProjectId = worktreeToProjectId.get(current.worktree);
        if (!parentProjectId) {
          return;
        }

        builder.registerSandboxDirectory(parentProjectId, directory);
        await syncDirectoryState(directory, parentProjectId);
      }),
    );

    const allDirectories = new Set([...worktreeSet, ...sandboxSet]);
    await Promise.all(
      Array.from(allDirectories).map(async (directory) => {
        const raw = await getVcsInfo(directory).catch(() => null);
        const vcsInfo = asRecord(raw);
        if (!vcsInfo) return;
        const branch = asString(vcsInfo.branch);
        if (!branch) return;
        builder.applyVcsInfo(directory, { branch });
      }),
    );

    builder.getDefaultProjectId();
    state.stateBuilder = builder;

    broadcast(state, {
      type: 'state.bootstrap',
      projects: state.stateBuilder.getState().projects,
      notifications: state.notificationManager.getState(),
    });
  });

  const bootstrapPromise = run.finally(() => {
    if (state.bootstrapPromise === bootstrapPromise) {
      state.bootstrapPromise = undefined;
    }
  });
  state.bootstrapPromise = bootstrapPromise;
  return bootstrapPromise;
}

function cleanupIfUnused(state: ConnectionState) {
  if (state.ports.size > 0) return;
  state.client.disconnect();
  connections.delete(state.key);
}

function detachPort(port: MessagePort) {
  const key = portToKey.get(port);
  if (!key) return;
  portToKey.delete(port);
  const state = connections.get(key);
  if (!state) return;
  if (state.activeSelection?.port === port) {
    state.activeSelection = null;
  }
  state.ports.delete(port);
  cleanupIfUnused(state);
}

function createConnectionState(baseUrl: string, authorization?: string) {
  const key = toKey(baseUrl, authorization);
  let state: ConnectionState;
  state = {
    key,
    baseUrl,
    authorization,
    ports: new Set<MessagePort>(),
    connected: false,
    stateBuilder: createStateBuilder(),
    notificationManager: createNotificationManager((projectId, sessionId) => ({
      projectId,
      sessionId: state.stateBuilder.resolveRootSessionIdForProject(projectId, sessionId),
    })),
    activeSelection: null,
    client: createSseConnection({
      onPacket(packet) {
        broadcast(state, { type: 'packet', packet });
        handleStatePacket(state, packet);
      },
      onOpen(isReconnect) {
        state.connected = true;
        broadcast(state, { type: 'connection.open' });
        if (isReconnect) {
          broadcast(state, { type: 'connection.reconnected' });
        }
        void bootstrapState(state).catch((error) => {
          const message =
            error instanceof Error ? error.message : 'Failed to bootstrap worker state.';
          broadcast(state, { type: 'connection.error', message });
        });
      },
      onError(message, statusCode) {
        state.connected = false;
        broadcast(state, { type: 'connection.error', message, statusCode });
      },
    }),
  };
  state.client.connect({ baseUrl, authorization });
  return state;
}

function attachPort(port: MessagePort, baseUrl: string, authorization?: string) {
  detachPort(port);
  const key = toKey(baseUrl, authorization);
  const existing = connections.get(key);
  const state = existing ?? createConnectionState(baseUrl, authorization);
  if (!existing) {
    connections.set(key, state);
  }

  state.ports.add(port);
  portToKey.set(port, key);

  if (state.connected) {
    send(port, { type: 'connection.open' });
    if (!state.bootstrapPromise) {
      send(port, {
        type: 'state.bootstrap',
        projects: state.stateBuilder.getState().projects,
        notifications: state.notificationManager.getState(),
      });
    }
  }
}

function handleMessage(port: MessagePort, event: MessageEvent<TabToWorkerMessage>) {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'connect') {
    if (!message.baseUrl) {
      send(port, { type: 'connection.error', message: 'SSE base URL is empty.' });
      return;
    }
    attachPort(port, message.baseUrl, message.authorization);
    return;
  }

  if (message.type === 'disconnect') {
    detachPort(port);
    return;
  }

  const key = portToKey.get(port);
  if (!key) return;
  const state = connections.get(key);
  if (!state) return;

  if (message.type === 'session.mutated') {
    const projectId = state.stateBuilder.applySessionMutated(message.info);
    emitProjectUpdated(state, projectId);
    return;
  }

  if (message.type === 'session.removed') {
    const projectId = state.stateBuilder.applySessionRemoved(message.sessionId, message.projectId);
    emitProjectUpdated(state, projectId);
    return;
  }

  if (message.type === 'project.mutated') {
    const projectId = state.stateBuilder.processProjectUpdated(message.info);
    emitProjectUpdated(state, projectId);
    return;
  }

  if (message.type === 'selection.active') {
    const parsed = parseSessionKey(message.key);
    if (!parsed) {
      if (state.activeSelection?.port === port) {
        state.activeSelection = null;
      }
      return;
    }
    state.activeSelection = {
      port,
      key: message.key,
    };

    const rootSessionId = state.stateBuilder.resolveRootSessionIdForProject(
      parsed.projectId,
      parsed.sessionId,
    );
    const idleRequestId = `idle:${parsed.projectId}:${rootSessionId || parsed.sessionId}`;
    const cleared = state.notificationManager.removeNotification(idleRequestId);
    if (cleared) {
      emitNotificationsUpdated(state);
    }
  }
}

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  if (!port) return;
  port.onmessage = (messageEvent) => {
    handleMessage(port, messageEvent as MessageEvent<TabToWorkerMessage>);
  };
  port.start();
};
