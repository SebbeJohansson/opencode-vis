<template>
  <div ref="appEl" class="app">
    <template v-if="uiInitState === 'ready'">
      <header class="app-header">
        <TopPanel
          ref="topPanelRef"
          :tree-data="topPanelTreeData"
          :notification-sessions="notificationSessions"
          :project-directory="projectDirectory"
          :active-directory="activeDirectory"
          :selected-session-id="selectedSessionId"
          :home-path="homePath"
          :claude-enabled="claudeEnabled"
          @select-notification="handleNotificationSessionSelect"
          @create-worktree-from="createWorktreeFromWorktree"
          @new-session="createNewSession"
          @new-claude-session="() => createClaudeSession()"
          @new-session-in="handleNewSessionInSandbox"
          @new-claude-session-in="(p: { directory: string }) => createClaudeSession(p.directory)"
          @open-shell="openShellFromInput('')"
          @delete-active-directory="deleteWorktree"
          @delete-session="deleteSession"
          @archive-session="archiveSession"
          @archive-project="archiveProject"
          @delete-project="deleteProject"
          @select-session="handleTopPanelSessionSelect"
          @open-directory="openProjectPicker"
          @edit-project="handleEditProject"
          @open-settings="isSettingsOpen = true"
          @logout="handleLogout"
          @dropdown-closed="focusInput"
        />
      </header>
      <div
        :ref="bindAppBodyEl"
        class="app-body"
        :class="{ 'todo-collapsed': sidePanelCollapsed, 'mobile-drawer-open': mobileDrawerOpen }"
        :style="
          sidePanelWidth !== null
            ? ({ '--todo-panel-width': `${sidePanelWidth}px` } as any)
            : undefined
        "
      >
        <!-- Mobile drawer backdrop -->
        <Transition name="mobile-backdrop">
          <div
            v-if="isMobile && mobileDrawerOpen"
            class="mobile-drawer-backdrop"
            @click="closeMobileDrawer"
          />
        </Transition>
        <div :ref="bindSidePanelAreaEl" class="side-panel-area">
          <SidePanel
            class="todo-panel"
            :class="{ 'is-disabled': !hasSession }"
            :collapsed="sidePanelCollapsed"
            :active-tab="sidePanelActiveTab"
            :todo-sessions="todoPanelSessions"
            :tree-nodes="treeNodes"
            :expanded-tree-paths="expandedTreePaths"
            :selected-tree-path="selectedTreePath"
            :tree-loading="treeLoading"
            :tree-error="treeError"
            :tree-status-by-path="gitStatusByPath"
            :tree-branch-info="gitStatus?.branch"
            :tree-diff-stats="gitStatus?.diffStats"
            :tree-directory-name="treeDirectoryName"
            :tree-branch-entries="branchEntries"
            :tree-branch-list-loading="branchListLoading"
            :run-shell-command="runTreeShellCommand"
            @toggle-collapse="isMobile ? closeMobileDrawer() : toggleSidePanelCollapsed()"
            @change-tab="setSidePanelTab"
            @toggle-dir="toggleTreeDirectory"
            @select-file="selectTreeFile"
            @open-diff="openGitDiff"
            @open-diff-all="
              (payload: { mode: WorktreeSnapshotMode }) => openAllGitDiff(payload.mode)
            "
            @open-file="openFileViewer"
            @reload="reloadTree().then(() => refreshGitStatus())"
          />
          <div
            v-if="!sidePanelCollapsed"
            class="side-resizer"
            @pointerdown="startSidePanelResize"
          ></div>
        </div>
        <div class="app-main-column">
          <nav class="main-tabs" aria-label="Session view">
            <button
              v-for="tab in mainTabs"
              :key="tab.id"
              type="button"
              class="main-tab"
              :class="{ 'is-active': mainTab === tab.id }"
              :aria-current="mainTab === tab.id ? 'page' : undefined"
              @click="setMainTab(tab.id)"
            >
              <Icon :name="tab.icon" :size="13" />
              {{ tab.label }}
            </button>
          </nav>
          <main :ref="bindOutputEl" class="app-output">
            <div class="output-workspace">
              <div class="tool-window-layer">
                <div v-show="mainTab === 'trajectory'" class="output-split">
                  <TrajectoryPanel
                    class="output-panel"
                    :session-id="selectedSessionId"
                    :active="mainTab === 'trajectory'"
                  />
                </div>
                <div v-show="mainTab === 'chat'" class="output-split">
                  <OutputPanel
                    ref="outputPanelRef"
                    :key="selectedSessionId"
                    class="output-panel"
                    :project-name="currentProjectName"
                    :project-color="currentProjectColor"
                    :is-following="isFollowing"
                    :status-text="statusText"
                    :is-status-error="isStatusError"
                    :is-thinking="isThinking"
                    :is-retry-status="!!retryStatus"
                    :busy-descendant-count="busyDescendantSessionIds.length"
                    :theme="shikiTheme"
                    :resolve-agent-color="resolveAgentColorForName"
                    :resolve-model-meta="resolveModelMetaForPath"
                    :compute-context-percent="computeContextPercent"
                    :session-revert="sessionRevert"
                    :resolve-pending-permission="resolvePendingPermissionForRoot"
                    @message-rendered="handleOutputPanelMessageRendered"
                    @open-permissions="openToolPermissions"
                    @permission-reply="handlePermissionReply"
                    @resume-follow="handleOutputPanelResumeFollow"
                    @fork-message="handleForkMessage"
                    @revert-message="handleRevertMessage"
                    @undo-revert="handleUndoRevert"
                    @show-message-diff="handleShowMessageDiff"
                    @show-commit="handleShowCommit"
                    @show-thread-history="handleShowThreadHistory"
                    @edit-message="handleEditMessage"
                    @open-image="fileViewers.openImage"
                    @open-file="openFileViewer"
                    @content-resized="handleOutputPanelContentResized"
                    @initial-render-complete="handleOutputPanelInitialRenderComplete"
                  />
                </div>
              </div>
            </div>
          </main>
          <footer
            :ref="bindInputEl"
            class="app-input"
            :class="{ 'is-disabled': !hasSession }"
            :style="inputHeight !== null ? { height: `${inputHeight}px` } : undefined"
          >
            <div class="input-resizer" @pointerdown="startInputResize"></div>
            <InputPanel
              ref="inputPanelRef"
              :disabled="connectionState !== 'ready'"
              :can-send="canSend"
              :agent-options="agentOptions"
              :has-agent-options="hasAgentOptions"
              :agent-color="currentAgentColor"
              :resolve-agent-color="resolveAgentColorForName"
              :model-options="modelOptions"
              :all-model-options="allModelOptions"
              :thinking-options="thinkingOptions"
              :has-model-options="hasModelOptions"
              :has-thinking-options="hasThinkingOptions"
              :can-attach="canAttach"
              :is-thinking="isThinking"
              :can-abort="canAbort"
              :commands="commandOptions"
              :attachments="attachments"
              :message-input="messageInput"
              :is-claude-session="isClaudeSession"
              :selected-mode="selectedMode"
              :selected-model="selectedModel"
              :selected-thinking="selectedThinking"
              @update:message-input="handleMessageInputUpdate"
              @update:selected-mode="handleSelectedModeUpdate"
              @update:selected-model="handleSelectedModelUpdate"
              @update:selected-thinking="handleSelectedThinkingUpdate"
              @apply-history-entry="handleApplyHistoryEntry"
              @send="sendMessage"
              @abort="abortSession"
              @add-attachments="handleAddAttachments"
              @remove-attachment="removeAttachment"
              @open-image="fileViewers.openImage"
              @open-manage-models="isHiddenModelsOpen = true"
              :pending-permission-count="pendingPermissionCount"
              :models-error="providersError"
              :agents-error="agentsError"
              @open-permissions="openToolPermissions"
              @reload-models="fetchProviders(true)"
              @reload-agents="fetchAgents()"
            />
          </footer>
        </div>
        <div :ref="bindCanvasEl" class="tool-window-canvas">
          <TransitionGroup appear name="scale">
            <FloatingWindow
              v-for="entry in fw.entries.value"
              :key="entry.key"
              :entry="entry"
              :manager="fw"
              @focus="fw.bringToFront(entry.key)"
              @close="handleFloatingWindowClose(entry.key)"
            />
          </TransitionGroup>
        </div>
        <!-- Mobile bottom bar -->
        <div v-if="isMobile" class="mobile-bottom-bar">
          <button
            type="button"
            class="mobile-bottom-btn"
            :class="{ active: mobileDrawerOpen }"
            :title="mobileDrawerOpen ? 'Close panel' : 'Open panel'"
            @click="mobileDrawerOpen ? closeMobileDrawer() : openMobileDrawer()"
          >
            <Icon
              :name="mobileDrawerOpen ? 'lucide:panel-left-close' : 'lucide:panel-left-open'"
              :size="20"
            />
          </button>
          <div class="mobile-bottom-spacer" />
          <button
            type="button"
            class="mobile-bottom-btn"
            title="Settings"
            @click="isSettingsOpen = true"
          >
            <Icon name="lucide:settings" :size="20" />
          </button>
        </div>
      </div>
    </template>
    <div v-else class="app-loading-view" role="status" aria-live="polite">
      <div class="app-loading-card">
        <div class="absolute w-0 h-0 -z-10 flex items-center justify-center">
          <div class="flex fixed flex-col items-center w-96 h-40 translate-x-1/2 -translate-y-1/2">
            <div class="mb-4">
              <svg
                width="24mm"
                height="12mm"
                version="1.1"
                viewBox="0 0 24 12"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="m12.342 2.4512v3.328l1.3352 1.3352v3.9658l-0.67757 0.67756h-1.2953l-0.67757-0.67756v-8.629zm0-1.0562h-1.3153l-0.23914-0.23914v-0.91671l0.23914-0.23914h1.3153l0.23914 0.23914v0.91671zm10.602 9.6852-0.67756 0.67756h-6.6162l-0.67756-0.67756v-1.9928h1.3352v1.3352h2.6305v-2.6505h-3.2882l-0.67756-0.67756v-3.9658l0.67756-0.67757h6.6162l0.67756 0.67757v1.9729h-1.3153v-1.3153h-3.9857v2.6505h4.6234l0.67756 0.67757z"
                  fill="#ffffff"
                />
                <path
                  d="m1 0 5.4506 6-5.4506 6h3.6337l4.851-5.34v-1.32l-4.851-5.34z"
                  fill="#60a5fa"
                />
              </svg>
            </div>
            <div class="text-text-100 rounded-xl bg-surface-900 py-2 px-4">
              <span class="text-accent-400">openui - OpenCode Visualizer</span>
            </div>
          </div>
        </div>
        <div v-if="uiInitState === 'login'" class="app-login-form">
          <p class="app-loading-title">Connect to OpenCode Server</p>
          <div class="app-login-fields">
            <input
              v-model="loginUsername"
              type="text"
              class="app-login-input"
              placeholder="Username"
              name="username"
              :disabled="!loginRequiresAuth"
              @keydown.enter="handleLogin"
            />
            <input
              v-model="loginPassword"
              type="password"
              class="app-login-input"
              placeholder="Password"
              :disabled="!loginRequiresAuth"
              @keydown.enter="handleLogin"
            />
            <label class="app-login-checkbox">
              <input v-model="loginRequiresAuth" type="checkbox" />
              The server requires authentication
            </label>
            <input
              v-model="loginUrl"
              type="text"
              class="app-login-input"
              placeholder="http://localhost:4096"
              name="url"
              @keydown.enter="handleLogin"
            />
          </div>
          <p v-if="initErrorMessage" class="app-loading-message app-error-message">
            {{ initErrorMessage }}
          </p>
          <button type="button" class="app-loading-retry bg-indigo-500!" @click="handleLogin">
            Connect
          </button>

          <Welcome :theme="shikiTheme" class="mt-8" />
        </div>
        <div v-else>
          <div class="app-loading-spinner" aria-hidden="true"></div>
          <p class="app-loading-title">Loading session data...</p>
          <p class="app-loading-message">
            {{ uiInitState === 'error' ? initErrorMessage : initLoadingMessage }}
          </p>
          <div class="app-loading-actions">
            <button
              v-if="uiInitState === 'error'"
              type="button"
              class="app-loading-retry"
              @click="startInitialization"
            >
              Retry
            </button>
            <button
              v-if="uiInitState === 'loading' && connectionState === 'connecting'"
              type="button"
              class="app-loading-retry app-loading-abort"
              @click="handleAbortInit"
            >
              Abort
            </button>
          </div>
        </div>
      </div>
    </div>
    <ProjectPicker
      :open="isProjectPickerOpen"
      :home-path="homePath"
      :worktree-path="serverWorktreePath"
      @close="isProjectPickerOpen = false"
      @select="handleProjectDirectorySelect"
    />
    <SettingsModal :open="isSettingsOpen" @close="isSettingsOpen = false" />
    <HiddenModelsModal
      :open="isHiddenModelsOpen"
      :all-model-options="allModelOptions"
      @close="isHiddenModelsOpen = false"
    />
    <PeonPingPlayer />
    <ProjectSettingsDialog
      :open="!!editingProject"
      :project-id="editingProject?.projectId ?? ''"
      :worktree="editingProject?.worktree ?? ''"
      :name="editingProjectMeta?.name"
      :icon-color="editingProjectMeta?.icon?.color"
      :icon-override="editingProjectMeta?.icon?.override"
      :commands-start="editingProjectMeta?.commands?.start"
      @close="editingProject = null"
      @save="handleSaveProject"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import InputPanel from './components/InputPanel.vue';
