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
          @new-claude-session="createNewClaudeSession"
          @new-session-in="handleNewSessionInSandbox"
          @new-claude-session-in="handleNewClaudeSessionIn"
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
                    @open-image="handleOpenImage"
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
              @open-image="handleOpenImage"
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { bundledThemes } from 'shiki/bundle/web';
import { Terminal } from '@xterm/xterm';
import InputPanel from './components/InputPanel.vue';
import OutputPanel from './components/OutputPanel.vue';
import TrajectoryPanel from './components/Trajectory/TrajectoryPanel.vue';
import ProjectPicker from './components/ProjectPicker.vue';
import FloatingWindow from './components/FloatingWindow.vue';
import GlobContent from './components/ToolWindow/Glob.vue';
import GrepContent from './components/ToolWindow/Grep.vue';
import ReasoningContent from './components/ToolWindow/Reasoning.vue';
import ThreadHistoryContent from './components/ThreadHistoryContent.vue';
import WebContent from './components/ToolWindow/Web.vue';
import SidePanel from './components/SidePanel.vue';
import Welcome from './components/Welcome.vue';
import TopPanel from './components/TopPanel.vue';
import SettingsModal from './components/SettingsModal.vue';
import ProjectSettingsDialog from './components/ProjectSettingsDialog.vue';
import HiddenModelsModal from './components/HiddenModelsModal.vue';
import PeonPingPlayer from './components/PeonPingPlayer.vue';
import ContentViewer from './components/viewers/ContentViewer.vue';
import DiffViewer from './components/viewers/DiffViewer.vue';
import ShellContent from './components/ToolWindow/Shell.vue';
import {
  formatGlobToolTitle,
  resolveReadWritePath,
  resolveReadRange,
  guessLanguageFromPath,
  formatListToolTitle,
  formatWebfetchToolTitle,
  formatQueryToolTitle,
  toolColor,
} from './utils/toolWindowFormat';
import { useAutoScroller, type ScrollMode } from './composables/useAutoScroller';
import { useFileTree, type FileNode } from './composables/useFileTree';
import { usePtyOneshot } from './composables/usePtyOneshot';
import { usePermissions, type PermissionRequest } from './composables/usePermissions';
import { normalizePermissionConfig, rulesFromToolsMap } from './utils/permissions';
import { useQuestions, type QuestionRequest, type QuestionInfo } from './composables/useQuestions';
import { useTodos, type TodoSessionView } from './composables/useTodos';
import { useHiddenModels } from './composables/useHiddenModels';
import { useAgentModelMemory } from './composables/useAgentModelMemory';
import { renderWorkerHtml } from './utils/workerRenderer';
import type {
  MessageInfo,
  MessagePart,
  PermissionRule,
  ReasoningPart,
  ToolPart,
  SsePacket,
} from './types/sse';
import { createStateBuilder } from './utils/stateBuilder';
import {
  extractFileRead as extractToolFileRead,
  extractPatch as extractToolPatch,
} from './utils/toolRenderers';
import * as opencodeApi from './utils/opencode';
import { normalizeDirectory, splitFileContentDirectoryAndPath } from './utils/path';
import { asObjectArray, asRecord, asString, asStringArray, toErrorMessage } from './utils/strings';
import { parsePtyInfo, type PtyInfo } from './utils/pty';
import {
  TERM_COLUMNS,
  TERM_FONT_FAMILY,
  TERM_FONT_SIZE_PX,
  TERM_INNER_PADDING_X_PX,
  TERM_INNER_PADDING_Y_PX,
  TERM_LINE_HEIGHT,
  TERM_ROWS,
  TERM_TITLEBAR_HEIGHT_PX,
  TERM_WINDOW_BORDER_PX,
} from './utils/terminalMetrics';
import {
  COMMIT_SNAPSHOT_SCRIPT,
  FILE_SNAPSHOT_SCRIPT,
  buildWorktreeSnapshotScript,
  parseCommitSnapshotOutput,
  parseFileSnapshotOutput,
  toUint8ArrayFromBase64,
  type WorktreeSnapshotMode,
} from './utils/gitSnapshotScripts';
import { useAppContext } from './composables/useAppContext';
import { useModals } from './composables/useModals';
import { useAttachments } from './composables/useAttachments';
import { useShellLayout } from './composables/useShellLayout';
import { useSelectionRouting } from './composables/useSelectionRouting';
import { useServerConfig } from './composables/useServerConfig';
import {
  FILE_VIEWER_WINDOW_HEIGHT,
  FILE_VIEWER_WINDOW_WIDTH,
  getTerminalWindowSize,
  useFloatingCanvas,
} from './composables/useFloatingCanvas';
import { useBrowserNotifications } from './composables/useBrowserNotifications';
import { useSessionCatalog } from './composables/useSessionCatalog';
import { parseProviderModelKey, useProviderCatalog } from './composables/useProviderCatalog';
import type { SessionEntry as SessionInfo, WorktreeInfo } from './types/session';
import type { CommandInfo } from './types/provider';
import type { Attachment } from './types/composer';
import {
  ccProjectId,
  isClaudeProjectId,
  isClaudeSessionId,
  rawSessionId,
} from '#shared/utils/claude-ids';
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
const {
  canvasEl: toolWindowCanvasEl,
  bindCanvasEl,
  handleWindowResize,
  syncFloatingExtent,
  getRandomWindowPosition,
  getFileViewerPosition,
} = canvas;
canvas.onWindowResize(() => scheduleShellFitAll());
const notifications = useBrowserNotifications();
const {
  notificationSessionOrder,
  notificationSessions,
  syncActiveSelectionToWorker,
  ensureBrowserNotificationPermission,
  selectNextNotificationSession: handleNotificationSessionSelect,
} = notifications;
const FOLLOW_THRESHOLD_PX = 24;
const SHELL_LINGER_MS = 1000;

type FileContentResponse = {
  content?: string;
  encoding?: string;
  type?: 'text' | 'binary';
};

type ShellSession = {
  pty: PtyInfo;
  terminal: Terminal;
  socket?: WebSocket;
  exiting?: boolean;
  closeOnSuccess?: boolean;
  exitResolve?: (exitCode: number) => void;
};

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

const runningToolIds = reactive(new Set<string>());

type MessageDiffEntry = { file: string; diff: string; before?: string; after?: string };

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
const shellSessionsByPtyId = new Map<string, ShellSession>();
const pendingShellFits = new Set<string>();
const shellExitWaiters = new Map<string, (exitCode: number) => void>();
const ptyMetaDecoder = new TextDecoder();

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
  resolveWorktreeRelativePath,
  requireSelectedWorktree,
  pickPreferredSessionId,
  validateSelectedSession,
  resolveProjectIdForDirectory,
  getSessionStatus,
  applySessionStatusEvent,
} = catalog;
const providerCatalog = useProviderCatalog();
const {
  agents,
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
const isClaudeSession = computed(() => isClaudeSessionId(selectedSessionId.value));

const messageInput = ref('');
const isSending = ref(false);
const isAborting = ref(false);
const isBootstrapping = ref(false);
const uiInitState = ref<'loading' | 'ready' | 'error' | 'login'>('loading');
const initLoadingMessage = ref('Connecting to server...');
const initErrorMessage = ref('');
const connectionState = ref<'connecting' | 'bootstrapping' | 'ready' | 'reconnecting' | 'error'>(
  'connecting',
);
const reconnectingMessage = ref('');
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
const currentSessionPermissionRules = computed<PermissionRule[]>(() => {
  const projectId = selectedProjectId.value.trim();
  const sessionId = selectedSessionId.value.trim();
  if (!projectId || !sessionId) return [];
  const project = serverState.projects[projectId];
  if (!project) return [];
  for (const sandbox of Object.values(project.sandboxes)) {
    const session = sandbox.sessions[sessionId];
    if (session) return session.permission ?? [];
  }
  return [];
});

/**
 * Permission rules for the selected agent, including the deprecated `tools`
 * boolean map which the server still honours for backwards compatibility.
 */
const currentAgentPermissionRules = computed<PermissionRule[]>(() => {
  const agent = agents.value.find((entry) => entry.name === selectedMode.value);
  if (!agent) return [];
  return [...rulesFromToolsMap(agent.tools), ...normalizePermissionConfig(agent.permission)];
});

const {
  upsertPermissionEntry,
  removePermissionEntry,
  prunePermissionEntries,
  fetchPendingPermissions,
  permissionSendingById,
  pendingRequests: pendingPermissions,
  findPendingRequestForTool,
  findPendingRequestForSession,
  openToolPermissions,
  handlePermissionReply,
} = usePermissions({
  fw,
  allowedSessionIds,
  activeDirectory,
  ensureConnectionReady,
  globalRules: computed(() => []),
  agentRules: currentAgentPermissionRules,
  sessionRules: currentSessionPermissionRules,
  agentName: computed(() => selectedMode.value),
  sessionId: computed(() => selectedSessionId.value),
});

const pendingPermissionCount = computed(() => pendingPermissions.value.length);

/**
 * Match a thread root to a pending permission request so the error bar can
 * offer inline approval. Falls back to any pending request in the same session.
 */
function resolvePendingPermissionForRoot(root: MessageInfo) {
  const sessionId = root.sessionID;
  if (!sessionId) return null;
  const request =
    findPendingRequestForTool(sessionId, root.id) ?? findPendingRequestForSession(sessionId);
  if (!request) return null;
  return {
    id: request.id,
    permission: request.permission,
    isSubmitting: Boolean(permissionSendingById.value[request.id]),
  };
}

const { upsertQuestionEntry, removeQuestionEntry, pruneQuestionEntries, fetchPendingQuestions } =
  useQuestions({
    fw,
    allowedSessionIds,
    activeDirectory,
    ensureConnectionReady,
    getTextContent: (messageId: string) => msg.getTextContent(messageId) || '',
  });

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
  refreshBranchEntries,
} = useFileTree({ activeDirectory });

