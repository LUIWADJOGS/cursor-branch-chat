import * as vscode from 'vscode';
import { execFile } from 'child_process';

export const GIT_CONTENT_SCHEME = 'bcc-git';

/**
 * Serves the content of a file at a specific git commit.
 * URI format: bcc-git:/<relativeFilePath>?hash=<commitHash>&workspace=<workspacePath>
 */
export class GitContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const hash = params.get('hash');
    const workspace = params.get('workspace');
    if (!hash || !workspace) {
      return '';
    }

    const relativeFilePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;

    return new Promise((resolve) => {
      execFile(
        'git',
        ['show', `${hash}:${relativeFilePath}`],
        { cwd: workspace, maxBuffer: 10 * 1024 * 1024 },
        (err: Error | null, stdout: string) => {
          resolve(err ? '' : (stdout ?? ''));
        }
      );
    });
  }
}

export function buildGitUri(
  workspacePath: string,
  relativeFilePath: string,
  commitHash: string
): vscode.Uri {
  const encodedPath = relativeFilePath.split('/').map(encodeURIComponent).join('/');
  return vscode.Uri.parse(
    `${GIT_CONTENT_SCHEME}:/${encodedPath}?hash=${encodeURIComponent(commitHash)}&workspace=${encodeURIComponent(workspacePath)}`
  );
}