import OutputPanel from './components/OutputPanel.vue';
import TrajectoryPanel from './components/Trajectory/TrajectoryPanel.vue';
import ProjectPicker from './components/ProjectPicker.vue';
import FloatingWindow from './components/FloatingWindow.vue';
import SidePanel from './components/SidePanel.vue';
import Welcome from './components/Welcome.vue';
import TopPanel from './components/TopPanel.vue';
import SettingsModal from './components/SettingsModal.vue';
import ProjectSettingsDialog from './components/ProjectSettingsDialog.vue';
import HiddenModelsModal from './components/HiddenModelsModal.vue';
import PeonPingPlayer from './components/PeonPingPlayer.vue';
import { useAutoScroller, type ScrollMode } from './composables/useAutoScroller';
import { useFileTree } from './composables/useFileTree';
import { useTodos, type TodoSessionView } from './composables/useTodos';
import { useHiddenModels } from './composables/useHiddenModels';
import { useAgentModelMemory } from './composables/useAgentModelMemory';
import type { MessagePart, SsePacket } from './types/sse';
import { createStateBuilder } from './utils/stateBuilder';
import * as opencodeApi from './utils/opencode';
import { normalizeDirectory } from './utils/path';
import { asObjectArray, asRecord, asString, asStringArray, toErrorMessage } from './utils/strings';
import type { PtyInfo } from './utils/pty';
import { useAppContext } from './composables/useAppContext';
import { useModals } from './composables/useModals';
import { useAttachments } from './composables/useAttachments';
import { useShellLayout } from './composables/useShellLayout';
import { useSelectionRouting } from './composables/useSelectionRouting';
import { useServerConfig } from './composables/useServerConfig';
import { useFloatingCanvas } from './composables/useFloatingCanvas';
import { useBrowserNotifications } from './composables/useBrowserNotifications';
import { useFileViewers } from './composables/useFileViewers';
import { useGitSnapshots } from './composables/useGitSnapshots';
import { useToolWindows } from './composables/useToolWindows';
import { useTerminalWindows } from './composables/useTerminalWindows';
import { useDebugCommands } from './composables/useDebugCommands';
import { useClaudeIntegration } from './composables/useClaudeIntegration';
import { useConnectionState } from './composables/useConnectionState';
import { usePermissionRouting } from './composables/usePermissionRouting';
import { useSessionCatalog } from './composables/useSessionCatalog';
import { parseProviderModelKey, useProviderCatalog } from './composables/useProviderCatalog';
import type { SessionEntry as SessionInfo, WorktreeInfo } from './types/session';
import type { CommandInfo } from './types/provider';
import type { Attachment } from './types/composer';
import { isClaudeSessionId } from '#shared/utils/claude-ids';
import {
  StorageKeys,
  storageGet,
  storageKey,
  storageRemove,
  storageSet,
  storageSetJSON,
} from './utils/storageKeys';

const ctx = useAppContext();
const {
  credentials,
  isMobile,
  fw,
  serverState,
  openCodeApi,
  selection: sessionSelection,
  ge,
  sessionScope,
  mainSessionScope,
  msg,
  reasoning,
  subagentWindows,
  homePath,
  serverWorktreePath,
  sendStatus,
  sessionError,
  projectError,
  worktreeError,
} = ctx;
const { suppressAutoWindows, rememberModelPerAgent } = ctx.settings;
const layout = useShellLayout();
const {
  mobileDrawerOpen,
  openMobileDrawer,
  closeMobileDrawer,
  sidePanelCollapsed,
  sidePanelActiveTab,
  mainTab,
  mainTabs,
  setMainTab,
  toggleSidePanelCollapsed,
  setSidePanelTab,
  bindOutputEl,
  bindInputEl,
  bindAppBodyEl,
  bindSidePanelAreaEl,
  inputHeight,
  sidePanelWidth,
  startInputResize,
  startSidePanelResize,
} = layout;
const {
  isProjectPickerOpen,
  editingProject,
  editingProjectMeta,
  isSettingsOpen,
  isHiddenModelsOpen,
} = useModals();
const attachmentsFeature = useAttachments();
const { attachments } = attachmentsFeature;
const { initialSelection: initialQuery } = useSelectionRouting();
const serverConfig = useServerConfig();
const { claudeEnabled } = serverConfig;
const canvas = useFloatingCanvas();
const { bindCanvasEl, handleWindowResize, syncFloatingExtent } = canvas;
const fileViewers = useFileViewers();
const { shikiTheme, openFileViewer } = fileViewers;
const gitSnapshots = useGitSnapshots();
const {
  openGitDiff,
  openAllGitDiff,
  showMessageDiff: handleShowMessageDiff,
  showCommit: handleShowCommit,
} = gitSnapshots;
const toolWindows = useToolWindows();
const {
  runningToolIds,
  openToolPartAsWindow,
  showThreadHistory: handleShowThreadHistory,
  editMessage: handleEditMessage,
} = toolWindows;
const terminals = useTerminalWindows();
const {
  scheduleShellFitAll,
  disposeShellWindows,
  restoreShellSessions,
  openShellFromInput,
  runTreeShellCommand,
  handlePtyEvent,
} = terminals;
const {
  uiInitState,
  connectionState,
  initLoadingMessage,
  initErrorMessage,
  reconnectingMessage,
  isBootstrapping,
  ensureConnectionReady,
} = useConnectionState();
const {
  pendingPermissionCount,
  openToolPermissions,
  handlePermissionReply,
  resolvePendingPermissionForRoot,
  fetchPendingPermissions,
  fetchPendingQuestions,
} = usePermissionRouting();
const { runDebugCommand } = useDebugCommands();
const claude = useClaudeIntegration();
const { isClaudeSession, createClaudeSession, sendClaudePrompt, syncClaudeProjects } = claude;
canvas.onWindowResize(() => scheduleShellFitAll());

/** Shell windows need their PTY killed; everything else just closes. */
function handleFloatingWindowClose(key: string) {
  if (terminals.onWindowClosed(key)) return;
  void fw.close(key);
}
const notifications = useBrowserNotifications();
const {
  notificationSessionOrder,
  notificationSessions,
  syncActiveSelectionToWorker,
  ensureBrowserNotificationPermission,
  selectNextNotificationSession: handleNotificationSessionSelect,
} = notifications;
const FOLLOW_THRESHOLD_PX = 24;

type ComposerDraft = {
  messageInput: string;
  attachments: Attachment[];
  agent: string;
  model: string;
  variant?: string;
  updatedAt: number;
  rev: number;
  writerTabId: string;
};

// Close auto-opened floating windows when suppress is toggled ON.
// Tool auto windows: closable === false AND finite expiry (not Infinity).
// Reasoning/subagent windows: closable === false AND key starts with 'reasoning:' or 'subagent:'.
// Permission/question (closable: false, expiry: Infinity) are excluded.
watch(suppressAutoWindows, (suppressed) => {
  if (!suppressed) return;
  for (const entry of fw.entries.value) {
    if (
      !entry.closable &&
      (entry.expiresAt < Number.MAX_SAFE_INTEGER ||
        entry.key.startsWith('reasoning:') ||
        entry.key.startsWith('subagent:'))
    ) {
      void fw.close(entry.key);
    }
  }
});

const outputPanelRef = ref<{ panelEl: HTMLDivElement | null } | null>(null);
const topPanelRef = ref<{
  openSessionDropdown: () => void;
  closeSessionDropdown: () => void;
  toggleSessionDropdown: () => void;
} | null>(null);
const inputPanelRef = ref<{ focus: () => void; reset: () => void } | null>(null);
const outputPanelContainerEl = computed(() => outputPanelRef.value?.panelEl ?? undefined);
const outputPanelScrollMode = computed<ScrollMode>(() => 'follow');
const {
  isFollowing,
  pauseTracking: pauseOutputTracking,
  resumeTracking: resumeOutputTracking,
  enableFollow,
  resetFollow,
  resumeFollow,
  scrollToBottom: scrollOutputPanelToBottom,
  notifyContentChange,
} = useAutoScroller(outputPanelContainerEl, outputPanelScrollMode, {
  bottomThresholdPx: FOLLOW_THRESHOLD_PX,
  observeDelayMs: 0,
  smoothEngine: 'native',
  smoothOnInitialFollow: false,
});

layout.onLayoutChange(() => {
  syncFloatingExtent();
  scheduleShellFitAll();
});
// Chat and trajectory share the output area. The chat panel stays mounted while
// hidden so its rendered history survives the switch, but its scroll tracking is
// paused meanwhile: a hidden element reports no scroll height, which would
// otherwise be read as "the user scrolled away from the bottom".
layout.onMainTabChange((value) => {
  if (value === 'chat') {
    const wasFollowing = isFollowing.value;
    nextTick(() => {
      resumeOutputTracking({ syncToBottom: wasFollowing });
      syncFloatingExtent();
    });
    return;
  }
  pauseOutputTracking();
});

