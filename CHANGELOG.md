# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
