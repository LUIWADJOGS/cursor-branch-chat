import * as vscode from 'vscode';
import type { BranchChatEntry, CursorComposerSummary } from '../types/branchChat';
import { getEntriesForBranch, archiveEntry, updateEntry } from '../storage/chatRegistry';
import { getCurrentBranch } from '../git/getCurrentBranch';
import { getCommitDiffSince, getCommitAtTime, getBranchBaseCommit, CommitDiffInfo } from '../git/commitDiff';
import { showCommitDiffPanel } from './commitDiffPanel';
import {
  getActiveComposerId,
  getComposerData,
  getRootComposers,
} from '../cursor/composerStorage';
import { getClaudeSessionById, shortenSessionTitle } from '../claude/claudeSessions';
import { t } from '../i18n';
import * as fs from 'fs';

type BranchChatTarget = {
  entry: BranchChatEntry;
  composer: CursorComposerSummary;
};

export class BranchChatsProvider implements vscode.TreeDataProvider<BranchChatTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<BranchChatTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private getWorkspaceFolder: () => vscode.WorkspaceFolder | undefined
  ) {}

  getCurrentWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    return this.getWorkspaceFolder();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BranchChatTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BranchChatTreeItem): Promise<BranchChatTreeItem[]> {
    if (element) return [];
    const folder = this.getWorkspaceFolder();
    if (!folder) return [];
    const branch = await getCurrentBranch(folder);
    const entries = getEntriesForBranch(this.context.globalState, branch, folder.uri.fsPath);
    const composerData = await getComposerData(this.context);
    const composerById = new Map(
      getRootComposers(composerData).map((composer) => [composer.composerId, composer])
    );

    const items = await Promise.all(
      entries.map(async (entry) => {
        const isClaude = entry.source === 'claude';
        const liveComposer = isClaude ? undefined : composerById.get(entry.composerId);

        // Refresh Claude cached name from the JSONL if still on disk.
        let claudeLiveName: string | undefined;
        let claudeMtime: number | undefined;
        if (isClaude) {
          const session = await getClaudeSessionById(folder.uri.fsPath, entry.composerId);
          if (session) {
            claudeLiveName = shortenSessionTitle(session.firstUserMessage);
            claudeMtime = session.mtimeMs;
          }
        }

        // After Cursor's chat migration allComposers only has ~10 recent entries.
        // Older attached chats are no longer listed there, so we fall back to a
        // synthetic summary built from whatever we cached at attach time.
        const resolvedName =
          entry.customName ??
          liveComposer?.name ??
          claudeLiveName ??
          entry.cachedName ??
          `#${entry.composerId.slice(0, 8)}`;

        const composer: CursorComposerSummary = liveComposer
          ? { ...liveComposer, name: resolvedName }
          : {
              composerId: entry.composerId,
              name: resolvedName,
              createdAt: new Date(entry.createdAt).getTime(),
              lastUpdatedAt: claudeMtime,
            };

        // Keep cachedName in sync so it survives future migrations.
        const freshName = liveComposer?.name ?? claudeLiveName;
        if (freshName && freshName !== entry.cachedName) {
          updateEntry(this.context.globalState, entry.id, { cachedName: freshName });
        }

        if (!entry.startCommitHash) {
          const hash = await getCommitAtTime(folder.uri.fsPath, entry.createdAt);
          if (hash) {
            updateEntry(this.context.globalState, entry.id, { startCommitHash: hash });
            entry = { ...entry, startCommitHash: hash };
          }
        }

        let commitInfo: CommitDiffInfo | undefined;
        if (entry.startCommitHash) {
          commitInfo = await getCommitDiffSince(folder.uri.fsPath, entry.startCommitHash);
        }
        return new BranchChatTreeItem(entry, composer, 'entry', commitInfo);
      })
    );

    return items
      .filter((item): item is BranchChatTreeItem => item !== null)
      .sort((left, right) => {
        const rightTimestamp = right.composer.lastUpdatedAt ?? right.composer.createdAt;
        const leftTimestamp = left.composer.lastUpdatedAt ?? left.composer.createdAt;
        return rightTimestamp - leftTimestamp;
      });
  }
}