function handleOutputPanelInitialRenderComplete() {
  nextTick(() => {
    scrollOutputPanelToBottom(false);
    syncFloatingExtent();
    inputPanelRef.value?.focus();
  });
}

function handleOutputPanelResumeFollow() {
  resumeFollow();
}

function handleOutputPanelMessageRendered() {
  notifyContentChange();
}

function handleOutputPanelContentResized() {
  notifyContentChange();
}

const userMessageMetaById = ref<Record<string, UserMessageMeta>>({});
const userMessageTimeById = ref<Record<string, number>>({});
const globalEventUnsubscribers: Array<() => void> = [];

let primaryHistoryRequestId = 0;
const recentUserInputs: { text: string; time: number }[] = [];
const composerDraftRevisionByContext = new Map<string, number>();
const composerDraftTabId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Restored straight into the trajectory tab: the chat panel starts hidden.
if (mainTab.value === 'trajectory') pauseOutputTracking();

const bootstrapReady = serverState.bootstrapped;
const {
  selectedProjectId,
  selectedSessionId,
  projectDirectory,
  activeDirectory,
  switchSession: switchSessionSelection,
  initialize: initializeSessionSelection,
} = sessionSelection;
const catalog = useSessionCatalog();
const {
  sessionsByProject,
  sessions,
  sessionParentById,
  currentProjectColor,
  currentProjectName,
  filteredSessions,
  topPanelTreeData,
  navigableTree,
  allowedSessionIds,
  treeDirectoryName,
  hasSession,
  retryStatus,
  sessionLabel,
  getSelectedWorktreeDirectory,
  requireSelectedWorktree,
  pickPreferredSessionId,
  validateSelectedSession,
  resolveProjectIdForDirectory,
  getSessionStatus,
  applySessionStatusEvent,
} = catalog;
const providerCatalog = useProviderCatalog();
const {
  commands,
  allModelOptions,
  modelOptions,
  agentOptions,
  thinkingOptions,
  providersError,
  agentsError,
  selectedMode,
  selectedModel,
  selectedThinking,
  hasAgentOptions,
  hasModelOptions,
  hasThinkingOptions,
  canAttach,
  commandOptions,
  currentAgentColor,
  resolveAgentColorForName,
  resolveModelMetaForPath,
  applyModelVariantSelection,
  applyAgentDefaults,
  resolveDefaultAgentModel,
  fetchProviders,
  fetchAgents,
  fetchCommands,
  computeContextPercent,
} = providerCatalog;

const { updateReasoningExpiry } = reasoning;
const { isHidden: isModelHidden } = useHiddenModels();
const { remember: rememberAgentModel, recall: recallAgentModel } = useAgentModelMemory();

const messageInput = ref('');
const isSending = ref(false);
const isAborting = ref(false);
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let initializationInFlight = false;
// Used by the direct transport path (mobile / no SharedWorker) to process
// real-time SSE state events and keep serverState in sync.
let directStateBuilder: ReturnType<typeof createStateBuilder> | null = null;
const loginUrl = ref('http://localhost:4096');
const loginUsername = ref('');
const loginPassword = ref('');
const loginRequiresAuth = ref(false);
const statusText = computed(() => {
  if (connectionState.value === 'reconnecting') {
    return reconnectingMessage.value || 'Reconnecting...';
  }
  if (retryStatus.value) {
    const timeStr = formatRetryTime(retryStatus.value.next);
    return `${retryStatus.value.message} | Next: ${timeStr}`;
  }
  if (openCodeApi.pending.value) {
    return 'Synchronizing with SSE updates...';
  }
  return (
    projectError.value ||
    worktreeError.value ||
    sessionError.value ||
    modelLoadWarning.value ||
    sendStatus.value
  );
});
const isStatusError = computed(() =>
  Boolean(
    projectError.value ||
    worktreeError.value ||
    sessionError.value ||
    modelLoadWarning.value ||
    retryStatus.value,
  ),
);

/** Combined provider/agent load problem, shown in the status bar. */
const modelLoadWarning = computed(() => {
  if (providersError.value) return `Models: ${providersError.value}`;
  if (agentsError.value) return `Agents: ${agentsError.value}`;
  return '';
});

// Navigable session tree: mirrors TopPanel's displayedTree (no-search mode).
// Filters archived sessions, truncates per-sandbox, and drops empty worktrees.
/** Permission rules attached to the currently selected session by the server. */

const {
  todosBySessionId,
  todoLoadingBySessionId,
  todoErrorBySessionId,
  normalizeTodoItems,
  reloadTodosForAllowedSessions,
} = useTodos({ selectedSessionId, allowedSessionIds, activeDirectory });

const {
  treeNodes,
  expandedTreePaths,
  expandedTreePathSet,
  selectedTreePath,
  treeLoading,
  treeError,
  gitStatus,
  gitStatusByPath,
  refreshGitStatus,
  reloadTree,
  toggleTreeDirectory,
  selectTreeFile,
  feed,
  branchEntries,
  branchListLoading,
} = useFileTree({ activeDirectory });

const sessionRevert = computed<SessionInfo['revert'] | null>(() => {
  const projectId = selectedProjectId.value.trim();
  const sessionId = selectedSessionId.value.trim();
  if (!projectId || !sessionId) return null;
  const project = serverState.projects[projectId];
  if (!project) return null;
  for (const sandbox of Object.values(project.sandboxes)) {
    const session = sandbox.sessions[sessionId];
    if (session) return session.revert ?? null;
  }
  return null;
});

const todoPanelSessions = computed(() => {
  const allowed = allowedSessionIds.value;
  if (allowed.size === 0) return [] as TodoSessionView[];
  const list = Array.from(allowed).map((sessionId) => {
    const session = sessions.value.find((item) => item.id === sessionId);
    const title = sessionLabel(session ?? { id: sessionId });
    const isSubagent = Boolean(sessionParentById.value.get(sessionId));
    return {
      sessionId,
      title,
      isSubagent,
      todos: todosBySessionId.value[sessionId] ?? [],
      loading: Boolean(todoLoadingBySessionId.value[sessionId]),
      error: todoErrorBySessionId.value[sessionId],
    };
  });
  const visible = list.filter((entry) => entry.todos.length > 0 || Boolean(entry.error));
  if (visible.length === 0) return [] as TodoSessionView[];
  visible.sort((a, b) => {
    if (a.sessionId === selectedSessionId.value) return -1;
    if (b.sessionId === selectedSessionId.value) return 1;
    if (a.isSubagent !== b.isSubagent) return a.isSubagent ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
  return visible;
});

const canSend = computed(() =>
  Boolean(
    uiInitState.value === 'ready' &&
    connectionState.value === 'ready' &&
    selectedSessionId.value &&
    !isSending.value &&
    (messageInput.value.trim().length > 0 || attachments.value.length > 0),
  ),
);

const busyDescendantSessionIds = computed(() => {
  const allowed = allowedSessionIds.value;
  const selected = selectedSessionId.value;
  const ids: string[] = [];
  for (const sid of allowed) {
    if (sid === selected) continue;
    const status = getSessionStatus(sid);
    if (status === 'busy' || status === 'retry') ids.push(sid);
  }
  return ids;
});

const isThinking = computed(() => {
  const selected = selectedSessionId.value;
  const ownStatus = selected ? getSessionStatus(selected) : undefined;
  return Boolean(
    ownStatus === 'busy' ||
    ownStatus === 'retry' ||
    busyDescendantSessionIds.value.length > 0 ||
    runningToolIds.size > 0,
  );
});
const canAbort = computed(() =>
  Boolean(
    uiInitState.value === 'ready' &&
    connectionState.value === 'ready' &&
    selectedSessionId.value &&
    isThinking.value &&
    !isAborting.value,
  ),
);

function normalizeStoredAttachment(value: unknown): Attachment | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const filename = typeof record.filename === 'string' ? record.filename.trim() : '';
  const mime = typeof record.mime === 'string' ? record.mime.trim() : '';
  const dataUrl = typeof record.dataUrl === 'string' ? record.dataUrl : '';
  if (!id || !filename || !mime || !dataUrl) return null;
  return { id, filename, mime, dataUrl };
}

function normalizeStoredComposerDraft(value: unknown): ComposerDraft | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const messageInput = typeof record.messageInput === 'string' ? record.messageInput : '';
  const attachments = Array.isArray(record.attachments)
    ? record.attachments
        .map((item) => normalizeStoredAttachment(item))
        .filter((item): item is Attachment => Boolean(item))
    : [];
  const agent = typeof record.agent === 'string' ? record.agent : '';
  const model = typeof record.model === 'string' ? record.model : '';
  const variant = typeof record.variant === 'string' ? record.variant : undefined;
  const updatedAt = typeof record.updatedAt === 'number' ? record.updatedAt : Date.now();
  const rev = typeof record.rev === 'number' ? record.rev : updatedAt;
  const writerTabId = typeof record.writerTabId === 'string' ? record.writerTabId : '';
  return {
    messageInput,
    attachments,
    agent,
    model,
    variant,
    updatedAt,
    rev,
    writerTabId,
  };
}

function parseComposerDraftStore(raw: string | null) {
  if (!raw) return {} as Record<string, ComposerDraft>;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {} as Record<string, ComposerDraft>;
    const normalized: Record<string, ComposerDraft> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      const draft = normalizeStoredComposerDraft(value);
      if (!draft) return;
      normalized[key] = draft;
    });
    return normalized;
  } catch {
    return {} as Record<string, ComposerDraft>;
  }
}

function readComposerDraftStore() {
  const raw = storageGet(StorageKeys.drafts.composer);
  return parseComposerDraftStore(raw);
}

function writeComposerDraftStore(store: Record<string, ComposerDraft>) {
  storageSetJSON(StorageKeys.drafts.composer, store);
}

function readComposerDraft(contextKey: string) {
  if (!contextKey) return null;
  const store = readComposerDraftStore();
  return store[contextKey] ?? null;
}

function nextComposerDraftRevision(contextKey: string, existingDraft?: ComposerDraft | null) {
  const storeRev = existingDraft?.rev ?? 0;
  const knownRev = composerDraftRevisionByContext.get(contextKey) ?? 0;
  const nextRev = Math.max(storeRev, knownRev) + 1;
  composerDraftRevisionByContext.set(contextKey, nextRev);
  return nextRev;
}

function writeComposerDraft(contextKey: string, draft: ComposerDraft) {
  if (!contextKey) return;
  const store = readComposerDraftStore();
  store[contextKey] = draft;
  composerDraftRevisionByContext.set(contextKey, draft.rev);
  writeComposerDraftStore(store);
}

function clearComposerInputState() {
  messageInput.value = '';
  attachments.value = [];
}

function draftKeyForSelectedContext() {
  return selectedSessionId.value;
}

