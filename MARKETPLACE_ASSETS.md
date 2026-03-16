# Marketplace Assets

This file defines the recommended icon, screenshots, and GIF flow for the
Visual Studio Marketplace listing.

## Icon

- Source file used by the extension: `media/icon.png`
- Style: dark Cursor-like background, chat bubble + git branch nodes
- Goal: readable at small sizes in Marketplace search results

## Recommended Screenshots

Save screenshots in a public folder such as `media/screenshots/`.

### 1. `branch-chats-sidebar.png`

Show:

- Cursor window with the `Branch Chats` activity bar icon visible
- `Branch Chats` panel expanded
- 2-4 chats attached to the current branch
- clean branch names and readable chat titles

Purpose:

- immediately shows the main value of the extension

### 2. `attach-current-chat.png`

Show:

- an already opened Cursor chat
- the `Branch Chats` panel title actions or command palette
- `Attach Current Chat To Branch` being used

Purpose:

- explains how existing chats get linked to a branch

### 3. `open-existing-chat.png`

Show:

- a chat entry selected in `Branch Chats`
- the corresponding existing chat opened in Cursor

Purpose:

- proves the extension opens an existing chat instead of creating a new one

## Recommended GIF

File name:

- `media/screenshots/branch-chat-demo.gif`

Target length:

- 10-15 seconds

Recommended script:

1. Start on branch `feature/branch-chat-demo`.
2. Open the `Branch Chats` panel.
3. Run `Create Branch Chat` and create a chat like `Fix branch chat opening`.
4. Show the new entry appearing in the branch list.
5. Switch to another branch such as `main`.
6. Show that the list changes or becomes empty.
7. Switch back to `feature/branch-chat-demo`.
8. Click the chat entry.
9. Show the existing Cursor chat opening.

Recording tips:

- use a clean workspace and readable branch/chat names
- keep the Cursor sidebar visible
- avoid notifications covering the panel
- zoom in slightly so text is readable on Marketplace
- keep the motion slow enough to understand without pausing

## Suggested README Placement

Use assets in this order:

1. GIF near the top under the value proposition
2. Sidebar screenshot after the feature list
3. Attach/open screenshots near the usage section
