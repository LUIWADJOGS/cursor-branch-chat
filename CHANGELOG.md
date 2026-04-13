# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.9] - 2026-04-13

### Fixed

- **Active chat attachment:** newer Cursor builds now store the active chat in `workbench.parts.embeddedAuxBarEditor.state`, while the older `composerChatViewPane` state can point at a stale tab. Active chat detection now prefers the embedded aux bar state and only falls back to the legacy pane metadata when needed.

## [0.4.8] - 2026-04-10

### Fixed

- **Active chat detection:** `selectedComposerIds[0]` often stays a stale UUID after closing tabs. The extension now intersects `lastFocusedComposerIds` / `selectedComposerIds` with composer IDs still present in the active panel’s `composerChatViewPane` state, so attach/open use the tab that is actually open.

## [0.4.6] - 2026-03-13

### Fixed

- **Attach Current Chat** now works after Cursor's internal chat migration (`hasMigratedComposerData`). Previously, if the active chat was not in the migrated `allComposers` list (old chats get dropped during migration), the command silently returned nothing. Now a minimal composer summary is created from the active panel ID so attachment always proceeds.
- `getRootComposers` updated to recognise the new `type: "head"` field that Cursor uses after migration, replacing the old `subagentInfo` presence check.

## [0.3.9] - 2026-03-13

### Changed

- Categories updated to `AI` and `SCM Providers` for better Marketplace discoverability.
- Added keywords: `cursor-ai`, `cursor-chat`, `ai-chat`, `git-branch`, `llm`, `workflow`, `productivity`, `branch-management`, `chat-history`.
- Improved extension description to better reflect all features.

## [0.3.8] - 2026-03-13

### Fixed

- Removed restrictive Content-Security-Policy meta tag from the diff webview — it was blocking VS Code's internal service worker registration and causing "InvalidStateError" on panel open.

## [0.3.7] - 2026-03-13

### Added

- New command "Show All Branch Changes (vs base branch)" — opens the same diff webview but shows everything changed on the current branch relative to `main`/`master`/`develop` (uses `git merge-base`). Available as an inline button and context menu item on every chat entry.

## [0.3.6] - 2026-03-13

### Changed

- "Show Changes" now opens a Webview panel with a proper diff viewer: all changed files in one scrollable view with green/red highlights, file headers, and a clickable file index at the top.

## [0.3.5] - 2026-03-13

### Changed

- "Show Changes" opens a single tab with the full `git diff` output (all files one under another) instead of multiple diff tabs.

## [0.3.4] - 2026-03-13

### Changed

- "Show Changes" now opens all changed files as diff tabs at once (file by file) instead of a QuickPick selector.

## [0.3.3] - 2026-03-13

### Fixed

- "Show Changes" no longer throws "Invalid argument resourceList" — replaced `vscode.changes` (incompatible with Cursor) with a QuickPick file picker followed by `vscode.diff` for the selected file.

## [0.3.2] - 2026-03-13

### Changed

- "Show Changes" now opens a proper VS Code diff editor (red/green lines, file by file) instead of a raw text diff. Uses `vscode.changes` for a multi-file panel when available, falls back to `vscode.diff` per file.

## [0.3.1] - 2026-03-13

### Added

- Inline `$(git-compare)` button on chat items with new commits — opens the full `git diff` in a VS Code editor tab with diff syntax highlighting.
- Context menu item "Show Changes Since Chat Was Created" for the same action.

## [0.3.0] - 2026-03-13

### Added

- Each tracked chat now records the HEAD commit hash at the moment of creation or attachment (`startCommitHash`).
- The sidebar shows a `↑N` badge next to the branch name when N new commits have been made on the branch since the chat was started.
- Hovering over a chat in the sidebar displays a tooltip listing all files changed in those commits (up to 20; overflow shown as "…and N more files").

## [0.2.3] - 2025-03-16

### Changed

- Updated publisher namespace to `LUIWADJOGS`.

## [0.2.2] - 2025-03-16

### Added

- Added `Change Chat Branch` action to move a tracked chat to another branch from the item context menu.

## [0.2.1] - 2025-03-16

### Changed

- Updated the extension publisher id to `cursor-branch-chat-publisher`.
- Rebuilt the release package for Marketplace publishing.

## [0.2.0] - 2025-03-16

### Added

- Marketplace-ready metadata: repository, license, keywords, icon.
- LICENSE (MIT) and CHANGELOG.
- Public README with value proposition, features, usage, and compatibility notes.

### Changed

- README rewritten for extension marketplace listing.
- Extension description updated in package.nls (en/ru).

## [0.1.2] - 2025-03

### Changed

- Open existing chat via Cursor internal command `composer.openComposer`.
- Simplified open-flow; removed legacy state-based fallback.

## [0.1.1] - 2025-03

### Added

- Attach current chat to branch.
- Remove chat from branch list (detach).

### Fixed

- Correct active composer detection when attaching.

## [0.1.0] - 2025

### Added

- Create Branch Chat with branch/task prompt and deeplink.
- Branch Chats sidebar filtered by current git branch.
- Open existing Cursor chat from list.
- Copy prompt, archive (detach) entries.
- English and Russian UI.
