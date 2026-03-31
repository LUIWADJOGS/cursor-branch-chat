import { execFile } from 'child_process';

export interface CommitDiffInfo {
  commitCount: number;
  changedFiles: string[];
}

const BASE_BRANCH_CANDIDATES = ['main', 'master', 'develop', 'dev'];

export async function getBranchBaseCommit(workspacePath: string): Promise<string | null> {
  for (const base of BASE_BRANCH_CANDIDATES) {
    const hash = await tryMergeBase(workspacePath, base);
    if (hash) {
      return hash;
    }
  }
  return null;
}

function tryMergeBase(workspacePath: string, baseBranch: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['merge-base', 'HEAD', baseBranch],
      { cwd: workspacePath },
      (err: Error | null, stdout: string) => {
        if (err || !stdout?.trim()) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

export async function getCommitAtTime(
  workspacePath: string,
  isoDate: string
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['log', `--until=${isoDate}`, '-1', '--format=%H'],
      { cwd: workspacePath },
      (err: Error | null, stdout: string) => {
        if (err || !stdout?.trim()) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

export async function getCommitDiffSince(
  workspacePath: string,
  startCommitHash: string
): Promise<CommitDiffInfo> {
  const [commitCount, changedFiles] = await Promise.all([
    getCommitCountSince(workspacePath, startCommitHash),
    getChangedFilesSince(workspacePath, startCommitHash),
  ]);
  return { commitCount, changedFiles };
}

function getCommitCountSince(workspacePath: string, startCommitHash: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['rev-list', '--count', `${startCommitHash}..HEAD`],
      { cwd: workspacePath },
      (err: Error | null, stdout: string) => {
        if (err || !stdout?.trim()) {
          resolve(0);
          return;
        }
        resolve(parseInt(stdout.trim(), 10) || 0);
      }
    );
  });
}

export async function getFullDiff(
  workspacePath: string,
  startCommitHash: string
): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['diff', startCommitHash, 'HEAD'],
      { cwd: workspacePath, maxBuffer: 10 * 1024 * 1024 },
      (err: Error | null, stdout: string) => {
        resolve(err ? '' : stdout ?? '');
      }
    );
  });
}

function getChangedFilesSince(workspacePath: string, startCommitHash: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['diff', '--name-only', startCommitHash, 'HEAD'],
      { cwd: workspacePath },
      (err: Error | null, stdout: string) => {
        if (err || !stdout?.trim()) {
          resolve([]);
          return;
        }
        resolve(stdout.trim().split('\n').filter(Boolean));
      }
    );
  });
}