function applyComposerDraftToComposerState(draft: ComposerDraft, contextKey: string) {
  composerDraftRevisionByContext.set(contextKey, draft.rev);
  messageInput.value = draft.messageInput;
  attachments.value = draft.attachments.slice();

  // Bootstrap guard: if options not loaded yet, apply draft values as-is
  if (agentOptions.value.length === 0 || modelOptions.value.length === 0) {
    if (draft.agent) selectedMode.value = draft.agent;
    if (draft.model) selectedModel.value = draft.model;
    selectedThinking.value = draft.variant;
    return;
  }

  // Validate and apply agent
  let agentToApply = draft.agent;
  if (draft.agent && !agentOptions.value.some((o) => o.id === draft.agent)) {
    // Agent not found, fall back to defaults
    const defaults = resolveDefaultAgentModel();
    agentToApply = defaults.agent;
  } else if (draft.agent) {
    agentToApply = draft.agent;
    selectedMode.value = agentToApply;
  }

  // Apply agent defaults to get correct model and variant
  if (agentToApply) {
    selectedMode.value = agentToApply;
    applyAgentDefaults(agentToApply);
  }

  const draftModelExists = !!(
    draft.model &&
    (modelOptions.value.some((model) => model.id === draft.model) ||
      (rememberModelPerAgent.value &&
        allModelOptions.value.some((model) => model.id === draft.model)))
  );
  const modelToApply = draftModelExists ? draft.model : undefined;
  applyModelVariantSelection(
    modelToApply,
    draft.variant,
    draftModelExists && isModelHidden(draft.model!),
  );
}

function restoreComposerDraftForContext(contextKey: string): boolean {
  if (!contextKey) return false;
  const draft = readComposerDraft(contextKey);
  if (!draft) return false;
  applyComposerDraftToComposerState(draft, contextKey);
  return true;
}

function persistComposerDraftForCurrentContext() {
  const contextKey = draftKeyForSelectedContext();
  if (!contextKey) return;
  const existingDraft = readComposerDraft(contextKey);
  const rev = nextComposerDraftRevision(contextKey, existingDraft);
  const draft: ComposerDraft = {
    messageInput: messageInput.value,
    attachments: attachments.value.map((item) => ({
      id: item.id,
      filename: item.filename,
      mime: item.mime,
      dataUrl: item.dataUrl,
    })),
    agent: selectedMode.value,
    model: selectedModel.value,
    variant: selectedThinking.value,
    updatedAt: Date.now(),
    rev,
    writerTabId: composerDraftTabId,
  };
  writeComposerDraft(contextKey, draft);
}

function clearComposerDraftForCurrentContext() {
  messageInput.value = '';
  attachments.value = [];
  persistComposerDraftForCurrentContext();
}

function handleMessageInputUpdate(value: string) {
  messageInput.value = value;
  persistComposerDraftForCurrentContext();
}

function handleSelectedModeUpdate(value: string) {
  // Save current model+variant for the outgoing agent before switching
  if (rememberModelPerAgent.value && selectedMode.value && selectedModel.value) {
    rememberAgentModel(selectedMode.value, selectedModel.value, selectedThinking.value);
  }

  selectedMode.value = value;

  // Try to restore remembered model for the new agent
  if (rememberModelPerAgent.value) {
    const remembered = recallAgentModel(value);
    if (remembered?.model) {
      // Check if the model still exists (in allModelOptions, including hidden)
      const exists = allModelOptions.value.some((m) => m.id === remembered.model);
      if (exists) {
        applyModelVariantSelection(remembered.model, remembered.variant, true);
        persistComposerDraftForCurrentContext();
        return;
      }
    }
  }

  // Fallback: apply server-defined agent defaults
  applyAgentDefaults(value);
  persistComposerDraftForCurrentContext();
}

function handleApplyHistoryEntry(entry: {
  text: string;
  agent?: string;
  model?: string;
  variant?: string;
}) {
  messageInput.value = entry.text;
  if (entry.agent && agentOptions.value.some((option) => option.id === entry.agent)) {
    selectedMode.value = entry.agent;
    applyAgentDefaults(entry.agent);
  }
  applyModelVariantSelection(entry.model, entry.variant);
  persistComposerDraftForCurrentContext();
}

function handleSelectedModelUpdate(value: string) {
  selectedModel.value = value;
  if (rememberModelPerAgent.value && selectedMode.value) {
    rememberAgentModel(selectedMode.value, value, selectedThinking.value);
  }
  nextTick(() => {
    persistComposerDraftForCurrentContext();
  });
}

function handleSelectedThinkingUpdate(value: string | undefined) {
  selectedThinking.value = value;
  if (rememberModelPerAgent.value && selectedMode.value && selectedModel.value) {
    rememberAgentModel(selectedMode.value, selectedModel.value, value);
  }
  persistComposerDraftForCurrentContext();
}

function handleComposerDraftStorage(event: StorageEvent) {
  if (event.storageArea !== window.localStorage) return;
  if (event.key !== storageKey(StorageKeys.drafts.composer)) return;
  const contextKey = draftKeyForSelectedContext();
  if (!contextKey) return;
  const store = parseComposerDraftStore(event.newValue);
  const draft = store[contextKey] ?? null;
  const knownRev = composerDraftRevisionByContext.get(contextKey) ?? 0;
  if (!draft) {
    composerDraftRevisionByContext.delete(contextKey);
    clearComposerInputState();
    return;
  }
  if (draft.rev < knownRev) return;
  applyComposerDraftToComposerState(draft, contextKey);
}

function buildComposerDraftFromUserMessage(payload: {
  sessionId: string;
  messageId: string;
}): Omit<ComposerDraft, 'rev' | 'writerTabId'> {
  const message = msg.get(payload.messageId);
  const messageInput = (message ? msg.getTextContent(payload.messageId) : '') || '';
  const sourceAttachments =
    (message ? msg.getImageAttachments(payload.messageId) : undefined) ?? [];
  const attachmentsForDraft: Attachment[] = sourceAttachments.map((item) => ({
    id: item.id,
    filename: item.filename,
    mime: item.mime,
    dataUrl: item.url,
  }));
  const meta = userMessageMetaById.value[payload.messageId];
  return {
    messageInput,
    attachments: attachmentsForDraft,
    agent: meta?.agent ?? '',
    model: meta?.modelId ?? '',
    variant: meta?.variant,
    updatedAt: Date.now(),
  };
}

function seedForkedSessionComposerDraft(
  payload: { sessionId: string; messageId: string },
  forkedSession: SessionInfo,
) {
  if (!forkedSession.id) return;
  const contextKey = forkedSession.id.trim();
  if (!contextKey) return;
  const draft = buildComposerDraftFromUserMessage(payload);
  const existingDraft = readComposerDraft(contextKey);
  writeComposerDraft(contextKey, {
    ...draft,
    rev: nextComposerDraftRevision(contextKey, existingDraft),
    writerTabId: composerDraftTabId,
  });
}

async function handleAddAttachments(files: File[]) {
  if (await attachmentsFeature.addFiles(files)) persistComposerDraftForCurrentContext();
}

function removeAttachment(id: string) {
  attachmentsFeature.remove(id);
  persistComposerDraftForCurrentContext();
}

async function fetchHomePath() {
  try {
    const data = (await opencodeApi.getPathInfo()) as {
      home?: string;
      worktree?: string;
    };
    if (typeof data.home === 'string' && data.home.trim()) {
      homePath.value = data.home.trim();
    }
    if (typeof data.worktree === 'string' && data.worktree.trim()) {
      serverWorktreePath.value = data.worktree.trim();
    }
  } catch {
    return;
  }
}

function handleEditProject(payload: { projectId: string; worktree: string }) {
  editingProject.value = payload;
}

async function handleSaveProject(payload: {
  projectId: string;
  worktree: string;
  name: string;
  icon: { color: string; override: string };
  commands: { start: string };
}) {
  try {
    await openCodeApi.updateProject(payload.projectId, {
      directory: payload.worktree,
      name: payload.name,
      icon: payload.icon,
      commands: payload.commands,
    });
    editingProject.value = null;
  } catch (error) {
    console.error('Failed to update project:', error);
  }
}

async function createSessionInDirectory(directory: string) {
  const session = await openCodeApi.createSession(directory);
  if (!session?.id) return undefined;
  await switchSessionSelection(session.projectID, session.id);
  return session;
}

async function createWorktreeFromWorktree(worktree: string) {
  if (!ensureConnectionReady('Creating worktree')) return;
  worktreeError.value = '';
  if (!worktree) {
    worktreeError.value = 'Worktree base directory not set.';
    return;
  }
  try {
    const data = (await openCodeApi.createWorktree({
      directory: worktree,
      projectId: selectedProjectId.value,
    })) as WorktreeInfo;
    if (data && typeof data.directory === 'string') {
      await createSessionInDirectory(data.directory);
    }
  } catch (error) {
    worktreeError.value = `Worktree create failed: ${toErrorMessage(error)}`;
  }
}

async function deleteWorktree(directory: string) {
  if (!ensureConnectionReady('Deleting worktree')) return;
  worktreeError.value = '';
  if (!directory) return;
  if (!projectDirectory.value) {
    worktreeError.value = 'Worktree base directory not set.';
    return;
  }
  const baseDir = projectDirectory.value.replace(/\/+$/, '');
  const targetDir = directory.replace(/\/+$/, '');
  if (baseDir && targetDir === baseDir) return;
  try {
    await openCodeApi.deleteWorktree({
      directory: projectDirectory.value,
      targetDirectory: targetDir,
      projectId: selectedProjectId.value,
    });
    if (normalizeDirectory(activeDirectory.value) === targetDir) {
      const projectId = selectedProjectId.value.trim();
      const candidates = (sessionsByProject.value[projectId] ?? []).filter((session) => {
        if (session.parentID || session.time?.archived) return false;
        const sessionDirectory = normalizeDirectory(session.directory || projectDirectory.value);
        return sessionDirectory !== targetDir;
      });
      const nextSessionId = pickPreferredSessionId(candidates);
      if (projectId && nextSessionId) {
        selectedProjectId.value = projectId;
        selectedSessionId.value = nextSessionId;
      } else {
        await createSessionInDirectory(baseDir);
      }
    }
  } catch (error) {
    worktreeError.value = `Worktree delete failed: ${toErrorMessage(error)}`;
  }
}

function openProjectPicker() {
  isProjectPickerOpen.value = true;
}

async function createNewSession(): Promise<SessionInfo | undefined> {
  if (!ensureConnectionReady('Creating session')) return undefined;
  sessionError.value = '';
  try {
    const directory = activeDirectory.value.trim();
    if (!directory) {
      throw new Error('Session create failed: active directory is empty.');
    }
    const data = await openCodeApi.createSession(directory);
    if (data && typeof data.id === 'string') {
      const nextProjectId = data.projectID;
      await switchSessionSelection(nextProjectId, data.id);
    }
    return data;
  } catch (error) {
    sessionError.value = `Session create failed: ${toErrorMessage(error)}`;
    return undefined;
  }
}

async function handleNewSessionInSandbox(payload: { worktree: string; directory: string }) {
  await createSessionInDirectory(payload.directory);
}