export class BranchChatTreeItem extends vscode.TreeItem {
  constructor(
    public readonly entry: BranchChatEntry,
    public readonly composer: CursorComposerSummary,
    _type: 'entry',
    commitInfo?: CommitDiffInfo
  ) {
    super(composer.name ?? t('chat.untitled'), vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: 'cursorBranchChat.openChat',
      title: t('chat.openTitle'),
      arguments: [this],
    };

    const isClaude = entry.source === 'claude';
    this.iconPath = new vscode.ThemeIcon(isClaude ? 'sparkle' : 'comment-discussion');

    const hasBadge = commitInfo !== undefined && commitInfo.commitCount > 0;
    const badge = hasBadge
      ? ` ${t('chat.commitsBadge', { count: String(commitInfo!.commitCount) })}`
      : '';
    const sourceTag = isClaude ? `[${t('chat.claudeBadge')}] ` : '';
    this.description = `${sourceTag}${entry.branchName}${badge}`;
    this.contextValue = hasBadge ? 'entry-with-diff' : 'entry';

    const tooltip = new vscode.MarkdownString();
    tooltip.appendText(entry.branchName);
    if (hasBadge) {
      tooltip.appendText(
        `\n\n${t('chat.commitsTooltipHeader', { count: String(commitInfo!.commitCount) })}\n`
      );
      const MAX_FILES = 20;
      const shown = commitInfo!.changedFiles.slice(0, MAX_FILES);
      for (const file of shown) {
        tooltip.appendText(`• ${file}\n`);
      }
      if (commitInfo!.changedFiles.length > MAX_FILES) {
        tooltip.appendText(
          t('chat.commitsTooltipMoreFiles', {
            count: String(commitInfo!.changedFiles.length - MAX_FILES),
          })
        );
      }
    }
    if (composer.subtitle) {
      tooltip.appendText(`\n\n${composer.subtitle}`);
    }
    this.tooltip = tooltip;
  }
}

