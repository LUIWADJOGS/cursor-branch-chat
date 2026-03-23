# Cursor Branch Chat

Show and open only the Cursor chats that belong to your current git branch.

## Why use it

Cursor keeps one big list of chats. When you work on several branches, it becomes hard to tell which chat belongs to which task. Cursor Branch Chat ties chats to a git branch and shows only the chats for the current branch in the **Branch Chats** sidebar.

## Features

- Create a branch-aware chat with a prepared prompt
- Show only chats for the current git branch
- Open an existing tracked chat from the sidebar
- Attach the currently opened Cursor chat to a branch
- Change the branch assignment of a tracked chat
- Remove a chat from the branch list without deleting it in Cursor
- Copy the original prompt when available
- English and Russian UI

## How to use

1. Open a workspace that is a git repository.
2. Open the **Branch Chats** view from the Activity Bar.
3. Create a new branch chat or attach the currently opened chat to the current branch.
4. Switch branches to see a different filtered list.
5. Click a chat to reopen it in Cursor.

## Commands

| Command | Description |
|--------|-------------|
| Create Branch Chat | New chat with branch/task prompt, attached to current branch |
| Show Chats For Current Branch | Quick Pick of branch chats; choose one to open it |
| Attach Current Chat To Branch | Link the focused Cursor chat to the current branch |
| Change Chat Branch | Move a tracked chat to another branch |
| Open in Cursor Chat | Open the selected chat (from tree or context menu) |
| Copy Prompt | Copy the chat’s initial prompt to clipboard |
| Remove From Branch Chats | Unlink chat from branch list (chat stays in Cursor) |

## Requirements and compatibility

- **Cursor** is the primary target. Opening an existing chat uses Cursor’s internal command (`composer.openComposer`).
- A **git** repository; the current branch is read from the workspace root.
- **Workspace folder** must be open (single-root workspace supported).

## Install

1. Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/) (search for “Cursor Branch Chat”), or
2. Install from a `.vsix` file: **Extensions** → **...** → **Install from VSIX...** and choose the built `.vsix`.

## Verify

After installing:

1. Create or attach a chat to the current branch.
2. Close that chat in Cursor.
3. In **Branch Chats**, click the same chat.
4. The existing chat should open instead of creating a new one.

## License

MIT. See [LICENSE](LICENSE).
