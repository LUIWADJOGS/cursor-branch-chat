import * as vscode from 'vscode';
import { getCurrentBranch, getHeadCommit } from './git/getCurrentBranch';
import { GitContentProvider, GIT_CONTENT_SCHEME } from './git/gitContentProvider';
import { buildBranchPrompt } from './chat/buildBranchPrompt';
import { openPromptInCursor } from './chat/createPromptDeeplink';
import { getEntriesForBranch, upsertEntry } from './storage/chatRegistry';
import { BranchChatsProvider, registerTreeViewCommands } from './views/branchChatsProvider';
import { registerGitBranchWatcher } from './watchers/gitBranchWatcher';
import { t } from './i18n';
import {
  dumpComposerDiagnostics,
  getComposerData,
  getOpenComposerIds,
  getRootComposers,
  getSelectedComposerId,
  getSelectedRootComposer,
  waitForNewComposer,
} from './cursor/composerStorage';
import {
  getActiveClaudeSession,
  isClaudeExtensionInstalled,
  listClaudeSessions,
  shortenSessionTitle,
} from './claude/claudeSessions';

export function activate(context: vscode.ExtensionContext): void {
  const getWorkspaceFolder = (): vscode.WorkspaceFolder | undefined =>
    vscode.workspace.workspaceFolders?.[0];

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(GIT_CONTENT_SCHEME, new GitContentProvider())
  );

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

      const startCommitHash = await getHeadCommit(folder.uri.fsPath) ?? undefined;
      upsertEntry(context.globalState, {
        composerId: composer.composerId,
        branchName: branch,
        promptText,
        startCommitHash,
        cachedName: composer.name,
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

      // Give Cursor a brief moment to flush aux-bar state to SQLite if the
      // user just switched tabs before running the command.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const [detected, openIds, composerData] = await Promise.all([
        getSelectedRootComposer(context),
        getOpenComposerIds(context),
        getComposerData(context),
      ]);

      let composer = detected;

      // When the aux bar has more than one composer, SQLite's "focused" flag
      // lags behind the user's last click. Let the user confirm instead of
      // silently picking the wrong tab.
      if (openIds.length > 1) {
        const rootsById = new Map(
          getRootComposers(composerData).map((c) => [c.composerId, c])
        );
        const detectedId = detected?.composerId;
        const ordered = [
          ...(detectedId ? [detectedId] : []),
          ...openIds.filter((id) => id !== detectedId),
        ];
        const picked = await vscode.window.showQuickPick(
          ordered.map((id, index) => {
            const summary = rootsById.get(id);
            return {
              label: `${index === 0 ? '$(star-full) ' : ''}${summary?.name ?? `#${id.slice(0, 8)}`}`,
              description: index === 0 ? 'detected' : undefined,
              detail: summary?.subtitle,
              composerId: id,
            };
          }),
          { placeHolder: t('messages.attachCurrent.pickPrompt'), matchOnDescription: true }
        );
        if (!picked) {
          return;
        }
        composer =
          rootsById.get(picked.composerId) ??
          { composerId: picked.composerId, createdAt: Date.now() };
      }

      if (!composer) {
        void vscode.window.showWarningMessage(t('messages.attachCurrent.openChatFirst'));
        return;
      }

      const startCommitHash = await getHeadCommit(folder.uri.fsPath) ?? undefined;
      upsertEntry(context.globalState, {
        composerId: composer.composerId,
        branchName: branch,
        startCommitHash,
        cachedName: composer.name,
        workspaceFolder: folder.uri.fsPath,
        status: 'active',
      });

      provider.refresh();
      // Cursor may write composerHeaders asynchronously — refresh again after a
      // short delay so the name is picked up once the DB is updated.
      setTimeout(() => provider.refresh(), 2500);
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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cursorBranchChat.attachCurrentClaudeChatToBranch',
      async () => {
        const folder = getWorkspaceFolder();
        if (!folder) {
          void vscode.window.showWarningMessage(t('messages.noWorkspace'));
          return;
        }

        if (!isClaudeExtensionInstalled()) {
          void vscode.window.showWarningMessage(t('messages.attachClaude.notInstalled'));
          return;
        }

        const branch = await getCurrentBranch(folder);
        const sessions = await listClaudeSessions(folder.uri.fsPath, 20);
        if (sessions.length === 0) {
          void vscode.window.showWarningMessage(t('messages.attachClaude.noSessions'));
          return;
        }

        const active = await getActiveClaudeSession(folder.uri.fsPath);

        type Pick = vscode.QuickPickItem & { sessionId: string; filePath: string };
        const picks: Pick[] = sessions.map((s) => {
          const title =
            shortenSessionTitle(s.firstUserMessage) ?? `#${s.sessionId.slice(0, 8)}`;
          const isActive = active?.sessionId === s.sessionId;
          return {
            label: `${isActive ? '$(star-full) ' : ''}${title}`,
            description: s.gitBranch,
            detail: new Date(s.mtimeMs).toLocaleString(),
            sessionId: s.sessionId,
            filePath: s.filePath,
          };
        });

        const picked = await vscode.window.showQuickPick(picks, {
          placeHolder: t('messages.attachClaude.pickPrompt'),
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (!picked) {
          return;
        }

        const summary = sessions.find((s) => s.sessionId === picked.sessionId);
        const startCommitHash = (await getHeadCommit(folder.uri.fsPath)) ?? undefined;
        const cachedName =
          shortenSessionTitle(summary?.firstUserMessage) ??
          `Claude #${picked.sessionId.slice(0, 8)}`;

        upsertEntry(context.globalState, {
          composerId: picked.sessionId,
          branchName: branch,
          startCommitHash,
          cachedName,
          workspaceFolder: folder.uri.fsPath,
          status: 'active',
          source: 'claude',
          sessionFilePath: picked.filePath,
        });

        provider.refresh();
        void vscode.window.showInformationMessage(
          t('messages.attachClaude.success', { name: cachedName, branch })
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursorBranchChat.dumpDiagnostics', async () => {
      const dump = await dumpComposerDiagnostics(context);
      const doc = await vscode.workspace.openTextDocument({
        content: dump,
        language: 'json',
      });
      await vscode.window.showTextDocument(doc);
    })
  );
}

export function deactivate(): void {}