function handleTopPanelSessionSelect(payload: {
  projectId?: string;
  worktree: string;
  directory: string;
  sessionId: string;
}) {
  if (
    selectedSessionId.value === payload.sessionId &&
    activeDirectory.value === payload.directory &&
    projectDirectory.value === payload.worktree
  ) {
    return;
  }
  const projectId =
    payload.projectId ||
    resolveProjectIdForDirectory(payload.directory) ||
    resolveProjectIdForDirectory(payload.worktree) ||
    selectedProjectId.value;
  void switchSessionSelection(projectId, payload.sessionId);
}

async function deleteSession(sessionId: string) {
  if (!ensureConnectionReady('Deleting session')) return;
  sessionError.value = '';
  if (!sessionId) return;
  try {
    const directory = activeDirectory.value.trim();
    await openCodeApi.deleteSession({
      sessionId,
      projectId: selectedProjectId.value,
      directory: directory || undefined,
    });
  } catch (error) {
    sessionError.value = `Session delete failed: ${toErrorMessage(error)}`;
  }
}

async function archiveSession(sessionId: string) {
  if (!ensureConnectionReady('Archiving session')) return;
  sessionError.value = '';
  if (!sessionId) return;
  try {
    const directory = activeDirectory.value.trim();
    await openCodeApi.archiveSession({
      sessionId,
      projectId: selectedProjectId.value,
      directory: directory || undefined,
    });
  } catch (error) {
    sessionError.value = `Session archive failed: ${toErrorMessage(error)}`;
  }
}

async function archiveProject(payload: { projectId: string; worktree: string }) {
  if (!ensureConnectionReady('Archiving project')) return;
  sessionError.value = '';
  const { projectId } = payload;
  if (!projectId) return;
  const project = serverState.projects[projectId];
  if (!project) return;
  const toArchive: Array<{ sessionId: string; directory: string }> = [];
  for (const sandbox of Object.values(project.sandboxes)) {
    for (const session of Object.values(sandbox.sessions)) {
      if (!session.timeArchived) {
        toArchive.push({ sessionId: session.id, directory: sandbox.directory });
      }
    }
  }
  if (toArchive.length === 0) return;
  try {
    await Promise.all(
      toArchive.map(({ sessionId, directory }) =>
        openCodeApi.archiveSession({ sessionId, projectId, directory }),
      ),
    );
  } catch (error) {
    sessionError.value = `Project archive failed: ${toErrorMessage(error)}`;
  }
}

async function deleteProject(payload: { projectId: string; worktree: string }) {
  if (!ensureConnectionReady('Deleting project')) return;
  sessionError.value = '';
  const { projectId } = payload;
  if (!projectId) return;
  const project = serverState.projects[projectId];
  if (!project) return;
  const toDelete: Array<{ sessionId: string; directory: string }> = [];
  for (const sandbox of Object.values(project.sandboxes)) {
    for (const session of Object.values(sandbox.sessions)) {
      toDelete.push({ sessionId: session.id, directory: sandbox.directory });
    }
  }
  if (toDelete.length === 0) return;
  try {
    await Promise.all(
      toDelete.map(({ sessionId, directory }) =>
        openCodeApi.deleteSession({ sessionId, projectId, directory }),
      ),
    );
  } catch (error) {
    sessionError.value = `Project delete failed: ${toErrorMessage(error)}`;
  }
}

async function handleForkMessage(payload: { sessionId: string; messageId: string }) {
  if (!ensureConnectionReady('Fork')) return;
  sessionError.value = '';
  try {
    sendStatus.value = 'Forking...';
    const data = (await openCodeApi.forkSession({
      sessionId: payload.sessionId,
      messageId: payload.messageId,
      directory: activeDirectory.value.trim() || undefined,
      projectId: selectedProjectId.value,
    })) as SessionInfo;
    if (data && typeof data.id === 'string') {
      seedForkedSessionComposerDraft(payload, data);
      await switchSessionSelection(selectedProjectId.value, data.id);
    }
    sendStatus.value = 'Forked.';
  } catch (error) {
    sessionError.value = `Session fork failed: ${toErrorMessage(error)}`;
  }
}

async function handleRevertMessage(payload: { sessionId: string; messageId: string }) {
  if (!ensureConnectionReady('Revert')) return;
  sessionError.value = '';
  try {
    sendStatus.value = 'Reverting...';
    await openCodeApi.revertSession({
      sessionId: payload.sessionId,
      messageId: payload.messageId,
      projectId: selectedProjectId.value,
      directory: activeDirectory.value.trim() || undefined,
    });
    sendStatus.value = 'Reverted.';
    if (selectedSessionId.value === payload.sessionId) void reloadSelectedSessionState();
  } catch (error) {
    sessionError.value = `Session revert failed: ${toErrorMessage(error)}`;
  }
}

async function handleUndoRevert() {
  const sessionId = selectedSessionId.value;
  if (!sessionId) return;
  if (!ensureConnectionReady('Undo')) return;
  sessionError.value = '';
  try {
    sendStatus.value = 'Undoing...';
    await openCodeApi.unrevertSession({
      sessionId,
      projectId: selectedProjectId.value,
      directory: activeDirectory.value.trim() || undefined,
    });
    sendStatus.value = 'Undone.';
  } catch (error) {
    sessionError.value = `Session undo failed: ${toErrorMessage(error)}`;
  }
}

/** Set project name from package.json for newly created projects (fire-and-forget). */
async function initProjectNameFromPackageJson(projectId: string, directory: string) {
  try {
    const result = (await opencodeApi.readFileContent({
      directory,
      path: 'package.json',
    })) as FileContentResponse | string;
    const content = typeof result === 'string' ? result : result?.content;
    if (!content) return;
    const isBase64 = typeof result !== 'string' && result?.encoding === 'base64';
    const decoded =
      typeof content === 'string' && isBase64
        ? decodeApiTextContent(result as FileContentResponse)
        : content;
    const parsed = JSON.parse(decoded);
    const name = parsed?.name;
    if (typeof name !== 'string' || !name.trim()) return;
    await openCodeApi.updateProject(projectId, { directory, name: name.trim() });
  } catch {
    // Silently ignore - package.json may not exist or be invalid
  }
}

async function handleProjectDirectorySelect(directory: string) {
  isProjectPickerOpen.value = false;
  if (!directory) return;

  const isNewProject = !Object.values(serverState.projects).some((p) => p.worktree === directory);

  const { projectId, sessionId } = await openCodeApi.openProject(directory);
  ge.sendToWorker({
    type: 'load-sessions',
    directory,
  });
  await switchSessionSelection(projectId, sessionId);

  if (isNewProject && projectId !== 'global') {
    void initProjectNameFromPackageJson(projectId, directory);
  }
}
async function performDirectBootstrap() {
  // When SharedWorker is unavailable (e.g. mobile browsers), the SSE worker
  // never sends 'state.bootstrap'. We replicate the bootstrap logic here so
  // that serverState.bootstrapped becomes true and loading can proceed.
  const builder = createStateBuilder();

  function asStatusMap(value: unknown): Record<string, { type?: string }> {
    const record = asRecord(value);
    if (!record) return {};
    return record as Record<string, { type?: string }>;
  }

  const projects = asObjectArray<Record<string, unknown>>(await opencodeApi.listProjects());
  const directories = new Set<string>(['']);

  builder.applyProjects(projects as Parameters<typeof builder.applyProjects>[0]);

  projects.forEach((project) => {
    const worktree = normalizeDirectory(asString(project.worktree) ?? '');
    if (worktree) directories.add(worktree);
    const sandboxes = asStringArray(project.sandboxes) ?? [];
    sandboxes.forEach((sandbox) => {
      const dir = normalizeDirectory(sandbox);
      if (dir) directories.add(dir);
    });
  });

  await Promise.all(
    Array.from(directories).map(async (directory) => {
      const [sessions, statuses] = await Promise.all([
        opencodeApi.listSessions({ directory, roots: true }),
        opencodeApi.getSessionStatusMap(directory),
      ]);
      builder.applySessions(asObjectArray(sessions) as Parameters<typeof builder.applySessions>[0]);
      builder.applyStatuses(asStatusMap(statuses));
    }),
  );

  await Promise.all(
    Array.from(directories).map(async (directory) => {
      const raw = await opencodeApi.getVcsInfo(directory).catch(() => null);
      const vcsInfo = asRecord(raw);
      if (!vcsInfo) return;
      const branch = asString(vcsInfo.branch);
      if (!branch) return;
      builder.applyVcsInfo(directory, { branch });
    }),
  );

  builder.getDefaultProjectId();

  // Keep the builder around so real-time SSE events can update state.
  directStateBuilder = builder;

  serverState.handleStateMessage({
    type: 'state.bootstrap',
    projects: builder.getState().projects,
    notifications: {},
  });
}

async function bootstrapSelections() {
  if (isBootstrapping.value) return;
  isBootstrapping.value = true;
  try {
    if (!serverState.bootstrapped.value) {
      await new Promise<void>((resolve) => {
        const stop = watch(
          bootstrapReady,
          (ready) => {
            if (!ready) return;
            stop();
            resolve();
          },
          { immediate: true },
        );
      });
    }

    const initialProjectId = initialQuery.projectId.trim();
    const initialSessionId = initialQuery.sessionId.trim();
    if (initialProjectId && initialSessionId) {
      await switchSessionSelection(initialProjectId, initialSessionId);
    } else {
      await initializeSessionSelection();
    }

    if (activeDirectory.value) {
      await fetchCommands(activeDirectory.value);
    }
  } finally {
    isBootstrapping.value = false;
  }
}

/**
 * Turn a thrown load error into a short, actionable sentence for the UI.
 * Distinguishes "server unreachable" from "server said no", because the two
 * need very different fixes.
 */
type UserMessageMeta = {
  agent?: string;
  providerId?: string;
  modelId?: string;
  variant?: string;
};

function parseMessageTime(info?: Record<string, unknown>): number | undefined {
  if (!info) return undefined;
  const time = info.time as Record<string, unknown> | undefined;
  if (!time || typeof time !== 'object') return undefined;
  const created = time.created;
  return typeof created === 'number' ? created : undefined;
}

function parseUserMessageMeta(info?: Record<string, unknown>): UserMessageMeta | null {
  if (!info) return null;
  const agent = typeof info.agent === 'string' ? info.agent.trim() : '';
  const model = (info.model as Record<string, unknown> | undefined) ?? undefined;
  const providerId =
    typeof info.providerID === 'string'
      ? info.providerID.trim()
      : typeof model?.providerID === 'string'
        ? model.providerID.trim()
        : '';
  const modelId =
    typeof info.modelID === 'string'
      ? String(info.modelID).trim()
      : typeof model?.modelID === 'string'
        ? String(model.modelID).trim()
        : '';
  const variant = typeof info.variant === 'string' ? info.variant.trim() : '';
  if (!agent && !modelId && !providerId && !variant) return null;
  return {
    agent: agent || undefined,
    providerId: providerId || undefined,
    modelId: modelId || undefined,
    variant: variant || undefined,
  };
}

function storeUserMessageMeta(messageId: string | undefined, meta: UserMessageMeta | null) {
  if (!messageId || !meta) return;
  userMessageMetaById.value = { ...userMessageMetaById.value, [messageId]: meta };
}

function storeUserMessageTime(messageId: string | undefined, messageTime?: number) {
  if (!messageId || typeof messageTime !== 'number') return;
  userMessageTimeById.value = { ...userMessageTimeById.value, [messageId]: messageTime };
}

