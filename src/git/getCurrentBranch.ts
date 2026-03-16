import * as vscode from 'vscode';

const FALLBACK_BRANCH = 'unknown';

export async function getCurrentBranch(workspaceFolder: vscode.WorkspaceFolder | undefined): Promise<string> {
  if (!workspaceFolder) {
    return FALLBACK_BRANCH;
  }
  const gitExtension = vscode.extensions.getExtension<{ getAPI: (version: number) => GitApi | undefined }>('vscode.git');
  if (gitExtension?.isActive) {
    const api = gitExtension.exports?.getAPI(1);
    const repo = api?.repositories?.find((r: { rootUri: { fsPath: string } }) => r.rootUri.fsPath === workspaceFolder.uri.fsPath);
    const head = repo?.state?.HEAD?.name;
    if (typeof head === 'string' && head.length > 0) {
      return head;
    }
  }
  return getCurrentBranchViaCli(workspaceFolder.uri.fsPath);
}

import { execFile } from 'child_process';

async function getCurrentBranchViaCli(workspacePath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspacePath }, (err: Error | null, stdout: string) => {
      if (err || !stdout?.trim()) {
        resolve(FALLBACK_BRANCH);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

interface GitApi {
  repositories: Array<{ rootUri: { fsPath: string }; state: { HEAD?: { name?: string } } }>;
}