const { runOneShotPtyCommand } = usePtyOneshot({ activeDirectory });

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

function ensureConnectionReady(action: string) {
  if (connectionState.value === 'ready' && uiInitState.value === 'ready') return true;
  if (connectionState.value === 'reconnecting') {
    sendStatus.value = `Reconnecting... ${action} is temporarily disabled.`;
  } else if (uiInitState.value === 'loading') {
    sendStatus.value = `Still loading. ${action} is temporarily disabled.`;
  } else {
    sendStatus.value = `Not connected. ${action} is unavailable.`;
  }
  return false;
}

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

function getBundledThemeNames() {
  if (Array.isArray(bundledThemes)) {
    return bundledThemes
      .map((theme) => {
        if (typeof theme === 'string') return theme;
        if (theme && typeof theme === 'object' && 'name' in theme) return String(theme.name ?? '');
        return '';
      })
      .filter((name) => name.length > 0);
  }
  return Object.keys(bundledThemes);
}

function pickShikiTheme(names: string[]) {
  if (names.length === 0) return 'github-dark';
  const preferred = [
    'github-dark',
    'github-dark-dimmed',
    'vitesse-dark',
    'dark-plus',
    'nord',
    'dracula',
    'monokai',
  ];
  for (const theme of preferred) {
    if (names.includes(theme)) return theme;
  }
  const darkMatch = names.find((name) => /dark|night|nord|dracula|monokai/i.test(name));
  return darkMatch ?? names[0];
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

async function createNewClaudeSession(): Promise<void> {
  sessionError.value = '';
  try {
    const directory = activeDirectory.value.trim();
    if (!directory) throw new Error('Active directory is empty.');
    const res = await fetch(serverConfig.claudeApiUrl('/sessions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directory }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      sessionID: string;
      session: {
        id: string;
        projectID: string;
        directory: string;
        title?: string;
        time?: { created?: number; updated?: number };
      };
    };
    if (data?.session?.id) {
      injectClaudeSession(data.session);
      await switchSessionSelection(data.session.projectID, data.session.id);
    }
  } catch (error) {
    sessionError.value = `Claude session create failed: ${toErrorMessage(error)}`;
  }
}

async function handleNewClaudeSessionIn(payload: { worktree: string; directory: string }) {
  sessionError.value = '';
  try {
    const res = await fetch(serverConfig.claudeApiUrl('/sessions'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directory: payload.directory }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      sessionID: string;
      session: {
        id: string;
        projectID: string;
        directory: string;
        title?: string;
        time?: { created?: number; updated?: number };
      };
    };
    if (data?.session?.id) {
      injectClaudeSession(data.session);
      await switchSessionSelection(data.session.projectID, data.session.id);
    }
  } catch (error) {
    sessionError.value = `Claude session create failed: ${toErrorMessage(error)}`;
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

function buildPtyWsUrl(path: string, directory?: string) {
  return opencodeApi.createWsUrl(path, { directory });
}

async function fetchPtyList(directory?: string) {
  const data = await opencodeApi.listPtys(directory);
  if (!Array.isArray(data)) return [] as PtyInfo[];
  return data.map(parsePtyInfo).filter((pty): pty is PtyInfo => Boolean(pty));
}

async function createPtySession(command?: string, args?: string[]) {
  const directory = activeDirectory.value || undefined;
  const data = await opencodeApi.createPty({
    directory,
    command,
    args,
    cwd: directory,
    title: 'Shell',
  });
  return parsePtyInfo(data);
}

async function updatePtySize(ptyId: string, rows: number, cols: number, directory?: string) {
  const data = await opencodeApi.updatePtySize(ptyId, {
    directory,
    rows,
    cols,
  });
  return parsePtyInfo(data);
}

function ensureShellWindow(pty: PtyInfo) {
  if (shellSessionsByPtyId.has(pty.id)) return;
  const key = `shell:${pty.id}`;
  const { width, height } = getTerminalWindowSize();
  const randomPosition = getRandomWindowPosition({ width, height });
  fw.open(key, {
    component: ShellContent,
    props: { shellId: pty.id },
    closable: true,
    resizable: true,
    scroll: 'none',
    color: '#a855f7',
    title: pty.title || 'Shell',
    width,
    height,
    x: randomPosition.x,
    y: randomPosition.y,
    expiry: Infinity,
    onResize: () => scheduleShellFit(pty.id),
  });
  const terminal = new Terminal({
    cols: TERM_COLUMNS,
    rows: TERM_ROWS,
    fontFamily: TERM_FONT_FAMILY,
    fontSize: TERM_FONT_SIZE_PX,
    lineHeight: TERM_LINE_HEIGHT,
    cursorBlink: true,
    theme: {
      background: '#050505',
      foreground: '#e2e8f0',
      cursor: '#e2e8f0',
      selectionBackground: 'rgba(148, 163, 184, 0.3)',
    },
  });
  shellSessionsByPtyId.set(pty.id, {
    pty,
    terminal,
  });
  // Connect WebSocket immediately so the server's buffer replay arrives
  // before a fast-exiting command deletes the session.
  // xterm.js buffers write() calls made before open(), so data is not lost.
  connectShellSocket(pty.id);
  nextTick(() => {
    const host = toolWindowCanvasEl.value?.querySelector(
      `[data-shell-id="${pty.id}"]`,
    ) as HTMLElement | null;
    if (!host) return;
    terminal.open(host);
    // Wait for first paint so xterm has rendered cell dimensions
    requestAnimationFrame(() => {
      resizeWindowToFitTerminal(key, terminal, host);
    });
  });
}

function resizeWindowToFitTerminal(key: string, terminal: Terminal, _host: HTMLElement) {
  const cell = getTerminalCellSize(terminal);
  if (!cell) return;

  // Measure scrollbar width
  const viewport = terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null;
  const scrollbarWidth = viewport ? viewport.offsetWidth - viewport.clientWidth : 0;

  // Terminal content area needed
  const contentWidth = terminal.cols * cell.width + scrollbarWidth;
  const contentHeight = terminal.rows * cell.height;

  // Window chrome from known CSS values (constant-based, not dynamic measurement):
  //   .floating-window         border: 1px * 2 sides = 2px each direction
  //   .floating-window-titlebar height: 22px + border-bottom: 1px = 23px
  //   .floating-window-body    padding: 2px 4px → 4px V, 8px H
  const chromeX = TERM_WINDOW_BORDER_PX + 2 * TERM_INNER_PADDING_X_PX; // 2 + 8 = 10
  const chromeY = TERM_WINDOW_BORDER_PX + TERM_TITLEBAR_HEIGHT_PX + 1 + TERM_INNER_PADDING_Y_PX; // 2 + 22 + 1 + 4 = 29

  const newWidth = Math.ceil(contentWidth + chromeX);
  const newHeight = Math.ceil(contentHeight + chromeY);

  fw.updateOptions(key, { width: newWidth, height: newHeight });

  // Notify server of terminal dimensions
  const session = shellSessionsByPtyId.get(key.replace('shell:', ''));
  if (session) notifyPtySize(session);
}

function scheduleShellFitAll() {
  shellSessionsByPtyId.forEach((_, ptyId) => {
    scheduleShellFit(ptyId);
  });
}

function getTerminalCellSize(terminal: Terminal): { width: number; height: number } | null {
  // Prefer measuring from rendered screen (most accurate)
  const termEl = terminal.element;
  if (termEl && terminal.cols > 0 && terminal.rows > 0) {
    const screen = termEl.querySelector('.xterm-screen');
    if (screen) {
      const rect = screen.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { width: rect.width / terminal.cols, height: rect.height / terminal.rows };
      }
    }
  }
  // Fallback: xterm's internal renderer dimensions
  const core = (terminal as any)._core;
  const dims = core?._renderService?.dimensions?.css?.cell;
  if (dims?.width > 0 && dims?.height > 0) {
    return { width: dims.width, height: dims.height };
  }
  return null;
}

function fitTerminalToContainer(session: ShellSession): boolean {
  const termEl = session.terminal.element;
  if (!termEl?.isConnected) return false;
  const parent = termEl.parentElement;
  if (!parent) return false;
  const parentRect = parent.getBoundingClientRect();
  if (parentRect.width <= 0 || parentRect.height <= 0) return false;

  const cell = getTerminalCellSize(session.terminal);
  if (!cell) return false;

  // Subtract scrollbar width from available horizontal space
  const viewport = termEl.querySelector('.xterm-viewport') as HTMLElement | null;
  const scrollbarWidth = viewport ? viewport.offsetWidth - viewport.clientWidth : 0;

  const cols = Math.max(2, Math.floor((parentRect.width - scrollbarWidth) / cell.width));
  const rows = Math.max(1, Math.floor(parentRect.height / cell.height));
  if (cols !== session.terminal.cols || rows !== session.terminal.rows) {
    session.terminal.resize(cols, rows);
  }
  return true;
}

function notifyPtySize(session: ShellSession) {
  const { rows, cols } = session.terminal;
  if (rows > 0 && cols > 0) {
    const directory = session.pty.cwd || activeDirectory.value || undefined;
    updatePtySize(session.pty.id, rows, cols, directory).catch((error) => {
      log('PTY resize failed', error);
    });
  }
}

function scheduleShellFit(ptyId: string) {
  if (pendingShellFits.has(ptyId)) return;
  pendingShellFits.add(ptyId);
  nextTick(() => {
    pendingShellFits.delete(ptyId);
    const session = shellSessionsByPtyId.get(ptyId);
    if (!session) return;
    const currentSession = session;

    let prevCols = -1;
    let prevRows = -1;
    let attempts = 0;

    function tick() {
      if (attempts >= 30 || !currentSession.terminal.element?.isConnected) {
        notifyPtySize(currentSession);
        return;
      }
      attempts++;
      fitTerminalToContainer(currentSession);
      const { cols, rows } = currentSession.terminal;
      if (cols === prevCols && rows === prevRows) {
        notifyPtySize(currentSession);
        return;
      }
      prevCols = cols;
      prevRows = rows;
      requestAnimationFrame(tick);
    }

    tick();
  });
}

function connectShellSocket(ptyId: string) {
  const session = shellSessionsByPtyId.get(ptyId);
  if (!session) return;
  const directory = session.pty.cwd || activeDirectory.value || undefined;
  const url = buildPtyWsUrl(`/pty/${ptyId}/connect`, directory);
  const socket = new WebSocket(url);
  session.socket = socket;
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', (event) => {
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data);
      if (bytes.length > 0 && bytes[0] === 0) {
        const json = ptyMetaDecoder.decode(bytes.subarray(1));
        try {
          const meta = JSON.parse(json) as { cursor?: unknown };
          if (
            typeof meta.cursor === 'number' &&
            Number.isSafeInteger(meta.cursor) &&
            meta.cursor >= 0
          ) {
            return;
          }
        } catch {
          return;
        }
        return;
      }
      session.terminal.write(bytes);
      return;
    }
    if (typeof event.data === 'string') {
      const trimmed = event.data.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const meta = JSON.parse(trimmed) as { cursor?: unknown } & Record<string, unknown>;
          const keys = Object.keys(meta);
          if (
            keys.length === 1 &&
            keys[0] === 'cursor' &&
            typeof meta.cursor === 'number' &&
            Number.isSafeInteger(meta.cursor) &&
            meta.cursor >= 0
          ) {
            return;
          }
        } catch {
          // fall through to terminal output
        }
      }
      session.terminal.write(event.data);
    }
  });
  socket.addEventListener('open', () => {
    // focus() requires the terminal to be mounted; defer if not yet attached.
    if (session.terminal.element) {
      session.terminal.focus();
    } else {
      nextTick(() => session.terminal.focus());
    }
  });
  session.terminal.onData((data) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  });
  socket.addEventListener('close', () => {
    if (session.exiting) {
      setTimeout(() => removeShellWindow(ptyId), SHELL_LINGER_MS);
    }
  });
}