async function fetchHistory(sessionId: string, isSubagentMessage = false) {
  if (!sessionId) return;
  const requestId = !isSubagentMessage ? ++primaryHistoryRequestId : 0;
  const requestedDirectory = !isSubagentMessage ? getSelectedWorktreeDirectory() : '';
  try {
    const directory = getSelectedWorktreeDirectory();
    const data = (await opencodeApi.listSessionMessages(sessionId, {
      directory: directory || undefined,
    })) as Array<Record<string, unknown>>;
    if (!Array.isArray(data)) return;
    if (!isSubagentMessage) {
      if (requestId !== primaryHistoryRequestId) return;
      if (selectedSessionId.value !== sessionId) return;
      if (getSelectedWorktreeDirectory() !== requestedDirectory) return;
    }
    msg.loadHistory(data);

    data.forEach((message) => {
      const info = message.info as Record<string, unknown> | undefined;
      const id = typeof info?.id === 'string' ? info.id : undefined;
      if (!id) return;
      const meta = parseUserMessageMeta(info);
      const messageTime = parseMessageTime(info);
      storeUserMessageMeta(id, meta);
      storeUserMessageTime(id, messageTime);
    });

    if (!isSubagentMessage) {
      notifyContentChange(false);
    }
  } catch (error) {
    log('History load failed', error);
  }
}

function parseSlashCommand(input: string) {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const match = trimmed.slice(1).match(/^(\S+)(?:\s+(.*))?$/);
  if (!match) return null;
  const name = match[1]?.trim();
  if (!name) return null;
  const args = match[2] ?? '';
  return { name, arguments: args };
}

function findCommandByName(name: string) {
  const target = name.toLowerCase();
  return commands.value.find((command) => command.name.toLowerCase() === target) ?? null;
}

async function sendCommand(sessionId: string, command: CommandInfo, commandArgs: string) {
  if (!ensureConnectionReady('Sending commands')) return;
  const directory = activeDirectory.value.trim();
  await opencodeApi.sendCommand(sessionId, {
    directory: directory || undefined,
    command: command.name,
    arguments: commandArgs,
    agent: command.agent || selectedMode.value,
    model: command.model || selectedModel.value,
    variant: selectedThinking.value,
  });
}

async function sendMessage() {
  if (!ensureConnectionReady('Sending')) return;
  if (!canSend.value) return;
  const text = messageInput.value.trim();
  const hasText = text.length > 0;
  const hasAttachments = attachments.value.length > 0;
  let sessionId = selectedSessionId.value;
  if ((!hasText && !hasAttachments) || !sessionId) return;
  if (!filteredSessions.value.some((session) => session.id === sessionId)) {
    const fallbackId = pickPreferredSessionId(filteredSessions.value);
    const fallback = fallbackId
      ? filteredSessions.value.find((session) => session.id === fallbackId)
      : filteredSessions.value[0];
    if (!fallback) {
      sendStatus.value = 'No session selected.';
      return;
    }
    selectedSessionId.value = fallback.id;
    sessionId = fallback.id;
  }
  const slash = hasText ? parseSlashCommand(text) : null;
  const commandMatch = slash ? findCommandByName(slash.name) : null;
  const selectedInfo = modelOptions.value.find((model) => model.id === selectedModel.value);
  const selectedModelIDs = parseProviderModelKey(selectedModel.value);
  const providerID = selectedInfo?.providerID ?? (selectedModelIDs.providerID || undefined);
  const modelID = selectedInfo?.modelID ?? (selectedModelIDs.modelID || undefined);
  if (hasText) {
    recentUserInputs.push({ text, time: Date.now() });
    while (recentUserInputs.length > 20) recentUserInputs.shift();
  }
  messageInput.value = '';
  enableFollow();
  isSending.value = true;
  sendStatus.value = 'Sending...';
  try {
    if (slash && slash.name.toLowerCase() === 'shell') {
      await openShellFromInput(slash.arguments ?? '');
      sendStatus.value = 'Shell ready.';
      clearComposerDraftForCurrentContext();
      return;
    }
    if (slash && slash.name.toLowerCase() === 'debug') {
      const debugResult = runDebugCommand(slash.arguments ?? '');
      sendStatus.value = debugResult.message;
      clearComposerDraftForCurrentContext();
      return;
    }
    if (slash && commandMatch) {
      await sendCommand(sessionId, commandMatch, slash.arguments ?? '');
      sendStatus.value = 'Sent.';
      clearComposerDraftForCurrentContext();
      return;
    }
    const directory = requireSelectedWorktree();
    if (!directory) return;
    const parts = [] as Array<Record<string, unknown>>;
    if (hasText) parts.push({ type: 'text', text });
    if (hasAttachments) {
      parts.push(
        ...attachments.value.map((item) => ({
          type: 'file',
          mime: item.mime,
          url: item.dataUrl,
          filename: item.filename,
        })),
      );
    }
    if (isClaudeSessionId(sessionId)) {
      await sendClaudePrompt(sessionId, text);
    } else {
      await opencodeApi.sendPromptAsync(sessionId, {
        directory,
        agent: selectedMode.value,
        model: {
          providerID,
          modelID: modelID || '',
        },
        variant: selectedThinking.value,
        parts,
      });
    }
    sendStatus.value = 'Sent.';
    attachments.value = [];
    clearComposerDraftForCurrentContext();
  } catch (error) {
    sendStatus.value = `Send failed: ${toErrorMessage(error)}`;
  } finally {
    isSending.value = false;
  }
}

// ---------------------------------------------------------------------------
// Alt-Arrow session / project navigation helpers
// ---------------------------------------------------------------------------

function switchSessionByDirection(delta: number) {
  const tree = navigableTree.value;
  const currentProjectId = selectedProjectId.value;
  const worktree = tree.find((w) => w.projectId === currentProjectId);
  if (!worktree) return;

  // Flatten sessions across all sandboxes in display order
  const flatSessions = worktree.sandboxes.flatMap((s) => s.sessions);
  if (flatSessions.length === 0) return;

  const currentIndex = flatSessions.findIndex((s) => s.id === selectedSessionId.value);
  if (currentIndex < 0) {
    // Current session not in navigable list — jump to first
    void switchSessionSelection(currentProjectId, flatSessions[0].id);
    return;
  }

  const nextIndex = (currentIndex + delta + flatSessions.length) % flatSessions.length;
  const target = flatSessions[nextIndex];
  if (target.id !== selectedSessionId.value) {
    void switchSessionSelection(currentProjectId, target.id);
  }
}

function switchProjectByDirection(delta: number) {
  const tree = navigableTree.value;
  if (tree.length === 0) return;

  const currentIndex = tree.findIndex((w) => w.projectId === selectedProjectId.value);
  const baseIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex = (baseIndex + delta + tree.length) % tree.length;
  const target = tree[nextIndex];
  if (!target?.projectId) return;

  // Pick the most recently updated session in the target project
  const allSessions = target.sandboxes.flatMap((s) => s.sessions);
  if (allSessions.length === 0) return;

  const best = allSessions.reduce((a, b) => ((a.timeUpdated ?? 0) >= (b.timeUpdated ?? 0) ? a : b));
  void switchSessionSelection(target.projectId, best.id);
}

let lastEscTime = 0;
let lastCtrlGTime = 0;
const DOUBLE_ESC_THRESHOLD = 500;
const DOUBLE_CTRL_G_THRESHOLD = 500;

function handleGlobalKeydown(event: KeyboardEvent) {
  // Ctrl-A: select all content in focused div (floating window body)
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'a'
  ) {
    const active = document.activeElement;
    if (active instanceof HTMLDivElement) {
      event.stopPropagation();
      event.preventDefault();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(active);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
  }

  // Ctrl-;: new chat
  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === ';') {
    event.preventDefault();
    createNewSession();
    return;
  }

  // Ctrl-Shift-P: open the tool permissions panel
  if (
    event.ctrlKey &&
    event.shiftKey &&
    !event.metaKey &&
    !event.altKey &&
    event.key.toLowerCase() === 'p'
  ) {
    event.preventDefault();
    openToolPermissions();
    return;
  }

  // Ctrl-G: single = open session dropdown, double = select notification
  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'g') {
    event.preventDefault();
    const now = Date.now();
    if (now - lastCtrlGTime < DOUBLE_CTRL_G_THRESHOLD) {
      lastCtrlGTime = 0;
      topPanelRef.value?.closeSessionDropdown();
      if (notificationSessions.value.length > 0) {
        handleNotificationSessionSelect();
      }
      focusInput();
    } else {
      lastCtrlGTime = now;
      topPanelRef.value?.toggleSessionDropdown();
    }
    return;
  }

  // Alt-N: new session
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    createNewSession();
    return;
  }

  // Alt-O: open shell
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    openShellFromInput('');
    return;
  }

  // Alt-Left/Right: switch session within the same project
  if (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
  ) {
    event.preventDefault();
    switchSessionByDirection(event.key === 'ArrowLeft' ? 1 : -1);
    return;
  }

  // Alt-Up/Down: switch to a different project
  if (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (event.key === 'ArrowUp' || event.key === 'ArrowDown')
  ) {
    event.preventDefault();
    switchProjectByDirection(event.key === 'ArrowUp' ? -1 : 1);
    return;
  }

  if (event.key !== 'Escape') return;

  // Priority 1: Close any open modal / overlay
  if (isSettingsOpen.value) {
    isSettingsOpen.value = false;
    lastEscTime = 0;
    return;
  }
  if (isProjectPickerOpen.value) {
    isProjectPickerOpen.value = false;
    lastEscTime = 0;
    return;
  }

  // Priority 2: Double-ESC to abort
  const now = Date.now();
  if (now - lastEscTime < DOUBLE_ESC_THRESHOLD) {
    lastEscTime = 0;
    if (canAbort.value) {
      abortSession();
    }
  } else {
    lastEscTime = now;
  }
}

function focusInput() {
  nextTick(() => inputPanelRef.value?.focus());
}

async function abortSession() {
  if (!ensureConnectionReady('Stopping')) return;
  const sessionId = selectedSessionId.value;
  if (!sessionId || isAborting.value) return;
  isAborting.value = true;
  sendStatus.value = 'Stopping...';
  try {
    const directory = activeDirectory.value.trim();
    const busyDescendants = busyDescendantSessionIds.value;
    const abortPromises = [
      opencodeApi.abortSession(sessionId, directory || undefined),
      ...busyDescendants.map((sid) =>
        opencodeApi.abortSession(sid, directory || undefined).catch(() => {}),
      ),
    ];
    await Promise.all(abortPromises);
    sendStatus.value = 'Stopped.';
  } catch (error) {
    sendStatus.value = `Stop failed: ${toErrorMessage(error)}`;
  } finally {
    isAborting.value = false;
  }
}

