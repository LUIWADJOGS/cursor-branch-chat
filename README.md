# Cursor Branch Chat

Show and open only the Cursor chats that belong to your current git branch.

## Why use it

Cursor keeps one big list of chats. When you work on several branches, it’s hard to see which chat goes with which branch. This extension ties chats to the current branch and shows only those in the **Branch Chats** sidebar, so you can open the right chat in one click.

## Features

- **Create Branch Chat** — Start a new chat with a branch-aware prompt and attach it to the current branch.
- **Branch Chats panel** — Sidebar list of chats for the current branch only (filtered by git branch).
- **Open existing chat** — Click a chat in the list to open that Cursor chat (no new chat, no empty prompt).
- **Attach current chat** — Bind the chat you have open to the current branch.
- **Remove from list** — Unlink a chat from the branch without deleting the chat in Cursor.
- **Copy prompt** — Copy the initial prompt for a chat (when available).
- **Multilingual** — UI in English and Russian (follows Cursor language).

## How to use

1. Open a workspace that is a git repository.
2. Open the **Branch Chats** view (chat icon in the Activity Bar).
3. Use **Create Branch Chat** to create a new branch-scoped chat, or **Attach Current Chat To Branch** to link the active Cursor chat to the current branch.
4. Switch branches — the list shows only chats for the current branch.
5. Click a chat in the list to open it in Cursor.

## Commands

| Command | Description |
|--------|-------------|
| Create Branch Chat | New chat with branch/task prompt, attached to current branch |
| Show Chats For Current Branch | Quick Pick of branch chats; choose one to open it |
| Attach Current Chat To Branch | Link the focused Cursor chat to the current branch |
| Open in Cursor Chat | Open the selected chat (from tree or context menu) |
| Copy Prompt | Copy the chat’s initial prompt to clipboard |
| Remove From Branch Chats | Unlink chat from branch list (chat stays in Cursor) |

## Requirements and compatibility

- **Cursor** or **VS Code** with a Cursor-compatible environment. Opening an existing chat uses Cursor’s internal command (`composer.openComposer`); behavior is optimized for Cursor.
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
4. The existing chat should open (not a new one).

See `verification-scenarios.txt` in the repo for more scenarios.

## Development

```bash
npm install
npm run compile
npm run watch   # optional, for development
```

Package a `.vsix`:

```bash
npx @vscode/vsce package
```

Project layout: `src/extension.ts`, `src/views/`, `src/storage/`, `src/git/`, `src/chat/`, `src/cursor/`, `src/watchers/`.

## License

MIT. See [LICENSE](LICENSE).