function removeShellWindow(ptyId: string, options?: { kill?: boolean }) {
  const session = shellSessionsByPtyId.get(ptyId);
  if (!session) return;
  pendingShellFits.delete(ptyId);
  session.socket?.close();
  session.terminal.dispose();
  shellSessionsByPtyId.delete(ptyId);
  shellExitWaiters.delete(ptyId);
  fw.close(`shell:${ptyId}`);
  if (options?.kill) {
    const directory = session.pty.cwd || activeDirectory.value || undefined;
    opencodeApi.deletePty(ptyId, directory).catch((error) => {
      log('PTY delete failed', error);
    });
  }
}

function lingerAndRemoveShellWindow(ptyId: string) {
  const session = shellSessionsByPtyId.get(ptyId);
  if (!session || session.exiting) return;
  session.exiting = true;
  session.terminal.options.cursorBlink = false;
  // If socket is already closed, start linger timer immediately.
  // Otherwise the socket 'close' handler starts it after all data is flushed.
  if (!session.socket || session.socket.readyState >= WebSocket.CLOSING) {
    setTimeout(() => removeShellWindow(ptyId), SHELL_LINGER_MS);
  }
}

function handleFloatingWindowClose(key: string) {
  if (key.startsWith('shell:')) {
    const ptyId = key.slice('shell:'.length);
    removeShellWindow(ptyId, { kill: true });
    return;
  }
  void fw.close(key);
}

function disposeShellWindows() {
  const ids = Array.from(shellSessionsByPtyId.keys());
  ids.forEach((ptyId) => removeShellWindow(ptyId));
}

let shellDirectory = '';

async function restoreShellSessions() {
  const directory = activeDirectory.value || '';
  const sandboxChanged = directory !== shellDirectory;
  shellDirectory = directory;
  if (sandboxChanged) {
    disposeShellWindows();
  }
  try {
    const ptys = await fetchPtyList(directory || undefined);
    ptys.forEach((pty) => {
      if (pty.status === 'exited') return;
      if (pty.title === 'One-shot PTY' || pty.title === 'Commit Snapshot') return;
      ensureShellWindow(pty);
    });
  } catch (error) {
    log('PTY restore failed', error);
  }
}

async function openShellFromInput(input: string) {
  const script = input.trim();
  const hasCommand = script.length > 0;
  const pty = hasCommand
    ? await createPtySession('/bin/sh', ['-c', script])
    : await createPtySession();
  if (!pty) return;
  ensureShellWindow(pty);
  if (!hasCommand) return;
  const session = shellSessionsByPtyId.get(pty.id);
  if (session) session.closeOnSuccess = true;
}

