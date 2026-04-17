import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

export interface ClaudeSessionSummary {
  sessionId: string;
  filePath: string;
  mtimeMs: number;
  firstUserMessage?: string;
  gitBranch?: string;
  cwd?: string;
}

const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code';

export function isClaudeExtensionInstalled(): boolean {
  return Boolean(vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID));
}

/**
 * Turn `/home/a/dev/foo.bar` into `-home-a-dev-foo-bar` — matches Claude's
 * folder naming (both `/` and `.` are replaced with `-`).
 */
export function slugifyWorkspacePath(absPath: string): string {
  return absPath.replace(/[/.]/g, '-');
}

function claudeProjectsRoot(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * Resolve the Claude project directory for a workspace.
 *
 * Tries the exact slug first; if the folder is missing we walk the workspace
 * path upwards (project root may differ from the VSCode workspace folder when
 * a subfolder was opened) and, as a last resort, match any project folder
 * whose slug is a prefix of the workspace slug.
 */
export function getClaudeProjectDir(workspaceFolder: string): string {
  const root = claudeProjectsRoot();
  const exact = path.join(root, slugifyWorkspacePath(workspaceFolder));
  if (fs.existsSync(exact)) {
    return exact;
  }

  // Walk up through parent dirs (subfolder opened in VSCode).
  let current = workspaceFolder;
  while (true) {
    const parent = path.dirname(current);
    if (!parent || parent === current) break;
    const candidate = path.join(root, slugifyWorkspacePath(parent));
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    current = parent;
  }

  // Last resort: find a project folder whose slug is a prefix of our slug.
  try {
    const target = slugifyWorkspacePath(workspaceFolder);
    const dirs = fs.readdirSync(root);
    const match = dirs
      .filter((name) => target.startsWith(name) || name.startsWith(target))
      .sort((a, b) => b.length - a.length)[0];
    if (match) {
      return path.join(root, match);
    }
  } catch {
    // root missing or unreadable — fall through
  }

  return exact;
}

export function listClaudeSessionFiles(workspaceFolder: string): string[] {
  const dir = getClaudeProjectDir(workspaceFolder);
  if (!fs.existsSync(dir)) {
    return [];
  }
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

/**
 * Read just enough of a JSONL to extract the first user message + metadata.
 * Only reads the opening ~16 KiB to avoid loading multi-MB transcripts.
 */
export async function readClaudeSessionSummary(
  filePath: string
): Promise<ClaudeSessionSummary | null> {
  const sessionId = path.basename(filePath, '.jsonl');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }

  let head: string;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(Math.min(16 * 1024, stat.size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    head = buf.toString('utf8');
  } catch {
    return { sessionId, filePath, mtimeMs: stat.mtimeMs };
  }

  let firstUserMessage: string | undefined;
  let gitBranch: string | undefined;
  let cwd: string | undefined;

  for (const line of head.split('\n')) {
    if (!line.trim()) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!gitBranch && typeof obj.gitBranch === 'string') {
      gitBranch = obj.gitBranch;
    }
    if (!cwd && typeof obj.cwd === 'string') {
      cwd = obj.cwd;
    }
    if (!firstUserMessage && obj.type === 'user') {
      firstUserMessage = extractUserText(obj.message) ?? firstUserMessage;
    }
    if (firstUserMessage && gitBranch && cwd) {
      break;
    }
  }

  return {
    sessionId,
    filePath,
    mtimeMs: stat.mtimeMs,
    firstUserMessage,
    gitBranch,
    cwd,
  };
}

function extractUserText(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  for (const part of content) {
    if (
      part &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
    ) {
      return ((part as { text: string }).text).trim() || undefined;
    }
  }
  return undefined;
}

export async function listClaudeSessions(
  workspaceFolder: string,
  limit = 20
): Promise<ClaudeSessionSummary[]> {
  const files = listClaudeSessionFiles(workspaceFolder);
  const summaries: ClaudeSessionSummary[] = [];
  for (const file of files) {
    const summary = await readClaudeSessionSummary(file);
    if (summary) {
      summaries.push(summary);
    }
  }
  summaries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return summaries.slice(0, limit);
}

/** Newest-mtime JSONL under the workspace project dir. */
export async function getActiveClaudeSession(
  workspaceFolder: string
): Promise<ClaudeSessionSummary | null> {
  const all = await listClaudeSessions(workspaceFolder, 1);
  return all[0] ?? null;
}

/** Get a session by id (composerId slot for claude entries). */
export async function getClaudeSessionById(
  workspaceFolder: string,
  sessionId: string
): Promise<ClaudeSessionSummary | null> {
  const filePath = path.join(getClaudeProjectDir(workspaceFolder), `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readClaudeSessionSummary(filePath);
}

export function shortenSessionTitle(text: string | undefined, max = 60): string | undefined {
  if (!text) return undefined;
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (!oneLine) return undefined;
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}
