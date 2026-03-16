# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