watch(
  [projectDirectory, activeDirectory, selectedSessionId],
  ([pd, ad, sid], [prevPd, prevAd, prevSid] = ['', '', '']) => {
    if (isBootstrapping.value) return;

    const pdChanged = pd !== prevPd && typeof prevPd !== 'undefined';
    const adChanged = ad !== prevAd && typeof prevAd !== 'undefined';
    const sidChanged = sid !== prevSid && typeof prevSid !== 'undefined';

    // pd/ad が変わっていなければ何もしない（sid だけの変更は意図的なセッション切り替え）
    if (!pdChanged && !adChanged) return;

    // pd/ad が変わったが sid も同時に変わった場合 = 意図的な一括選択 → クリアしない
    // pd/ad だけ変わった場合 = ディレクトリ切り替え → sid をクリア
    if (!sidChanged) {
      const nextProjectId = (pd || selectedProjectId.value).trim();
      const nextDirectory = ad.trim();
      const candidates = (sessionsByProject.value[nextProjectId] ?? []).filter((session) => {
        if (session.parentID || session.time?.archived) return false;
        if (!nextDirectory) return true;
        return !session.directory || session.directory === nextDirectory;
      });
      const nextSessionId = pickPreferredSessionId(candidates);
      if (nextProjectId && nextSessionId) {
        selectedProjectId.value = nextProjectId;
        selectedSessionId.value = nextSessionId;
      } else if (nextDirectory) {
        void createSessionInDirectory(nextDirectory);
      }
    }

    if (adChanged && ad) {
      void fetchCommands(ad);
    }
  },
  { immediate: true },
);

watch(
  filteredSessions,
  () => {
    if (!bootstrapReady.value && !isBootstrapping.value) return;
    if (isBootstrapping.value) return;
    if (!selectedSessionId.value) {
      const preferredId = pickPreferredSessionId(filteredSessions.value);
      if (preferredId) {
        selectedSessionId.value = preferredId;
      }
      return;
    }
    validateSelectedSession();
  },
  { immediate: true },
);

watch(
  uiInitState,
  (state) => {
    if (state !== 'ready') return;
    nextTick(() => {
      syncFloatingExtent();
      inputPanelRef.value?.focus();
      void restoreShellSessions();
    });
  },
  { immediate: true },
);

async function reloadSelectedSessionState() {
  if (selectedSessionId.value && isBootstrapping.value && !activeDirectory.value) {
    return;
  }
  fw.closeAll({ exclude: (key) => key.startsWith('shell:') });
  msg.reset();
  resetFollow();
  reasoning.reset();
  subagentWindows.reset();
  retryStatus.value = null;
  todosBySessionId.value = {};
  todoLoadingBySessionId.value = {};
  todoErrorBySessionId.value = {};
  if (selectedSessionId.value) {
    const sessionId = selectedSessionId.value;
    await fetchHistory(sessionId);
    if (msg.roots.value.length === 0) {
      scrollOutputPanelToBottom(false);
    }
    if (uiInitState.value === 'ready') {
      await restoreShellSessions();
    }
    void reloadTodosForAllowedSessions();
    const directory = activeDirectory.value || undefined;
    void fetchPendingPermissions(directory);
    void fetchPendingQuestions(directory);
  }
  nextTick(() => inputPanelRef.value?.focus());
}

watch(
  selectedSessionId,
  (contextKey, previousKey) => {
    const prevContextKey = previousKey ?? '';
    if (contextKey === prevContextKey) return;
    clearComposerInputState();
    nextTick(() => {
      inputPanelRef.value?.reset();
    });
    if (!contextKey) return;
    const hadDraft = restoreComposerDraftForContext(contextKey);
    if (!hadDraft && !prevContextKey) resolveDefaultAgentModel();
  },
  { immediate: true },
);

watch(
  isThinking,
  (active) => {
    if (active) return;
    if (!selectedSessionId.value) return;
    updateReasoningExpiry(selectedSessionId.value, 'idle');
  },
  { immediate: true },
);

watch(activeDirectory, (directory) => {
  if (isBootstrapping.value) return;
  const activePath = directory || undefined;
  if (!activePath) {
    treeNodes.value = [];
    expandedTreePathSet.value = new Set();
    selectedTreePath.value = '';
    return;
  }
  if (activeDirectory.value && activePath !== activeDirectory.value) return;
  void fetchCommands(activePath);
  void reloadTodosForAllowedSessions();
});

watch(
  allowedSessionIds,
  () => {
    void reloadTodosForAllowedSessions();
  },
  { immediate: true },
);

function log(..._args: unknown[]) {}

watch(selectedSessionId, reloadSelectedSessionState, { immediate: true });

function formatRetryTime(timestamp: number): string {
  const nextDate = new Date(timestamp);
  const now = Date.now();
  const diffMs = timestamp - now;

  const absolute = nextDate
    .toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/(\d+)\/(\d+)\/(\d+),/, '$3/$1/$2');

  const diffSec = Math.max(0, Math.ceil(diffMs / 1000));
  const diffMin = Math.ceil(diffSec / 60);
  const diffHour = Math.ceil(diffMin / 60);

  let relative: string;
  if (diffHour > 1) {
    relative = `in ${diffHour} hours`;
  } else if (diffMin > 1) {
    relative = `in ${diffMin} minutes`;
  } else {
    relative = `in ${diffSec} seconds`;
  }

  return `${absolute} (${relative})`;
}

async function startInitialization() {
  if (initializationInFlight) return;
  initializationInFlight = true;
  uiInitState.value = 'loading';
  initErrorMessage.value = '';
  reconnectingMessage.value = '';
  try {
    connectionState.value = 'connecting';
    initLoadingMessage.value = 'Connecting to SSE stream...';
    await ge.connect({ failFast: true, timeoutMs: 10000 });
    connectionState.value = 'bootstrapping';
    initLoadingMessage.value = 'Loading server path...';
    await fetchHomePath();
    initLoadingMessage.value = 'Loading projects and sessions...';
    if (!ge.usingSharedWorker && !serverState.bootstrapped.value) {
      await performDirectBootstrap();
    }
    await syncClaudeProjects();
    await bootstrapSelections();
    if (selectedSessionId.value) {
      initLoadingMessage.value = 'Loading session history...';
      await reloadSelectedSessionState();
    }
    if (activeDirectory.value) {
      initLoadingMessage.value = 'Loading worktree state...';
      await fetchCommands(activeDirectory.value || undefined);
      const directory = activeDirectory.value || undefined;
      await fetchPendingPermissions(directory);
      await fetchPendingQuestions(directory);
      void refreshGitStatus();
    }
    connectionState.value = 'ready';
    uiInitState.value = 'ready';
    await fetchProviders();
    await fetchAgents();
  } catch (error) {
    if (!initializationInFlight) return;
    ge.disconnect();
    const msg = toErrorMessage(error);
    connectionState.value = 'error';
    if (/\(40[13]\)/.test(msg)) {
      storageSet(StorageKeys.state.lastAuthError, msg);
      credentials.clear();
      initErrorMessage.value = msg;
      uiInitState.value = 'login';
    } else {
      initErrorMessage.value = msg;
      uiInitState.value = 'login';
    }
  } finally {
    initializationInFlight = false;
  }
}

function handleLogin() {
  const u = loginRequiresAuth.value ? loginUsername.value : '';
  const p = loginRequiresAuth.value ? loginPassword.value : '';
  credentials.save(loginUrl.value, u, p);
  void startInitialization();
}

function handleAbortInit() {
  ge.disconnect();
  initializationInFlight = false;
  connectionState.value = 'connecting';
  uiInitState.value = 'login';
  initErrorMessage.value = '';
}

function handleLogout() {
  credentials.clear();
  ge.disconnect();
  disposeShellWindows();
  uiInitState.value = 'login';
  initErrorMessage.value = '';
  connectionState.value = 'connecting';
}

