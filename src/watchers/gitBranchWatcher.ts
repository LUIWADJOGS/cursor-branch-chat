import * as vscode from 'vscode';
import { getEntriesForBranch } from '../storage/chatRegistry';
import { getCurrentBranch } from '../git/getCurrentBranch';

export function registerGitBranchWatcher(
  context: vscode.ExtensionContext,
  onBranchMaybeChanged: () => void
): void {
  const folder = () => vscode.workspace.workspaceFolders?.[0];
  let lastBranch: string | null = null;

  const checkAndNotify = async (): Promise<void> => {
    const f = folder();
    if (!f) return;
    const branch = await getCurrentBranch(f);
    const isSwitch = lastBranch !== null && lastBranch !== branch;
    lastBranch = branch;
    if (isSwitch) {
      onBranchMaybeChanged();
      const entries = getEntriesForBranch(context.globalState, branch, f.uri.fsPath);
      if (entries.length > 0) {
        void vscode.window.showInformationMessage(
          `Branch: ${branch}. Chats for this branch: ${entries.length}.`
        );
      }
    }
  };

  const watcher = vscode.workspace.createFileSystemWatcher('**/.git/HEAD');
  watcher.onDidChange(checkAndNotify);
  watcher.onDidCreate(checkAndNotify);
  watcher.onDidDelete(checkAndNotify);

  void checkAndNotify();

  context.subscriptions.push(watcher);
}