async function runTreeShellCommand(command: string) {
  const script = command.trim();
  if (!script) return;
  const pty = await createPtySession('/bin/sh', ['-c', script]);
  if (!pty) return;
  ensureShellWindow(pty);
  const session = shellSessionsByPtyId.get(pty.id);
  if (session) session.closeOnSuccess = true;
  const exitCode = await new Promise<number>((resolve) => {
    shellExitWaiters.set(pty.id, resolve);
  });
  if (exitCode === 0) {
    void refreshGitStatus();
    void refreshBranchEntries();
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

const DEBUG_SUBCOMMANDS: Record<string, string> = {
  session: 'Show session graph tree',
  notification: 'Dump pending notification state',
};

function formatSessionGraphDump(): string {
  const lines: string[] = [];

  const allProjects = Object.values(serverState.projects).sort((a, b) =>
    a.worktree === b.worktree ? a.id.localeCompare(b.id) : a.worktree.localeCompare(b.worktree),
  );
  const totalSessions = allProjects.reduce((count, project) => {
    return (
      count +
      Object.values(project.sandboxes).reduce((projectCount, sandbox) => {
        return projectCount + Object.keys(sandbox.sessions).length;
      }, 0)
    );
  }, 0);

  lines.push('Project Tree (worker-state)');
  lines.push(`  projects: ${allProjects.length}  sessions(total): ${totalSessions}`);
  lines.push('');

  function fmtTime(ts?: number) {
    if (!ts) return '-';
    return new Date(ts).toLocaleString();
  }

  function fmtStatus(s: string) {
    if (s === 'busy') return '[BUSY]';
    if (s === 'retry') return '[RETRY]';
    if (s === 'idle') return '[idle]';
    return `[${s}]`;
  }

  for (const project of allProjects) {
    lines.push(`PROJECT ${project.id}`);
    lines.push(`  worktree: ${project.worktree || '-'}`);
    if (project.name) lines.push(`  name: ${project.name}`);
    if (project.icon?.color) lines.push(`  color: ${project.icon.color}`);
    lines.push(
      `  time: created=${fmtTime(project.time?.created)} updated=${fmtTime(project.time?.updated)} initialized=${fmtTime(project.time?.initialized)}`,
    );

    const sandboxEntries = Object.entries(project.sandboxes).sort(([a], [b]) => a.localeCompare(b));
    if (sandboxEntries.length === 0) {
      lines.push('  (no sandboxes)');
      lines.push('');
      continue;
    }

    for (let si = 0; si < sandboxEntries.length; si++) {
      const [sandboxDirectory, sandbox] = sandboxEntries[si];
      const isLastSandbox = si === sandboxEntries.length - 1;
      const sConnector = isLastSandbox ? '└── ' : '├── ';
      const sPrefix = isLastSandbox ? '    ' : '│   ';

      const branchMeta = sandbox.name ? `  (branch: ${sandbox.name})` : '';
      lines.push(`${sConnector}SANDBOX ${sandboxDirectory}${branchMeta}`);
      lines.push(`${sPrefix}rootSessions: [${sandbox.rootSessions.join(', ')}]`);

      const sessions = Object.values(sandbox.sessions).sort((a, b) => {
        const aTime = a.timeUpdated ?? a.timeCreated ?? 0;
        const bTime = b.timeUpdated ?? b.timeCreated ?? 0;
        return bTime - aTime;
      });

      if (sessions.length === 0) {
        lines.push(`${sPrefix}(no sessions)`);
        continue;
      }

      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        const isLastSession = i === sessions.length - 1;
        const sessionConnector = isLastSession ? '└── ' : '├── ';
        const sessionPrefix = `${sPrefix}${isLastSession ? '    ' : '│   '}`;
        const status = fmtStatus(session.status ?? 'unknown');
        const title = session.title ? `  "${session.title}"` : '';
        const slug = session.slug ? `  slug=${session.slug}` : '';
        lines.push(`${sPrefix}${sessionConnector}${session.id}  ${status}${title}${slug}`);
        const revertLabel = session.revert
          ? `msg=${session.revert.messageID}${session.revert.partID ? ` part=${session.revert.partID}` : ''}`
          : '-';
        lines.push(
          `${sessionPrefix}dir=${session.directory || sandboxDirectory}  parent=${session.parentID || '(root)'}  archived=${fmtTime(session.timeArchived)}  revert=${revertLabel}`,
        );
        lines.push(
          `${sessionPrefix}created=${fmtTime(session.timeCreated)}  updated=${fmtTime(session.timeUpdated)}`,
        );
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function openDebugSessionViewer() {
  const key = 'debug:session-graph';
  const content = formatSessionGraphDump();
  const pos = getFileViewerPosition(0.12, 0.08);
  if (fw.has(key)) fw.close(key);
  fw.open(key, {
    component: ContentViewer,
    props: {
      fileContent: content,
      lang: 'text',
      gutterMode: 'none',
      theme: shikiTheme.value,
    },
    closable: true,
    resizable: true,
    focusOnOpen: true,
    scroll: 'manual',
    title: 'Debug: Session Graph',
    x: pos.x,
    y: pos.y,
    width: FILE_VIEWER_WINDOW_WIDTH,
    height: FILE_VIEWER_WINDOW_HEIGHT,
    expiry: Infinity,
  });
}

function formatNotificationDump(): string {
  const lines: string[] = [];
  const map = serverState.notifications;
  const order = notificationSessionOrder.value;
  const parentMap = sessionParentById.value;

  lines.push(`Notification State`);
  lines.push(`  pendingNotificationsBySessionId: ${Object.keys(map).length} session(s)`);
  lines.push(`  notificationSessionOrder: [${order.length}] ${order.join(', ') || '(empty)'}`);
  lines.push(`  selectedSessionId: ${selectedSessionId.value || '(none)'}`);
  lines.push(`  allowedSessionIds: [${allowedSessionIds.value.size}]`);
  lines.push('');

  // Computed notificationSessions (what TopPanel sees)
  const computed = notificationSessions.value;
  lines.push(
    `Computed notificationSessions (TopPanel badge): ${computed.length} entry(s), total count = ${computed.reduce((s, e) => s + e.count, 0)}`,
  );
  for (const entry of computed) {
    const session = sessions.value.find((s) => s.id === entry.sessionId);
    const label = session ? sessionLabel(session) : '(unknown session)';
    const parentId = parentMap.get(entry.sessionId);
    const parentInfo = parentId ? ` parent=${parentId}` : ' (root)';
    lines.push(`  ${entry.sessionId}  count=${entry.count}  "${label}"${parentInfo}`);
  }
  lines.push('');

  // Full map dump
  lines.push(`Full pendingNotificationsBySessionId:`);
  if (Object.keys(map).length === 0) {
    lines.push('  (empty)');
  }
  for (const entry of Object.values(map)) {
    const projectId = entry.projectId;
    const sessionId = entry.sessionId;
    const session = sessions.value.find((s) => s.id === sessionId);
    const label = session ? sessionLabel(session) : '(unknown session)';
    const parentId = parentMap.get(sessionId);
    const parentInfo = parentId ? ` parent=${parentId}` : ' (root)';
    const isAllowed = allowedSessionIds.value.has(sessionId);
    const isSelected = sessionId === selectedSessionId.value;
    const flags: string[] = [];
    if (isSelected) flags.push('SELECTED');
    if (isAllowed) flags.push('ALLOWED');
    if (parentId) flags.push('CHILD');
    const flagStr = flags.length > 0 ? `  [${flags.join(', ')}]` : '';
    lines.push(`  ${projectId}:${sessionId}  "${label}"${parentInfo}${flagStr}`);
    for (const requestId of entry.requestIds) {
      const isIdle = requestId.startsWith('idle:');
      const type = isIdle ? 'idle' : 'permission/question';
      lines.push(`    - ${requestId}  (${type})`);
    }
  }
  lines.push('');

  // Order vs Map consistency check
  const mapKeys = Object.keys(map);
  const orphanedInOrder = order.filter((id) => !mapKeys.includes(id));
  const missingFromOrder = mapKeys.filter((id) => !order.includes(id));
  if (orphanedInOrder.length > 0 || missingFromOrder.length > 0) {
    lines.push(`Consistency Issues:`);
    if (orphanedInOrder.length > 0) {
      lines.push(`  In notificationSessionOrder but NOT in map: ${orphanedInOrder.join(', ')}`);
    }
    if (missingFromOrder.length > 0) {
      lines.push(`  In map but NOT in notificationSessionOrder: ${missingFromOrder.join(', ')}`);
    }
    lines.push('');
  }

  // Pending permissions & questions currently shown as floating windows
  const permissionEntries = fw.entries.value.filter((e) => e.key.startsWith('permission:'));
  const questionEntries = fw.entries.value.filter((e) => e.key.startsWith('question:'));
  lines.push(`Active Floating Windows:`);
  lines.push(`  Permission windows: ${permissionEntries.length}`);
  for (const entry of permissionEntries) {
    const req = entry.props?.request as { id?: string; sessionID?: string } | undefined;
    lines.push(`    - ${entry.key}  session=${req?.sessionID ?? '?'}  request=${req?.id ?? '?'}`);
  }
  lines.push(`  Question windows: ${questionEntries.length}`);
  for (const entry of questionEntries) {
    const req = entry.props?.request as { id?: string; sessionID?: string } | undefined;
    lines.push(`    - ${entry.key}  session=${req?.sessionID ?? '?'}  request=${req?.id ?? '?'}`);
  }

  return lines.join('\n');
}

function openDebugNotificationViewer() {
  const key = 'debug:notification';
  const content = formatNotificationDump();
  const pos = getFileViewerPosition(0.15, 0.1);
  if (fw.has(key)) fw.close(key);
  fw.open(key, {
    component: ContentViewer,
    props: {
      fileContent: content,
      lang: 'text',
      gutterMode: 'none',
      theme: shikiTheme.value,
    },
    closable: true,
    resizable: true,
    focusOnOpen: true,
    scroll: 'manual',
    title: 'Debug: Notifications',
    x: pos.x,
    y: pos.y,
    width: FILE_VIEWER_WINDOW_WIDTH,
    height: FILE_VIEWER_WINDOW_HEIGHT,
    expiry: Infinity,
  });
}

function runDebugCommand(args: string): { ok: boolean; message: string } {
  const sub = args.trim().toLowerCase();
  if (!sub || sub === 'help') {
    const lines = ['Available /debug subcommands:'];
    for (const [name, desc] of Object.entries(DEBUG_SUBCOMMANDS)) {
      lines.push(`  ${name} — ${desc}`);
    }
    return { ok: true, message: lines.join('\n') };
  }
  if (sub === 'session' || sub === 'sessions') {
    openDebugSessionViewer();
    return { ok: true, message: 'Session graph opened.' };
  }
  if (sub === 'notification' || sub === 'notifications') {
    openDebugNotificationViewer();
    return { ok: true, message: 'Notification dump opened.' };
  }
  return { ok: false, message: `Unknown debug subcommand: ${sub}. Type /debug help for a list.` };
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
      const rawId = rawSessionId(sessionId);
      const res = await fetch(serverConfig.claudeApiUrl(`/sessions/${rawId}/prompt`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directory, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Claude prompt failed (${res.status}): ${body}`);
      }
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
  allowedSessionIds,
  () => {
    prunePermissionEntries();
    pruneQuestionEntries();
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

const shikiTheme = ref('github-dark');

const TOOL_RENDERER_READ_EVENT_TYPES = new Set(['session.diff', 'file.edited']);

const TOOL_RENDERER_WRITE_EVENT_TYPES = new Set<string>([]);

const TOOL_RENDERER_MESSAGE_EVENTS = new Set([
  'message.updated',
  'message.part.updated',
  'message.removed',
  'message.part.removed',
]);

const toolRendererReadTypesKey = `FILE_${'READ'}_EVENT_TYPES`;
const toolRendererWriteTypesKey = `FILE_${'WRITE'}_EVENT_TYPES`;
const toolRendererMessageTypesKey = `MESSAGE_${'EVENT_TYPES'}`;

const toolRendererHelpers = {
  [toolRendererReadTypesKey]: TOOL_RENDERER_READ_EVENT_TYPES,
  [toolRendererWriteTypesKey]: TOOL_RENDERER_WRITE_EVENT_TYPES,
  [toolRendererMessageTypesKey]: TOOL_RENDERER_MESSAGE_EVENTS,
  parsePatchTextBlocks,
  guessLanguage: guessLanguageFromPath,
  shouldRenderToolWindow,
  extractToolOutputText: parseToolOutputText,
  formatToolValue,
  renderWorkerHtml,
  renderReadHtmlFromApi,
  resolveReadWritePath,
  guessLanguageFromPath,
  resolveReadRange,
  renderEditDiffHtml,
  formatGlobToolTitle,
  formatListToolTitle,
  formatWebfetchToolTitle,
  formatQueryToolTitle,
  formatTaskToolOutput,
  GrepContent,
  GlobContent,
  WebContent,
};

watch(selectedSessionId, reloadSelectedSessionState, { immediate: true });

function formatToolValue(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseToolOutputText(output: unknown) {
  if (output === undefined) return undefined;
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') {
    const outputRecord = output as Record<string, unknown>;
    const outputContent =
      (outputRecord.content as string | undefined) ??
      (outputRecord.text as string | undefined) ??
      (outputRecord.body as string | undefined) ??
      (outputRecord.result as string | undefined);
    if (typeof outputContent === 'string') return outputContent;
    const stdout = outputRecord.stdout;
    const stderr = outputRecord.stderr;
    const parts: string[] = [];
    if (typeof stdout === 'string' && stdout.length > 0) parts.push(stdout);
    if (typeof stderr === 'string' && stderr.length > 0) parts.push(stderr);
    if (parts.length > 0) return parts.join('\n');
  }
  return formatToolValue(output);
}

function formatTaskToolOutput(value: string) {
  return value
    .split('\n')
    .filter((line) => !/^task_id:\s*/i.test(line.trim()))
    .join('\n')
    .replace(/<\/?task_result>/gi, '')
    .trim();
}

function decodeApiTextContent(data: FileContentResponse) {
  const encoding = typeof data?.encoding === 'string' ? data.encoding : 'utf-8';
  const content = typeof data?.content === 'string' ? data.content : '';
  if (!content) return '';
  if (encoding !== 'base64') return content;

  const bytes = toUint8ArrayFromBase64(content);
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return atob(content);
  }
}

async function renderReadHtmlFromApi(params: {
  callId?: string;
  path?: string;
  lang: string;
  lineOffset?: number;
  lineLimit?: number;
  fallbackText?: string;
}): Promise<string> {
  const renderText = (text: string, gutterMode: 'none' | 'single' = 'none') =>
    renderWorkerHtml({
      id: `read-${params.callId ?? 'unknown'}-${Date.now().toString(36)}`,
      code: text,
      lang: 'text',
      theme: 'github-dark',
      gutterMode,
    });

  const directory = activeDirectory.value.trim();
  if (!directory) return renderText('No active directory selected for READ window.');
  if (!params.path) return renderText('READ path is missing in tool payload.');

  const requestPath = splitFileContentDirectoryAndPath(params.path, directory);

  try {
    const listData = await opencodeApi.listFiles({
      directory: requestPath.directory,
      path: requestPath.path,
    });
    if (Array.isArray(listData) && listData.length > 0) {
      const entries = listData
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as FileNode;
          const name = record.name ?? record.path?.split('/').pop();
          if (!name) return null;
          return record.type === 'directory' ? `${name}/` : name;
        })
        .filter((entry): entry is string => Boolean(entry));
      const code = entries.length > 0 ? entries.join('\n') : '(empty directory)';
      return renderText(code, 'none');
    }
  } catch {
    // Not a directory, or listing failed — proceed to read as file content.
  }

  try {
    const data = (await opencodeApi.readFileContent({
      directory: requestPath.directory,
      path: requestPath.path,
    })) as FileContentResponse;
    const type = data?.type === 'binary' ? 'binary' : 'text';

    if (type === 'binary') {
      return renderText(`Binary file: ${params.path}\nPreview is not available.`, 'none');
    }

    const code = decodeApiTextContent(data);
    return renderWorkerHtml({
      id: `read-${params.callId ?? 'unknown'}-${Date.now().toString(36)}`,
      code,
      lang: params.lang,
      theme: 'github-dark',
      gutterMode: 'single',
      lineOffset: params.lineOffset,
      lineLimit: params.lineLimit,
    });
  } catch (error) {
    if (params.fallbackText) {
      return renderWorkerHtml({
        id: `read-${params.callId ?? 'unknown'}-${Date.now().toString(36)}`,
        code: params.fallbackText,
        lang: params.lang,
        theme: 'github-dark',
        gutterMode: 'single',
        lineOffset: params.lineOffset,
        lineLimit: params.lineLimit,
      });
    }
    return renderText(`Failed to load: ${params.path ?? 'unknown file'}`);
  }
}

function renderEditDiffHtml(params: {
  diff: string;
  code?: string;
  after?: string;
  lang: string;
}): () => Promise<string> {
  return () =>
    renderWorkerHtml({
      id: `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      code: params.code ?? '',
      after: params.after,
      patch: params.diff,
      lang: params.lang,
      theme: 'github-dark',
      gutterMode: 'double',
    });
}

const TOOL_WINDOW_HIDDEN = new Set([
  'question',
  'todoread',
  'todowrite',
  'lsp',
  'plan_enter',
  'plan_exit',
  'task',
]);
const TOOL_WINDOW_SUPPORTED = new Set([
  'apply_patch',
  'bash',
  'codesearch',
  'edit',
  'glob',
  'grep',
  'list',
  'multiedit',
  'read',
  'task',
  'webfetch',
  'websearch',
  'write',
]);

function shouldRenderToolWindow(tool: string) {
  return !TOOL_WINDOW_HIDDEN.has(tool) && TOOL_WINDOW_SUPPORTED.has(tool);
}

function parsePatchTextBlocks(patchText: string) {
  const lines = patchText.split('\n');
  const blocks: Array<{ path?: string; content: string }> = [];
  let currentPath: string | undefined;
  let currentKind: 'update' | 'add' | 'delete' | undefined;
  let currentLines: string[] = [];

  const pushCurrent = () => {
    if (!currentPath || currentLines.length === 0) {
      currentPath = undefined;
      currentKind = undefined;
      currentLines = [];
      return;
    }
    blocks.push({
      path: currentPath,
      content: currentLines.join('\n').trim(),
    });
    currentPath = undefined;
    currentKind = undefined;
    currentLines = [];
  };

  const startFileBlock = (kind: 'update' | 'add' | 'delete', path: string) => {
    pushCurrent();
    currentPath = path.trim();
    currentKind = kind;
    currentLines = [`diff --git a/${currentPath} b/${currentPath}`];
    if (kind === 'add') {
      currentLines.push('--- /dev/null');
      currentLines.push(`+++ b/${currentPath}`);
    } else if (kind === 'delete') {
      currentLines.push(`--- a/${currentPath}`);
      currentLines.push('+++ /dev/null');
    } else {
      currentLines.push(`--- a/${currentPath}`);
      currentLines.push(`+++ b/${currentPath}`);
    }
  };

  for (const line of lines) {
    if (line.startsWith('*** Update File: ')) {
      startFileBlock('update', line.replace('*** Update File: ', ''));
      continue;
    }
    if (line.startsWith('*** Add File: ')) {
      startFileBlock('add', line.replace('*** Add File: ', ''));
      continue;
    }
    if (line.startsWith('*** Delete File: ')) {
      startFileBlock('delete', line.replace('*** Delete File: ', ''));
      continue;
    }
    if (line.startsWith('*** Move to: ') && currentPath && currentKind === 'update') {
      const moveTo = line.replace('*** Move to: ', '').trim();
      currentLines.push(`rename from ${currentPath}`);
      currentLines.push(`rename to ${moveTo}`);
      currentPath = moveTo;
      continue;
    }
    if (!currentPath) continue;
    if (
      line.startsWith('@@') ||
      line.startsWith('+') ||
      line.startsWith('-') ||
      line.startsWith(' ') ||
      line.startsWith('\\')
    ) {
      currentLines.push(line);
    }
  }

  pushCurrent();
  return blocks;
}

async function openGitDiff(payload: { path: string; staged: boolean }) {
  const { path, staged } = payload;
  const key = `git-diff:${staged ? 'staged' : 'changes'}:${path}`;
  if (fw.has(key)) {
    fw.bringToFront(key);
    return;
  }

  const mode = staged ? 'staged' : 'unstaged';
  const pos = getFileViewerPosition();
  await fw.open(key, {
    content: `Loading ${mode} diff for ${path}...`,
    lang: 'text',
    variant: 'plain',
    closable: true,
    resizable: true,
    focusOnOpen: true,
    scroll: 'manual',
    title: `${path} (${mode})`,
    x: pos.x,
    y: pos.y,
    width: FILE_VIEWER_WINDOW_WIDTH,
    height: FILE_VIEWER_WINDOW_HEIGHT,
    expiry: Infinity,
  });

  try {
    const output = await runOneShotPtyCommand('bash', [
      '--noprofile',
      '--norc',
      '-c',
      FILE_SNAPSHOT_SCRIPT,
      '_',
      mode,
      path,
    ]);
    const snapshot = parseFileSnapshotOutput(output);
    if (!fw.has(key)) return;
    await fw.open(key, {
      component: DiffViewer,
      props: {
        path,
        isDiff: true,
        diffCode: snapshot.before,
        diffAfter: snapshot.after,
        diffCodeBase64: snapshot.beforeBase64,
        diffAfterBase64: snapshot.afterBase64,
        gutterMode: 'double',
        lang: guessLanguageFromPath(path),
        theme: shikiTheme.value,
      },
      closable: true,
      resizable: true,
      focusOnOpen: true,
      scroll: 'manual',
      title: `${path} (${mode})`,
      x: pos.x,
      y: pos.y,
      width: FILE_VIEWER_WINDOW_WIDTH,
      height: FILE_VIEWER_WINDOW_HEIGHT,
      expiry: Infinity,
    });
  } catch (error) {
    log('File snapshot failed', error);
    if (fw.has(key)) {
      await fw.close(key);
    }
  }
}

async function openAllGitDiff(mode: WorktreeSnapshotMode = 'all') {
  const key = `git-diff:${mode}`;
  if (fw.has(key)) {
    fw.bringToFront(key);
    return;
  }

  const pos = getFileViewerPosition();
  await fw.open(key, {
    content: 'Loading all changes...',
    lang: 'text',
    variant: 'plain',
    closable: true,
    resizable: true,
    focusOnOpen: true,
    scroll: 'manual',
    title: 'Loading...',
    x: pos.x,
    y: pos.y,
    width: FILE_VIEWER_WINDOW_WIDTH,
    height: FILE_VIEWER_WINDOW_HEIGHT,
    expiry: Infinity,
  });

  try {
    const output = await runOneShotPtyCommand('bash', [
      '--noprofile',
      '--norc',
      '-c',
      buildWorktreeSnapshotScript(mode),
    ]);
    const snapshot = parseCommitSnapshotOutput(output);
    if (snapshot.files.length === 0) {
      throw new Error('no files parsed from working tree snapshot');
    }
    if (!fw.has(key)) return;

    const first = snapshot.files[0];
    const title =
      snapshot.files.length === 1 ? first.file : `${snapshot.files.length} files changed`;
    const diffTabs =
      snapshot.files.length > 1
        ? snapshot.files.map((entry) => ({
            file: entry.file,
            before: entry.before,
            after: entry.after,
            beforeBase64: entry.beforeBase64,
            afterBase64: entry.afterBase64,
          }))
        : undefined;

    await fw.open(key, {
      component: DiffViewer,
      props: {
        path: first.file,
        isDiff: true,
        diffCode: first.before,
        diffAfter: first.after,
        diffCodeBase64: first.beforeBase64,
        diffAfterBase64: first.afterBase64,
        diffTabs,
        gutterMode: 'double',
        lang: snapshot.files.length === 1 ? guessLanguageFromPath(first.file) : 'text',
        theme: shikiTheme.value,
      },
      title,
      closable: true,
      resizable: true,
      focusOnOpen: true,
      scroll: 'manual',
      x: pos.x,
      y: pos.y,
      width: FILE_VIEWER_WINDOW_WIDTH,
      height: FILE_VIEWER_WINDOW_HEIGHT,
      expiry: Infinity,
    });
  } catch (error) {
    log('Working tree snapshot failed', error);
    if (fw.has(key)) {
      await fw.close(key);
    }
  }
}

function handleShowMessageDiff(payload: { messageKey: string; diffs: Array<MessageDiffEntry> }) {
  const { messageKey, diffs } = payload;
  if (!diffs || diffs.length === 0) return;
  const key = `message-diff:${messageKey}`;
  if (fw.has(key)) {
    fw.bringToFront(key);
    return;
  }
  const hasBeforeAfter = diffs.some(
    (d) => typeof d.before === 'string' && typeof d.after === 'string',
  );
  const combinedDiff = hasBeforeAfter ? '' : diffs.map((d) => d.diff).join('\n');
  const fileCount = diffs.length;
  const title = fileCount === 1 ? diffs[0].file : `${fileCount} files changed`;
  const firstFile = diffs[0]?.file ?? '';

  let diffTabs: Array<{ file: string; before: string; after: string }> | undefined;
  if (hasBeforeAfter && fileCount > 1) {
    diffTabs = diffs
      .filter((d) => typeof d.before === 'string' && typeof d.after === 'string')
      .map((d) => ({
        file: d.file,
        before: d.before!,
        after: d.after!,
      }));
  }

  const pos = getFileViewerPosition();
  fw.open(key, {
    component: DiffViewer,
    props: {
      path: firstFile,
      isDiff: true,
      diffCode: hasBeforeAfter ? (diffs[0]?.before ?? '') : '',
      diffAfter: hasBeforeAfter ? (diffs[0]?.after ?? '') : undefined,
      diffPatch: hasBeforeAfter ? undefined : combinedDiff,
      diffTabs,
      gutterMode: hasBeforeAfter ? 'double' : 'none',
      lang: fileCount === 1 ? guessLanguageFromPath(firstFile) : 'text',
      theme: shikiTheme.value,
    },
    closable: true,
    resizable: true,
    focusOnOpen: true,
    scroll: 'manual',
    title,
    x: pos.x,
    y: pos.y,
    width: FILE_VIEWER_WINDOW_WIDTH,
    height: FILE_VIEWER_WINDOW_HEIGHT,
    expiry: Infinity,
  });
}

async function handleShowCommit(hashRaw: string) {
  const hash = hashRaw.trim();
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) return;
  const key = `commit-diff:${hash}`;
  if (fw.has(key)) {
    fw.bringToFront(key);
    return;
  }

  const pos = getFileViewerPosition();
  await fw.open(key, {
    content: `Loading commit ${hash}...`,
    lang: 'text',
    variant: 'plain',
    closable: true,
    resizable: true,
    focusOnOpen: true,
    scroll: 'manual',
    title: `commit ${hash}`,
    x: pos.x,
    y: pos.y,
    width: FILE_VIEWER_WINDOW_WIDTH,
    height: FILE_VIEWER_WINDOW_HEIGHT,
    expiry: Infinity,
  });

  try {
    const output = await runOneShotPtyCommand('bash', [
      '--noprofile',
      '--norc',
      '-c',
      COMMIT_SNAPSHOT_SCRIPT,
      '_',
      hash,
    ]);
    const snapshot = parseCommitSnapshotOutput(output);
    if (snapshot.files.length === 0) {
      throw new Error('no files parsed from commit snapshot');
    }
    if (!fw.has(key)) return;

    const first = snapshot.files[0];
    const title =
      snapshot.title ||
      (snapshot.files.length === 1 ? first.file : `${snapshot.files.length} files changed`);
    const diffTabs =
      snapshot.files.length > 1
        ? snapshot.files.map((entry) => ({
            file: entry.file,
            before: entry.before,
            after: entry.after,
            beforeBase64: entry.beforeBase64,
            afterBase64: entry.afterBase64,
          }))
        : undefined;

    await fw.open(key, {
      component: DiffViewer,
      props: {
        path: first.file,
        isDiff: true,
        diffCode: first.before,
        diffAfter: first.after,
        diffCodeBase64: first.beforeBase64,
        diffAfterBase64: first.afterBase64,
        diffTabs,
        gutterMode: 'double',
        lang: snapshot.files.length === 1 ? guessLanguageFromPath(first.file) : 'text',
        theme: shikiTheme.value,
      },
      title,
      closable: true,
      resizable: true,
      focusOnOpen: true,
      scroll: 'manual',
      x: pos.x,
      y: pos.y,
      width: FILE_VIEWER_WINDOW_WIDTH,
      height: FILE_VIEWER_WINDOW_HEIGHT,
      expiry: Infinity,
    });
  } catch (error) {
    log('Commit snapshot failed', error);
    if (fw.has(key)) {
      await fw.close(key);
    }
  }
}

function openToolPartAsWindow(
  toolPart: ToolPart,
  overrides?: Record<string, unknown>,
  keyPrefix?: string,
): string[] {
  const openedKeys: string[] = [];
  const payload = {
    type: 'message.part.updated',
    payload: {
      type: 'message.part.updated',
      properties: { part: toolPart },
    },
  };

  const patchEvents = extractToolPatch(payload, toolRendererHelpers as any);
  if (patchEvents) {
    patchEvents.forEach((patchEvent: any, index: number) => {
      const rawId = patchEvent.callId ?? `apply_patch:${index}`;
      const key = keyPrefix ? `${keyPrefix}${rawId}` : rawId;
      const patchLang = patchEvent.lang ?? 'text';
      fw.open(key, {
        content: renderEditDiffHtml({
          diff: '',
          code: patchEvent.code,
          after: patchEvent.after,
          lang: patchLang,
        }),
        variant: 'diff',
        status:
          patchEvent.toolStatus === 'running' ||
          patchEvent.toolStatus === 'completed' ||
          patchEvent.toolStatus === 'error'
            ? patchEvent.toolStatus
            : undefined,
        title: patchEvent.title,
        color: toolColor(patchEvent.toolName),
        ...overrides,
      });
      openedKeys.push(key);
    });
    return openedKeys;
  }

  const fileReadResult = extractToolFileRead(
    payload,
    'message.part.updated',
    toolRendererHelpers as any,
  );
  const fileReads = fileReadResult
    ? Array.isArray(fileReadResult)
      ? fileReadResult
      : [fileReadResult]
    : null;
  if (!fileReads) return openedKeys;
  fileReads.forEach((entry: any) => {
    if (entry.callId) {
      const { callId, toolName, toolStatus, ...rest } = entry;
      const key = keyPrefix ? `${keyPrefix}${callId}` : callId;
      fw.open(key, {
        ...rest,
        status:
          toolStatus === 'running' || toolStatus === 'completed' || toolStatus === 'error'
            ? toolStatus
            : undefined,
        color: toolColor(toolName),
        ...overrides,
      });
      openedKeys.push(key);
    }
  });
  return openedKeys;
}

const historyToolWindowKeys = new Set<string>();

function closeHistoryToolWindows() {
  for (const key of historyToolWindowKeys) {
    fw.close(key);
  }
  historyToolWindowKeys.clear();
}

function handleOpenHistoryTool(payload: { part: ToolPart }) {
  closeHistoryToolWindows();
  const { width, height } = fw.getExtent();
  const winW = 600;
  const winH = 400;
  const x = Math.max(0, Math.round((width - winW) / 2));
  const y = Math.max(0, Math.round((height - winH) / 2));
  const keys = openToolPartAsWindow(
    payload.part,
    {
      closable: true,
      resizable: true,
      focusOnOpen: true,
      expiry: Infinity,
      scroll: 'manual',
      x,
      y,
    },
    'history-tool:',
  );
  for (const key of keys) historyToolWindowKeys.add(key);
}

function handleOpenHistoryReasoning(payload: { part: ReasoningPart }) {
  closeHistoryToolWindows();
  const { width, height } = fw.getExtent();
  const winW = 600;
  const winH = 400;
  const x = Math.max(0, Math.round((width - winW) / 2));
  const y = Math.max(0, Math.round((height - winH) / 2));
  const key = `history-reasoning:${payload.part.id}`;
  historyToolWindowKeys.add(key);
  fw.open(key, {
    component: ReasoningContent,
    props: {
      entries: [{ id: payload.part.id, text: payload.part.text }],
      theme: 'github-dark',
    },
    title: '🤔 Thought',
    scroll: 'manual',
    closable: true,
    resizable: true,
    focusOnOpen: true,
    color: '#8b5cf6',
    variant: 'message',
    expiry: Infinity,
    width: winW,
    height: winH,
    x,
    y,
  });
}

type ThreadHistoryEntry =
  | { key: string; kind: 'message'; content: string; time: number; agent?: string }
  | { key: string; kind: 'tool'; part: ToolPart; time: number }
  | { key: string; kind: 'reasoning'; part: ReasoningPart; time: number }
  | {
      key: string;
      kind: 'question';
      questions: QuestionInfo[];
      status: 'pending' | 'replied' | 'rejected';
      answers?: string[][];
      time: number;
    };

function handleShowThreadHistory(payload: { entries: ThreadHistoryEntry[] }) {
  const entries = payload.entries;
  const key = 'thread-history';
  if (fw.has(key)) {
    fw.updateOptions(key, { props: { entries } });
    fw.bringToFront(key);
    return;
  }
  const { width, height } = fw.getExtent();
  const winW = 720;
  const winH = 520;
  const x = Math.max(0, Math.round((width - winW) / 2));
  const y = Math.max(0, Math.round((height - winH) / 2));
  fw.open(key, {
    component: ThreadHistoryContent,
    props: {
      entries,
      theme: shikiTheme.value,
      onToolClick: (part: ToolPart) => handleOpenHistoryTool({ part }),
      onReasoningClick: (part: ReasoningPart) => handleOpenHistoryReasoning({ part }),
    },
    title: 'Thread History',
    scroll: 'follow',
    smoothEngine: 'native',
    closable: true,
    resizable: true,
    focusOnOpen: true,
    variant: 'message',
    expiry: Infinity,
    width: winW,
    height: winH,
    x,
    y,
    afterClose: closeHistoryToolWindows,
  });
}

function handleOpenImage(payload: { url: string; filename: string }) {
  const { url, filename } = payload;
  const key = `image-viewer:${url}`;
  if (fw.has(key)) {
    fw.bringToFront(key);
    return;
  }
  const pos = getFileViewerPosition();
  fw.open(key, {
    component: ContentViewer,
    props: {
      path: filename,
      imageSrc: url,
    },
    closable: true,
    resizable: true,
    focusOnOpen: true,
    scroll: 'manual',
    title: filename || 'Image',
    x: pos.x,
    y: pos.y,
    width: 800,
    height: 600,
    expiry: Infinity,
  });
}

async function handleEditMessage(payload: { sessionId: string; part: MessagePart }) {
  const directory = activeDirectory.value.trim();
  if (payload.part.type !== 'text') return;
  const nextText = window.prompt('Edit message', payload.part.text);
  if (nextText === null) return;
  const trimmed = nextText.trimEnd();
  if (!trimmed) return;
  if (trimmed === payload.part.text) return;
  try {
    const part = { ...payload.part, text: trimmed };
    await opencodeApi.patchMessagePart({
      sessionID: payload.sessionId,
      messageID: part.messageID,
      partID: part.id,
      part,
      directory: directory || undefined,
    });
  } catch (error) {
    console.error('Failed to update message part', error);
  }
}

function toFileViewerKey(path: string, lines?: string) {
  if (!lines) return `file-viewer:${path}`;
  return `file-viewer:${path}:${lines}`;
}

function toFileViewerTitle(path: string, lines?: string) {
  const base = resolveWorktreeRelativePath(path) || path;
  if (!lines) return base;
  return `${base}:${lines}`;
}

async function openFileViewer(path: string, lines?: string) {
  const key = toFileViewerKey(path, lines);
  if (fw.has(key)) {
    fw.bringToFront(key);
    return;
  }
  const pos = getFileViewerPosition(0.18, 0.14);
  const lang = guessLanguageFromPath(path);
  fw.open(key, {
    component: ContentViewer,
    props: {
      path,
      lang,
      lines,
      gutterMode: 'default',
      theme: shikiTheme.value,
    },
    closable: true,
    resizable: true,
    focusOnOpen: true,
    scroll: 'manual',
    title: toFileViewerTitle(path, lines),
    x: pos.x,
    y: pos.y,
    width: FILE_VIEWER_WINDOW_WIDTH,
    height: FILE_VIEWER_WINDOW_HEIGHT,
    expiry: Infinity,
  });
  const directory = activeDirectory.value.trim();
  if (!directory) {
    fw.updateOptions(key, {
      props: {
        path,
        rawHtml: 'No active directory selected.',
        lines,
        gutterMode: 'none',
        theme: shikiTheme.value,
      },
    });
    return;
  }

  try {
    const requestPath = splitFileContentDirectoryAndPath(path, directory);
    const data = (await opencodeApi.readFileContent({
      directory: requestPath.directory,
      path: requestPath.path,
    })) as FileContentResponse;
    const type = data?.type === 'binary' ? 'binary' : 'text';
    const encoding = typeof data?.encoding === 'string' ? data.encoding : 'utf-8';
    const content = typeof data?.content === 'string' ? data.content : '';
    const isBase64Payload = encoding === 'base64';
    if (type === 'binary' || isBase64Payload) {
      if (!content) {
        fw.updateOptions(key, {
          props: {
            path,
            rawHtml:
              'Binary content is not included in this API response.\nUnable to render hexdump for this file.',
            lines,
            gutterMode: 'none',
            theme: shikiTheme.value,
          },
        });
        return;
      }
      fw.updateOptions(key, {
        props: {
          path,
          binaryBase64: content,
          lang: guessLanguageFromPath(path),
          lines,
          gutterMode: 'default',
          theme: shikiTheme.value,
        },
      });
      return;
    }
    const resolvedLang = guessLanguageFromPath(path);
    const textContent = content;
    fw.updateOptions(key, {
      props: {
        path,
        fileContent: textContent,
        lang: resolvedLang,
        lines,
        gutterMode: 'default',
        theme: shikiTheme.value,
      },
    });
  } catch (error) {
    fw.updateOptions(key, {
      props: {
        path,
        rawHtml: `File load failed: ${toErrorMessage(error)}`,
        lines,
        gutterMode: 'none',
        theme: shikiTheme.value,
      },
    });
  }
}

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

function handlePtyEvent(event: {
  type: 'pty.created' | 'pty.updated' | 'pty.exited';
  info: PtyInfo | null;
  id?: string;
  exitCode?: number;
}) {
  const ptyId = event.id ?? event.info?.id;
  if (!ptyId) return;
  if (!shellSessionsByPtyId.has(ptyId)) return;
  if (event.type === 'pty.exited') {
    const exitCode = typeof event.exitCode === 'number' ? event.exitCode : -1;
    const waiter = shellExitWaiters.get(ptyId);
    if (waiter) {
      shellExitWaiters.delete(ptyId);
      waiter(exitCode);
    }
    const session = shellSessionsByPtyId.get(ptyId);
    if (session?.closeOnSuccess && exitCode !== 0) {
      session.terminal.write(`\r\n\u001b[31m[Command failed: ${exitCode}]\u001b[0m\r\n`);
      return;
    }
    lingerAndRemoveShellWindow(ptyId);
    return;
  }
  if (event.info) {
    const existing = shellSessionsByPtyId.get(event.info.id);
    if (existing) {
      existing.pty = event.info;
      if (event.info.title) {
        fw.setTitle(`shell:${event.info.id}`, event.info.title);
      }
    }
    if (event.info.status === 'exited') {
      if (existing?.closeOnSuccess) return;
      lingerAndRemoveShellWindow(event.info.id);
    }
  }
}

/**
 * Fetch Claude sessions from the sidecar and inject them into serverState.projects
 * so they appear in the session browser alongside OpenCode sessions.
 */
async function syncClaudeProjects(): Promise<void> {
  if (!claudeEnabled.value) return;
  try {
    const res = await fetch(serverConfig.claudeApiUrl('/sessions'), {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const sessions = (await res.json()) as Array<{
      id: string;
      title?: string;
      projectID?: string;
      directory?: string;
      time?: { created?: number; updated?: number };
    }>;

    // Group sessions by projectID
    const byProject = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const pid = s.projectID ?? ccProjectId(s.directory ?? 'unknown');
      if (!byProject.has(pid)) byProject.set(pid, []);
      byProject.get(pid)!.push(s);
    }

    for (const [projectId, projectSessions] of byProject) {
      const directory = projectSessions[0]?.directory ?? '';

      // Prefer an existing OpenCode project with the same worktree over creating a ccp_ duplicate
      const existingOcProject = Object.values(serverState.projects).find(
        (p) =>
          !isClaudeProjectId(p.id) &&
          (p.worktree === directory || Object.keys(p.sandboxes).includes(directory)),
      );
      const existing = existingOcProject ?? serverState.projects[projectId];

      if (existing) {
        // Merge sessions into the existing sandbox without overwriting OpenCode data
        const sandbox =
          existing.sandboxes[directory] ?? existing.sandboxes[Object.keys(existing.sandboxes)[0]];
        if (sandbox) {
          for (const s of projectSessions) {
            if (!sandbox.sessions[s.id]) {
              sandbox.sessions[s.id] = {
                id: s.id,
                title: s.title,
                directory: s.directory,
                timeCreated: s.time?.created,
                timeUpdated: s.time?.updated,
              };
              if (!sandbox.rootSessions.includes(s.id)) {
                sandbox.rootSessions.unshift(s.id);
              }
            }
          }
        }
        continue;
      }

      const sessionsMap: Record<string, import('./types/worker-state').SessionState> = {};
      const rootSessions: string[] = [];
      for (const s of projectSessions) {
        sessionsMap[s.id] = {
          id: s.id,
          title: s.title,
          directory: s.directory,
          timeCreated: s.time?.created,
          timeUpdated: s.time?.updated,
        };
        rootSessions.push(s.id);
      }

      serverState.projects[projectId] = {
        id: projectId,
        name: directory.split('/').pop() ?? directory,
        worktree: directory,
        sandboxes: {
          [directory]: {
            directory,
            name: 'main',
            rootSessions,
            sessions: sessionsMap,
          },
        },
      };
    }
  } catch {
    // sidecar not reachable — Claude sessions simply won't appear
  }
}

/**
 * Immediately inject a single new Claude session into serverState.projects
 * so switchSessionSelection can find it without waiting for a full sync.
 */
function injectClaudeSession(session: {
  id: string;
  projectID: string;
  directory: string;
  title?: string;
  time?: { created?: number; updated?: number };
}): void {
  const { id, directory, title, time } = session;
  const sessionState: import('./types/worker-state').SessionState = {
    id,
    title,
    directory,
    timeCreated: time?.created,
    timeUpdated: time?.updated,
  };

  // Try to find an existing OpenCode project with the same worktree directory
  // so Claude sessions appear under the same project rather than a duplicate.
  const existingOcProject = Object.values(serverState.projects).find(
    (p) =>
      !isClaudeProjectId(p.id) &&
      (p.worktree === directory || Object.keys(p.sandboxes).includes(directory)),
  );

  const targetProject = existingOcProject ?? serverState.projects[session.projectID];

  if (targetProject) {
    const sandbox =
      targetProject.sandboxes[directory] ??
      targetProject.sandboxes[Object.keys(targetProject.sandboxes)[0]];
    if (sandbox) {
      sandbox.sessions[id] = sessionState;
      if (!sandbox.rootSessions.includes(id)) sandbox.rootSessions.unshift(id);
    } else {
      targetProject.sandboxes[directory] = {
        directory,
        name: 'main',
        rootSessions: [id],
        sessions: { [id]: sessionState },
      };
    }
    // If we merged into an OC project, also update our session's projectID reference
    session.projectID = targetProject.id;
  } else {
    serverState.projects[session.projectID] = {
      id: session.projectID,
      name: directory.split('/').pop() ?? directory,
      worktree: directory,
      sandboxes: {
        [directory]: {
          directory,
          name: 'main',
          rootSessions: [id],
          sessions: { [id]: sessionState },
        },
      },
    };
  }
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
  const availableThemes = getBundledThemeNames();
  const chosenTheme = pickShikiTheme(availableThemes);
  if (chosenTheme) shikiTheme.value = chosenTheme;
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
    sessionScope.on('permission.asked', (packet) => {
      const request = packet as PermissionRequest;
      upsertPermissionEntry(request);
    }),
  );
  globalEventUnsubscribers.push(
    sessionScope.on('permission.replied', ({ requestID }) => {
      removePermissionEntry(requestID);
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('permission.replied', ({ requestID }) => {
      removePermissionEntry(requestID);
    }),
  );
  globalEventUnsubscribers.push(
    sessionScope.on('question.asked', (packet) => {
      const request = packet as QuestionRequest;
      upsertQuestionEntry(request);
    }),
  );
  globalEventUnsubscribers.push(
    sessionScope.on('question.replied', ({ requestID }) => {
      removeQuestionEntry(requestID);
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('question.replied', ({ requestID }) => {
      removeQuestionEntry(requestID);
    }),
  );
  globalEventUnsubscribers.push(
    sessionScope.on('question.rejected', ({ requestID }) => {
      removeQuestionEntry(requestID);
    }),
  );
  globalEventUnsubscribers.push(
    ge.on('question.rejected', ({ requestID }) => {
      removeQuestionEntry(requestID);
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
      lingerAndRemoveShellWindow(id);
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
