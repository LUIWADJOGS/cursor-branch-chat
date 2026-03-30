import * as vscode from 'vscode';
import type { BranchChatEntry, CursorComposerSummary } from '../types/branchChat';
import { getEntriesForBranch, archiveEntry, updateEntry } from '../storage/chatRegistry';
import { getCurrentBranch } from '../git/getCurrentBranch';
import { getCommitDiffSince, CommitDiffInfo } from '../git/commitDiff';
import {
  getActiveComposerId,
  getComposerData,
  getRootComposers,
} from '../cursor/composerStorage';
import { t } from '../i18n';

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
        const composer = composerById.get(entry.composerId);
        if (!composer) return null;
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
    type: 'entry',
    commitInfo?: CommitDiffInfo
  ) {
    super(composer.name ?? t('chat.untitled'), vscode.TreeItemCollapsibleState.None);
    this.contextValue = type;
    this.command = {
      command: 'cursorBranchChat.openChat',
      title: t('chat.openTitle'),
      arguments: [this],
    };

    const hasBadge = commitInfo !== undefined && commitInfo.commitCount > 0;
    const badge = hasBadge
      ? ` ${t('chat.commitsBadge', { count: String(commitInfo!.commitCount) })}`
      : '';
    this.description = `${entry.branchName}${badge}`;

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


