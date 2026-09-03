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
import { computed, ref, watch } from 'vue';
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
import { useFileTree } from './composables/useFileTree';
import { type TodoSessionView } from './composables/useTodos';
import {} from './composables/useHiddenModels';
import type { MessagePart } from './types/sse';
import {} from './utils/stateBuilder';
import {} from './utils/path';
import type {} from './utils/pty';
import { useAppContext } from './composables/useAppContext';
import { useModals } from './composables/useModals';
import { useAttachments } from './composables/useAttachments';
import { useShellLayout } from './composables/useShellLayout';
import {} from './composables/useSelectionRouting';
import { useServerConfig } from './composables/useServerConfig';
import { useFloatingCanvas } from './composables/useFloatingCanvas';
import { useBrowserNotifications } from './composables/useBrowserNotifications';
import { useFileViewers } from './composables/useFileViewers';
import { useGitSnapshots } from './composables/useGitSnapshots';
import { useToolWindows } from './composables/useToolWindows';
import { useTerminalWindows } from './composables/useTerminalWindows';
import { useDebugCommands } from './composables/useDebugCommands';
import { useClaudeIntegration } from './composables/useClaudeIntegration';
import {} from './composables/useConnectionState';
import { usePermissionRouting } from './composables/usePermissionRouting';
import { useOutputScroller } from './composables/useOutputScroller';
import { useComposer } from './composables/useComposer';
import { useSessionActions } from './composables/useSessionActions';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts';
import { useAppBootstrap } from './composables/useAppBootstrap';
import { useSessionCatalog } from './composables/useSessionCatalog';
import { useProviderCatalog } from './composables/useProviderCatalog';
import type { SessionEntry as SessionInfo } from './types/session';

const ctx = useAppContext();
const {
  isMobile,
  fw,
  serverState,
  selection: sessionSelection,
  homePath,
  serverWorktreePath,
} = ctx;
const { suppressAutoWindows } = ctx.settings;
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
const serverConfig = useServerConfig();
const { claudeEnabled } = serverConfig;
const canvas = useFloatingCanvas();
const { bindCanvasEl, syncFloatingExtent } = canvas;
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
const { showThreadHistory: handleShowThreadHistory, editMessage: handleEditMessage } = toolWindows;
const terminals = useTerminalWindows();
const { scheduleShellFitAll, openShellFromInput, runTreeShellCommand } = terminals;
const {
  pendingPermissionCount,
  openToolPermissions,
  handlePermissionReply,
  resolvePendingPermissionForRoot,
} = usePermissionRouting();
useDebugCommands();
const composer = useComposer();
const {
  messageInput,
  statusText,
  isStatusError,
  canSend,
  canAbort,
  isThinking,
  busyDescendantSessionIds,
  handleMessageInputUpdate,
  handleSelectedModeUpdate,
  handleSelectedModelUpdate,
  handleSelectedThinkingUpdate,
  handleApplyHistoryEntry,
  handleAddAttachments,
  removeAttachment,
  sendMessage,
  abortSession,
} = composer;
const sessionActions = useSessionActions();
const {
  handleEditProject,
  handleSaveProject,
  createWorktreeFromWorktree,
  deleteWorktree,
  openProjectPicker,
  createNewSession,
  handleNewSessionInSandbox,
  handleTopPanelSessionSelect,
  deleteSession,
  archiveSession,
  archiveProject,
  deleteProject,
  handleForkMessage,
  handleRevertMessage,
  handleUndoRevert,
  handleProjectDirectorySelect,
  todos,
} = sessionActions;
const { todosBySessionId, todoLoadingBySessionId, todoErrorBySessionId } = todos;
const { focusInput } = useKeyboardShortcuts();
const bootstrap = useAppBootstrap();
const {
  uiInitState,
  connectionState,
  initLoadingMessage,
  initErrorMessage,
  loginUrl,
  loginUsername,
  loginPassword,
  loginRequiresAuth,
  startInitialization,
  handleLogin,
  handleAbortInit,
  handleLogout,
} = bootstrap;
const claude = useClaudeIntegration();
const { isClaudeSession, createClaudeSession } = claude;
canvas.onWindowResize(() => scheduleShellFitAll());

/** Shell windows need their PTY killed; everything else just closes. */
function handleFloatingWindowClose(key: string) {
  if (terminals.onWindowClosed(key)) return;
  void fw.close(key);
}
const notifications = useBrowserNotifications();
const { notificationSessions, selectNextNotificationSession: handleNotificationSessionSelect } =
  notifications;

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

const topPanelRef = ref<{
  openSessionDropdown: () => void;
  closeSessionDropdown: () => void;
  toggleSessionDropdown: () => void;
} | null>(null);
const inputPanelRef = ref<{ focus: () => void; reset: () => void } | null>(null);
// Bridge the panel components' imperative APIs into the shared context so
// feature composables never reach for template refs they do not own.
ctx.uiHooks.focusComposer = () => inputPanelRef.value?.focus();
ctx.uiHooks.resetComposer = () => inputPanelRef.value?.reset();
ctx.uiHooks.openSessionDropdown = () => topPanelRef.value?.openSessionDropdown();
ctx.uiHooks.closeSessionDropdown = () => topPanelRef.value?.closeSessionDropdown();
ctx.uiHooks.toggleSessionDropdown = () => topPanelRef.value?.toggleSessionDropdown();

layout.onLayoutChange(() => {
  syncFloatingExtent();
  scheduleShellFitAll();
});
const outputScroller = useOutputScroller();
const {
  isFollowing,
  handleInitialRenderComplete: handleOutputPanelInitialRenderComplete,
  handleContentChange: handleOutputPanelContentResized,
  resumeFollow: handleOutputPanelResumeFollow,
} = outputScroller;
const handleOutputPanelMessageRendered = handleOutputPanelContentResized;

layout.onLayoutChange(() => {
  syncFloatingExtent();
  scheduleShellFitAll();
});

const { selectedProjectId, selectedSessionId, projectDirectory, activeDirectory } =
  sessionSelection;
const catalog = useSessionCatalog();
const {
  sessions,
  sessionParentById,
  currentProjectColor,
  currentProjectName,
  topPanelTreeData,
  allowedSessionIds,
  treeDirectoryName,
  hasSession,
  retryStatus,
  sessionLabel,
} = catalog;
const providerCatalog = useProviderCatalog();
const {
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
  fetchProviders,
  fetchAgents,
  computeContextPercent,
} = providerCatalog;

const {
  treeNodes,
  expandedTreePaths,
  selectedTreePath,
  treeLoading,
  treeError,
  gitStatus,
  gitStatusByPath,
  refreshGitStatus,
  reloadTree,
  toggleTreeDirectory,
  selectTreeFile,
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

/**
 * Turn a thrown load error into a short, actionable sentence for the UI.
 * Distinguishes "server unreachable" from "server said no", because the two
 * need very different fixes.
 */
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
