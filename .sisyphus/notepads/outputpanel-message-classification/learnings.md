## 2026-02-08 Task: bootstrap
- Message-level diffs are collected in `messageDiffsByKey` in `app/App.vue`.
- Output panel currently renders all non-subagent messages in `app/components/OutputPanel.vue`.

## 2026-02-09 Task 2: round-grouped fetchHistory
- `fetchHistory` now groups by `parentID` and creates one `isRound` entry per top-level message with `roundMessages` sorted by `messageTime` (fallback: original list order).
- Summary diffs are attached directly to each round root via `extractSummaryDiffs(root.info)` and stored in `messageDiffsByKey` by the round's `messageKey`.

## 2026-02-09 Task 3: SSE round-model rewrite
- `promoteFinalAnswerToOutputPanel` now resolves a round by `isRound && roundId === parentID` and appends assistant sub-messages via array replacement (`round.roundMessages = [...round.roundMessages, newSubMessage]`) to trigger Vue reactivity.
- When no matching round exists, finish-stop creates a round entry (or top-level round when `parentID` is absent) and stores both round-level/message-level keys in maps for compatibility.
- `registerMessageSummary` now updates `round.roundDiffs` directly by round lookup and still backfills `messageDiffsByKey` using `buildMessageKey(roundId, sessionId)` for OutputPanel compatibility.
- SSE user root messages (`role=user`, no `parentID`, selected session) now create/update a round entry before assistant output, with the user message inserted as the first `roundMessage`.

## 2026-02-09 Task 4: OutputPanel template rewrite
- Replaced `v-for` with a `filteredQueue` loop that handles `isRound` logic distinct from legacy rendering.
- `OutputPanel` now formats `formatRoundMeta` from the LAST assistant message for model/time (most relevant) instead of the round root.
- `filteredQueue` computed property replaces inline filter for better performance and readability.
- Round sub-messages use `MessageViewer` with `round-msg-indicator` for role differentiation (blue/green).
