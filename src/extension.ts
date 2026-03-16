import * as vscode from 'vscode';
import { getCurrentBranch } from './git/getCurrentBranch';
import { buildBranchPrompt } from './chat/buildBranchPrompt';
import { openPromptInCursor } from './chat/createPromptDeeplink';
import { getEntriesForBranch, upsertEntry } from './storage/chatRegistry';
import { BranchChatsProvider, registerTreeViewCommands } from './views/branchChatsProvider';
import { registerGitBranchWatcher } from './watchers/gitBranchWatcher';
import { t } from './i18n';
import {
  getComposerData,
  getRootComposers,
  getSelectedComposerId,
  getSelectedRootComposer,
  waitForNewComposer,
} from './cursor/composerStorage';

export function activate(context: vscode.ExtensionContext): void {
  const getWorkspaceFolder = (): vscode.WorkspaceFolder | undefined =>
    vscode.workspace.workspaceFolders?.[0];

  const provider = new BranchChatsProvider(context, getWorkspaceFolder);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('branchChats.branchChatsView', provider)
  );
  registerTreeViewCommands(context, provider);
  registerGitBranchWatcher(context, () => provider.refresh());

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorBranchChat.createBranchChat', async () => {
      const folder = getWorkspaceFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const branch = await getCurrentBranch(folder);
      const title = await vscode.window.showInputBox({
        prompt: t('messages.createChat.inputPrompt'),
        placeHolder: t('messages.createChat.inputPlaceholder'),
        validateInput: (value) => (value?.trim() ? null : t('messages.createChat.inputValidation')),
      });
      if (title === undefined || !title.trim()) return;

      const previousComposerId = await getSelectedComposerId(context);
      const startedAt = Date.now();
      const promptText = buildBranchPrompt(branch, title.trim());
      const didOpen = await openPromptInCursor(promptText);
      if (!didOpen) {
        void vscode.window.showWarningMessage(t('messages.createChat.openFailed'));
        return;
      }

      const composer = await waitForNewComposer(context, previousComposerId, startedAt);
      if (!composer) {
        void vscode.window.showWarningMessage(
          t('messages.createChat.attachFailed')
        );
        return;
      }

      upsertEntry(context.globalState, {
        composerId: composer.composerId,
        branchName: branch,
        promptText,
        workspaceFolder: folder.uri.fsPath,
        status: 'active',
      });
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorBranchChat.attachCurrentChatToBranch', async () => {
      const folder = getWorkspaceFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }

      const branch = await getCurrentBranch(folder);
      const composer = await getSelectedRootComposer(context);
      if (!composer) {
        void vscode.window.showWarningMessage(t('messages.attachCurrent.openChatFirst'));
        return;
      }

      upsertEntry(context.globalState, {
        composerId: composer.composerId,
        branchName: branch,
        workspaceFolder: folder.uri.fsPath,
        status: 'active',
      });

      provider.refresh();
      void vscode.window.showInformationMessage(
        t('messages.attachCurrent.success', {
          name: composer.name ?? t('chat.untitled'),
          branch,
        })
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorBranchChat.showChatsForCurrentBranch', async () => {
      const folder = getWorkspaceFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(t('messages.noWorkspace'));
        return;
      }
      const branch = await getCurrentBranch(folder);
      const entries = getEntriesForBranch(context.globalState, branch, folder.uri.fsPath);
      const composerData = await getComposerData(context);
      const composerById = new Map(
        getRootComposers(composerData).map((composer) => [composer.composerId, composer])
      );
      const branchChats = entries
        .map((entry) => {
          const composer = composerById.get(entry.composerId);
          return composer ? { composer, entry } : null;
        })
        .filter(
          (item): item is { composer: ReturnType<typeof getRootComposers>[number]; entry: typeof entries[number] } =>
            item !== null
        );

      if (branchChats.length === 0) {
        void vscode.window.showInformationMessage(t('messages.showChats.empty', { branch }));
        return;
      }
      const picked = await vscode.window.showQuickPick(
        branchChats.map((item) => ({
          label: item.composer.name ?? t('chat.untitled'),
          description: item.entry.branchName,
          detail: item.composer.subtitle,
          composerId: item.composer.composerId,
        })),
        { placeHolder: t('messages.showChats.placeholder', { branch }), matchOnDescription: true }
      );
      if (picked?.composerId) {
        await vscode.commands.executeCommand('cursorBranchChat.openChat', {
          entry: entries.find((entry) => entry.composerId === picked.composerId),
          composer: composerById.get(picked.composerId),
        });
      }
    })
  );
}

export function deactivate(): void {}