export function registerTreeViewCommands(
  context: vscode.ExtensionContext,
  provider: BranchChatsProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cursorBranchChat.openChat', async (item: BranchChatTarget) => {
      if (item.entry.source === 'claude') {
        await openClaudeSession(item);
        return;
      }

      const openedViaCommand = await openComposerWithCursorCommand(context, item.composer.composerId);
      if (openedViaCommand) {
        return;
      }

      void vscode.window.showWarningMessage(
        t('messages.openExisting.failed', {
          name: item.composer.name ?? item.composer.composerId,
        })
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('cursorBranchChat.copyPrompt', async (item: BranchChatTreeItem) => {
      if (!item.entry.promptText) {
        void vscode.window.showInformationMessage(t('messages.copyPrompt.missing'));
        return;
      }
      await vscode.env.clipboard.writeText(item.entry.promptText);
      void vscode.window.showInformationMessage(t('messages.copyPrompt.success'));
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('cursorBranchChat.archiveChat', (item: BranchChatTreeItem) => {
      archiveEntry(context.globalState, item.entry.id);
      provider.refresh();
      void vscode.window.showInformationMessage(
        t('messages.detach.success', {
          name: item.composer.name ?? t('chat.untitled'),
        })
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cursorBranchChat.showCommitDiff',
      async (item: BranchChatTreeItem) => {
        const folder = provider.getCurrentWorkspaceFolder();
        if (!folder || !item.entry.startCommitHash) {
          void vscode.window.showInformationMessage(t('messages.commitDiff.noStartCommit'));
          return;
        }

        const { changedFiles } = await getCommitDiffSince(
          folder.uri.fsPath,
          item.entry.startCommitHash
        );
        if (changedFiles.length === 0) {
          void vscode.window.showInformationMessage(t('messages.commitDiff.noChanges'));
          return;
        }

        const chatName = item.composer.name ?? t('chat.untitled');
        const hash = item.entry.startCommitHash;

        const shown = await showCommitDiffPanel(folder.uri.fsPath, hash, chatName);
        if (!shown) {
          void vscode.window.showInformationMessage(t('messages.commitDiff.noChanges'));
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cursorBranchChat.showBranchDiff',
      async (item: BranchChatTreeItem) => {
        const folder = provider.getCurrentWorkspaceFolder();
        if (!folder) {
          void vscode.window.showWarningMessage(t('messages.noWorkspace'));
          return;
        }

        const baseCommit = await getBranchBaseCommit(folder.uri.fsPath);
        if (!baseCommit) {
          void vscode.window.showInformationMessage(t('messages.branchDiff.noBase'));
          return;
        }

        const chatName = item.composer.name ?? t('chat.untitled');
        const shown = await showCommitDiffPanel(
          folder.uri.fsPath,
          baseCommit,
          chatName,
          t('messages.branchDiff.header', { branch: item.entry.branchName })
        );
        if (!shown) {
          void vscode.window.showInformationMessage(t('messages.commitDiff.noChanges'));
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cursorBranchChat.renameChat',
      async (item: BranchChatTreeItem) => {
        const currentName = item.entry.customName ?? item.composer.name ?? '';
        const newName = await vscode.window.showInputBox({
          prompt: t('messages.renameChat.inputPrompt'),
          placeHolder: t('messages.renameChat.inputPlaceholder'),
          value: currentName,
          valueSelection: [0, currentName.length],
        });

        if (newName === undefined) {
          return;
        }

        const trimmed = newName.trim() || undefined;
        updateEntry(context.globalState, item.entry.id, { customName: trimmed });
        provider.refresh();

        if (trimmed) {
          void vscode.window.showInformationMessage(
            t('messages.renameChat.success', { name: trimmed })
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cursorBranchChat.changeChatBranch',
      async (item: BranchChatTreeItem) => {
        const nextBranch = await vscode.window.showInputBox({
          prompt: t('messages.changeBranch.inputPrompt'),
          placeHolder: t('messages.changeBranch.inputPlaceholder'),
          value: item.entry.branchName,
          valueSelection: [0, item.entry.branchName.length],
          validateInput: (value) =>
            value.trim() ? null : t('messages.changeBranch.inputValidation'),
        });

        if (nextBranch === undefined) {
          return;
        }

        const normalizedBranch = nextBranch.trim();
        if (!normalizedBranch || normalizedBranch === item.entry.branchName) {
          return;
        }

        updateEntry(context.globalState, item.entry.id, {
          branchName: normalizedBranch,
        });
        provider.refresh();

        void vscode.window.showInformationMessage(
          t('messages.changeBranch.success', {
            name: item.composer.name ?? t('chat.untitled'),
            branch: normalizedBranch,
          })
        );
      }
    )
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openComposerWithCursorCommand(
  context: vscode.ExtensionContext,
  composerId: string
): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes('composer.openComposer')) {
    return false;
  }

  for (const options of [{ view: 'pane' }, { view: 'editor', openInNewTab: true }]) {
    try {
      await vscode.commands.executeCommand('composer.openComposer', composerId, options);
      await delay(200);

      if (await isComposerOpen(context, composerId)) {
        return true;
      }
    } catch {
      // Ignore missing or rejected internal Cursor commands and try the fallback path.
    }
  }

  return false;
}

async function openClaudeSession(item: BranchChatTarget): Promise<void> {
  const filePath = item.entry.sessionFilePath;
  if (!filePath || !fs.existsSync(filePath)) {
    void vscode.window.showWarningMessage(t('messages.openClaude.notFound'));
    return;
  }

  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc, { preview: true });

    const commands = await vscode.commands.getCommands(true);
    if (commands.includes('claude-vscode.editor.openLast')) {
      try {
        await vscode.commands.executeCommand('claude-vscode.editor.openLast');
      } catch {
        // Non-fatal: the JSONL is already visible as a fallback.
      }
    }
  } catch {
    void vscode.window.showWarningMessage(
      t('messages.openClaude.failed', {
        name: item.composer.name ?? item.entry.composerId,
      })
    );
  }
}

async function isComposerOpen(
  context: vscode.ExtensionContext,
  composerId: string
): Promise<boolean> {
  if ((await getActiveComposerId(context)) === composerId) {
    return true;
  }

  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  if (!activeEditorUri) {
    return false;
  }

  return (
    activeEditorUri.path === composerId ||
    activeEditorUri.path.endsWith(`/${composerId}`) ||
    activeEditorUri.toString().includes(composerId)
  );
}