onMounted(async () => {
  ensureBrowserNotificationPermission();
  window.addEventListener('keydown', handleGlobalKeydown);
  handleWindowResize();
  credentials.load();

  // Try to auto-configure from the server. If the server provides a URL,
  // use it (overriding any stored credentials). If not, fall through to
  // the stored credentials or the manual login screen.
  const autoConfigured = await serverConfig.load();

  if (autoConfigured || credentials.isConfigured.value) {
    loginUrl.value = credentials.url.value;
    loginUsername.value = credentials.username.value;
    loginPassword.value = credentials.password.value;
    loginRequiresAuth.value = !!(credentials.username.value || credentials.password.value);
    void startInitialization();
  } else {
    uiInitState.value = 'login';
    const savedError = storageGet(StorageKeys.state.lastAuthError);
    if (savedError) {
      initErrorMessage.value = savedError;
      storageRemove(StorageKeys.state.lastAuthError);
    }
  }
  window.addEventListener('storage', handleComposerDraftStorage);
  globalEventUnsubscribers.push(
    ge.on('connection.open', () => {
      if (connectionState.value === 'reconnecting' || connectionState.value === 'error') {
        connectionState.value = 'ready';
        reconnectingMessage.value = '';
        sendStatus.value = 'Ready';
      }
      if (bootstrapReady.value) {
        syncActiveSelectionToWorker();
        return;
      }
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('connection.reconnected', () => {
      connectionState.value = 'ready';
      reconnectingMessage.value = '';
      sendStatus.value = 'Ready';
      syncActiveSelectionToWorker();
      void fetchProviders(true);
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('connection.error', (payload) => {
      if (payload.statusCode === 401 || payload.statusCode === 403) {
        const msg = `${payload.message} (HTTP ${payload.statusCode})`;
        storageSet(StorageKeys.state.lastAuthError, msg);
        credentials.clear();
        uiInitState.value = 'login';
        initErrorMessage.value = msg;
        connectionState.value = 'error';
        return;
      }
      if (uiInitState.value === 'loading') {
        connectionState.value = 'error';
        initErrorMessage.value = 'Failed to connect to SSE stream.';
        uiInitState.value = 'login';
        return;
      }
      connectionState.value = 'reconnecting';
      reconnectingMessage.value = 'Reconnecting...';
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('worktree.ready', () => {
      // Worker owns project/worktree graph updates.
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('session.updated', () => {
      validateSelectedSession();
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('session.deleted', ({ info }) => {
      const sessionInfo = info as SessionInfo;
      notificationSessionOrder.value = notificationSessionOrder.value.filter(
        (notificationKey) => notificationKey !== sessionInfo.id,
      );
      validateSelectedSession();
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('file.watcher.updated', (packet) => {
      feed(packet);
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('session.status', ({ sessionID, status }) => {
      applySessionStatusEvent(sessionID, status);
    }),
  );
  globalEventUnsubscribers.push(
    sessionScope.on('todo.updated', ({ sessionID, todos }) => {
      todosBySessionId.value = {
        ...todosBySessionId.value,
        [sessionID]: normalizeTodoItems(todos),
      };
      if (todoErrorBySessionId.value[sessionID]) {
        const nextErrors = { ...todoErrorBySessionId.value };
        delete nextErrors[sessionID];
        todoErrorBySessionId.value = nextErrors;
      }
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('pty.created', ({ info }) => {
      handlePtyEvent({ type: 'pty.created', info: info as PtyInfo });
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('pty.updated', ({ info }) => {
      handlePtyEvent({ type: 'pty.updated', info: info as PtyInfo });
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('pty.exited', ({ id, exitCode }) => {
      handlePtyEvent({ type: 'pty.exited', info: null, id, exitCode });
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('pty.deleted', ({ id }) => {
      terminals.handlePtyDeleted(id);
    }),
  );
  globalEventUnsubscribers.push(
    sessionScope.on('message.part.updated', ({ part }) => {
      if (part.type !== 'tool') return;
      if (suppressAutoWindows.value) return;
      openToolPartAsWindow(part);
    }),
  );

  // ── Direct-transport real-time state sync ─────────────────────────────
  // When SharedWorker is unavailable (mobile browsers) we process raw SSE
  // packets here to keep serverState.projects in sync, mirroring the logic
  // in the SharedWorker's handleStatePacket().
  if (!ge.usingSharedWorker) {
    globalEventUnsubscribers.push(
      ge.onRawPacket((packet: SsePacket) => {
        const builder = directStateBuilder;
        if (!builder) return;

        const packetType = packet.payload.type;
        const properties = packet.payload.properties;
        const packetDirectory = (packet.directory || '').trim().replace(/\/+$/, '') || '/';
        let changedProjectId: string | null = null;

        switch (packetType) {
          case 'session.created': {
            const info = (properties as { info?: unknown }).info;
            if (info && typeof info === 'object') {
              changedProjectId = builder.processSessionCreated(
                info as Parameters<typeof builder.processSessionCreated>[0],
              );
            }
            break;
          }
          case 'session.updated': {
            const info = (properties as { info?: unknown }).info;
            if (info && typeof info === 'object') {
              changedProjectId = builder.processSessionUpdated(
                info as Parameters<typeof builder.processSessionUpdated>[0],
              );
            }
            break;
          }
          case 'session.deleted': {
            const info = (properties as { info?: { id?: string; directory?: string } }).info;
            if (info && typeof info === 'object' && typeof info.id === 'string') {
              const deletedDirectory = (info.directory || '').trim().replace(/\/+$/, '') || '/';
              const deletedProjectId = builder.resolveProjectIdForDirectory(deletedDirectory);
              changedProjectId = builder.processSessionDeleted(
                info.id,
                deletedProjectId || undefined,
              );
            }
            break;
          }
          case 'session.status': {
            const sessionID = (properties as { sessionID?: string }).sessionID;
            const status = (properties as { status?: { type?: string } }).status;
            if (typeof sessionID === 'string' && status && typeof status.type === 'string') {
              const statusProjectId = builder.resolveProjectIdForDirectory(packetDirectory);
              if (statusProjectId) {
                changedProjectId = builder.processSessionStatus(
                  sessionID,
                  status.type,
                  statusProjectId,
                );
              }
            }
            break;
          }
          case 'project.updated': {
            changedProjectId = builder.processProjectUpdated(
              properties as Parameters<typeof builder.processProjectUpdated>[0],
            );
            break;
          }
          case 'vcs.branch.updated': {
            const branch = (properties as { branch?: string }).branch ?? '';
            changedProjectId = builder.processVcsBranchUpdated(packetDirectory, branch);
            break;
          }
          case 'worktree.ready': {
            const readyBranch = (properties as { branch?: string }).branch ?? '';
            changedProjectId = builder.processVcsBranchUpdated(packetDirectory, readyBranch);
            break;
          }
          default:
            // Not a state event — ignore.
            return;
        }

        if (changedProjectId) {
          const project = builder.getProject(changedProjectId);
          if (project) {
            serverState.handleStateMessage({
              type: 'state.project-updated',
              projectId: changedProjectId,
              project,
            });
          }
        }
      }),
    );
  }
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.removeEventListener('storage', handleComposerDraftStorage);
  while (globalEventUnsubscribers.length > 0) {
    const dispose = globalEventUnsubscribers.pop();
    dispose?.();
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  mainSessionScope.dispose();
  sessionScope.dispose();
  ge.disconnect();
  disposeShellWindows();
});
</script>

<style scoped>
.app {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px;
  box-sizing: border-box;
}

.app-loading-view {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  place-items: center;
  z-index: 0;
}

.app-loading-card {
  position: relative;
  width: min(420px, 92vw);
  border: 1px solid var(--theme-border);
  background: var(--theme-bg-overlay);
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 14px 34px color-mix(in srgb, var(--theme-bg-base) 50%, transparent);
  text-align: center;
}

.app-loading-spinner {
  width: 26px;
  height: 26px;
  margin: 0 auto 12px;
  border-radius: 50%;
  border: 3px solid var(--theme-border-subtle);
  border-top-color: var(--theme-text-secondary);
  animation: app-loading-spin 0.85s linear infinite;
}

.app-loading-title {
  margin: 0;
  color: var(--theme-text-secondary);
  font-size: 14px;
  font-weight: 600;
}

.app-loading-message {
  margin: 8px 0 0;
  color: var(--theme-text-muted);
  font-size: 12px;
}

.app-loading-retry {
  margin-top: 14px;
  border: 1px solid var(--theme-border);
  background: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.app-loading-retry:hover {
  background: var(--theme-border);
}

.app-loading-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.app-loading-abort {
  background: transparent;
  border-color: var(--theme-border-strong);
  color: var(--theme-text-muted);
}

.app-loading-abort:hover {
  background: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.app-login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}

.app-login-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.app-login-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--theme-bg-hover);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  font-size: 13px;
  box-sizing: border-box;
}

.app-login-input::placeholder {
  color: var(--theme-text-subtle);
}

.app-login-input:focus {
  outline: none;
  border-color: var(--theme-border-strong);
  background: var(--theme-bg-base);
}

.app-login-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.app-login-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--theme-text-muted);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}

.app-error-message {
  color: var(--theme-danger);
}

@keyframes app-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.app-header {
  flex: 0 0 auto;
  position: relative;
  z-index: 30;
}

.app-output {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  z-index: 10;
  isolation: isolate;
}

.main-tabs {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 20;
}

.main-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-text-muted);
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  cursor: pointer;
}

.main-tab:hover {
  color: var(--theme-text-secondary);
}

.main-tab.is-active {
  background: color-mix(in srgb, var(--theme-accent-strong) 12%, var(--theme-bg-overlay));
  border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent);
  color: var(--theme-text-primary);
}

.app-input {
  flex: 0 0 auto;
  position: relative;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-height: 0;
  min-height: 200px;
}

.input-resizer {
  position: absolute;
  top: -8px;
  left: 8px;
  right: 8px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  z-index: 40;
  touch-action: none;
}

.input-resizer::before {
  content: '';
  width: 44px;
  height: 3px;
  border-radius: 999px;
  background: var(--theme-border-subtle);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-bg-base) 60%, transparent);
}

.input-resizer:hover::before {
  background: color-mix(in srgb, var(--theme-text-secondary) 70%, transparent);
}

.output-workspace {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tool-window-layer {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
}

.output-split {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.app-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: stretch;
  gap: var(--todo-panel-gap);
  --todo-panel-gap: 10px;
  --todo-panel-open-width: clamp(260px, 26vw, 380px);
  --todo-panel-collapsed-width: 30px;
  --todo-panel-width: var(--todo-panel-open-width);
}

.app-body.todo-collapsed {
  --todo-panel-width: var(--todo-panel-collapsed-width);
}

.app-main-column {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.side-panel-area {
  position: relative;
  flex: 0 0 var(--todo-panel-width);
  width: var(--todo-panel-width);
  min-height: 0;
}

.todo-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.side-resizer {
  position: absolute;
  top: 8px;
  bottom: 8px;
  right: -7px;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ew-resize;
  touch-action: none;
}

.side-resizer::before {
  content: '';
  width: 3px;
  height: 44px;
  border-radius: 999px;
  background: var(--theme-border-subtle);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-bg-base) 60%, transparent);
}

.side-resizer:hover::before {
  background: color-mix(in srgb, var(--theme-text-secondary) 70%, transparent);
}

.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.tool-window-canvas {
  position: fixed;
  top: var(--canvas-top, 0px);
  left: 0;
  width: 100vw;
  height: var(--canvas-height, 100%);
  pointer-events: none;
  overflow: visible;
  z-index: 20;
  --dock-reserved: 0px;
  --tool-top-offset: 0px;
  --tool-area-height: var(--canvas-height, 100%);
  --term-font-family:
    'Iosevka Term', 'Iosevka Fixed', 'JetBrains Mono', 'Cascadia Mono', 'SFMono-Regular', Menlo,
    Consolas, 'Liberation Mono', monospace;
  --term-font-size: 13px;
  --term-line-height: 1.1;
  --term-width: 670px;
  --term-height: 386px;
}

.output-panel {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

:deep(.scale-enter-active),
:deep(.scale-leave-active) {
  transition:
    transform 0.15s ease-in,
    opacity 0.15s ease-in;
}

:deep(.scale-enter-from),
:deep(.scale-leave-to) {
  opacity: 0;
  --win-scale-x: 1.5;
  --win-scale-y: 0;
}

/* ============================================================
   MOBILE LAYOUT  (< 768px)
   ============================================================ */

/* Hide bottom bar on desktop */
.mobile-bottom-bar {
  display: none;
}

@media (max-width: 767px) {
  /* Tighter outer padding on small screens */
  .app {
    padding: 6px 6px 0;
    gap: 6px;
  }

  /* Stack the body as a column; no horizontal flex */
  .app-body {
    flex-direction: column;
    gap: 0;
    padding-bottom: 44px; /* reserve space for bottom bar */
  }

  /* Side panel becomes a fixed off-screen drawer */
  .side-panel-area {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(300px, 85vw) !important;
    flex: none !important;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
  }

  /* Drawer open state */
  .app-body.mobile-drawer-open .side-panel-area {
    transform: translateX(0);
  }

  /* Backdrop */
  .mobile-drawer-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, #000 55%, transparent);
    z-index: 49;
    -webkit-tap-highlight-color: transparent;
  }

  /* Main column fills full width */
  .app-main-column {
    flex: 1 1 auto;
    width: 100%;
    gap: 6px;
  }

  /* Input minimum height is smaller on mobile */
  .app-input {
    min-height: 130px !important;
  }

  /* Hide desktop-only drag handles */
  .side-resizer,
  .input-resizer {
    display: none !important;
  }

  /* Floating windows: handled via FloatingWindow.vue on mobile */
  /* Make the canvas a proper fixed stacking context for bottom sheets */
  .tool-window-canvas {
    pointer-events: none;
    overflow: hidden;
    /* Bottom sheets need to overflow downward */
    overflow: visible;
  }

  /* Bottom bar */
  .mobile-bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 44px;
    z-index: 40;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 8px;
    background: var(--theme-bg-overlay);
    border-top: 1px solid var(--theme-border);
  }

  .mobile-bottom-spacer {
    flex: 1 1 auto;
  }

  .mobile-bottom-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--theme-text-muted);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      border-color 0.15s;
  }

  .mobile-bottom-btn:hover,
  .mobile-bottom-btn.active {
    background: var(--theme-border-subtle);
    color: var(--theme-text-secondary);
    border-color: var(--theme-border);
  }
}

/* Backdrop transition */
.mobile-backdrop-enter-active,
.mobile-backdrop-leave-active {
  transition: opacity 0.22s ease;
}

.mobile-backdrop-enter-from,
.mobile-backdrop-leave-to {
  opacity: 0;
}
</style>
