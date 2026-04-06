import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { execFile } from 'child_process';
import * as path from 'path';
import type { CursorComposerData, CursorComposerSummary } from '../types/branchChat';

const COMPOSER_STORAGE_KEY = 'composer.composerData';
const COMPOSER_HEADERS_KEY = 'composer.composerHeaders';
const PYTHON_CANDIDATES = ['python3', 'python'];

let _log: vscode.OutputChannel | undefined;
function log(msg: string): void {
  if (!_log) {
    _log = vscode.window.createOutputChannel('Branch Chats Debug');
  }
  _log.appendLine(`[${new Date().toISOString()}] ${msg}`);
}

export async function getComposerData(
  context: vscode.ExtensionContext
): Promise<CursorComposerData | null> {
  const dbPath = getWorkspaceDatabasePath(context);
  log(`workspaceDb: ${dbPath ?? 'NULL'}`);
  log(`storageUri: ${context.storageUri?.fsPath ?? 'NULL'}`);
  log(`globalStorageUri: ${context.globalStorageUri?.fsPath ?? 'NULL'}`);

  if (!dbPath) {
    log('getComposerData: no workspace DB, returning null');
    return null;
  }

  const [raw, globalRaw] = await Promise.all([
    readCursorStorageValue(dbPath, COMPOSER_STORAGE_KEY),
    readGlobalComposerHeaders(context),
  ]);

  log(`workspace raw length: ${raw?.length ?? 'NULL'}`);
  log(`global headers count: ${globalRaw.length}`);

  if (!raw) {
    log('getComposerData: workspace composerData is null, returning null');
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CursorComposerData;
    if (!parsed) {
      log('getComposerData: parsed is falsy, returning null');
      return null;
    }

    // After Cursor's migration allComposers may be absent entirely — treat as empty.
    if (!Array.isArray(parsed.allComposers)) {
      parsed.allComposers = [];
    }

    log(`workspace allComposers count: ${parsed.allComposers.length}`);

    // Merge global headers so names from other workspaces / migrated chats are available.
    if (globalRaw && globalRaw.length > 0) {
      const knownIds = new Set(parsed.allComposers.map((c) => c.composerId));
      for (const hdr of globalRaw) {
        if (!knownIds.has(hdr.composerId)) {
          parsed.allComposers.push(hdr);
        }
      }
    }

    log(`merged allComposers count: ${parsed.allComposers.length}`);
    return parsed;
  } catch (e) {
    log(`getComposerData: parse error: ${e}`);
    return null;
  }
}

async function readGlobalComposerHeaders(
  context: vscode.ExtensionContext
): Promise<CursorComposerSummary[]> {
  const globalDbPath = getGlobalDatabasePath(context);
  log(`globalDb: ${globalDbPath ?? 'NULL'}`);
  if (!globalDbPath) {
    return [];
  }

  try {
    const raw = await readCursorStorageValue(globalDbPath, COMPOSER_HEADERS_KEY);
    log(`composerHeaders raw length: ${raw?.length ?? 'NULL'}`);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as { allComposers?: CursorComposerSummary[] };
    return Array.isArray(parsed.allComposers) ? parsed.allComposers : [];
  } catch (e) {
    log(`readGlobalComposerHeaders error: ${e}`);
    return [];
  }
}

export async function getSelectedComposerId(
  context: vscode.ExtensionContext
): Promise<string | null> {
  const data = await getComposerData(context);
  return data?.selectedComposerIds?.[0] ?? data?.lastFocusedComposerIds?.[0] ?? null;
}

export async function getSelectedRootComposer(
  context: vscode.ExtensionContext
): Promise<CursorComposerSummary | null> {
  const [data, activeId] = await Promise.all([
    getComposerData(context),
    getActiveComposerId(context),
  ]);

  const selectedComposerId =
    activeId ??
    data?.lastFocusedComposerIds?.[0] ??
    data?.selectedComposerIds?.[0] ??
    null;

  if (!selectedComposerId) {
    return null;
  }

  const selectedComposer = data?.allComposers.find(
    (composer) => composer.composerId === selectedComposerId
  );

  // Cursor may have migrated old chats out of allComposers — fall back to a
  // minimal summary so the user can still attach whichever chat is active.
  if (!selectedComposer) {
    return { composerId: selectedComposerId, createdAt: Date.now() };
  }

  if (selectedComposer.subagentInfo?.parentComposerId) {
    return (
      data!.allComposers.find(
        (composer) => composer.composerId === selectedComposer.subagentInfo?.parentComposerId
      ) ?? selectedComposer
    );
  }

  return selectedComposer;
}

export function getRootComposers(data: CursorComposerData | null): CursorComposerSummary[] {
  if (!data) {
    return [];
  }

  return data.allComposers.filter((composer) => {
    if (composer.isArchived) {
      return false;
    }
    // New Cursor (post-migration): all root chats have type "head"; no subagentInfo.
    // Old Cursor: root chats have no subagentInfo field at all.
    const composerWithType = composer as CursorComposerSummary & { type?: string };
    if (composerWithType.type !== undefined) {
      return composerWithType.type === 'head';
    }
    return !composer.subagentInfo;
  });
}

export async function waitForNewComposer(
  context: vscode.ExtensionContext,
  previousComposerId: string | null,
  startedAt: number,
  timeoutMs = 12000
): Promise<CursorComposerSummary | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const data = await getComposerData(context);
    const rootComposers = getRootComposers(data);
    const selectedComposerId =
      data?.selectedComposerIds?.[0] ?? data?.lastFocusedComposerIds?.[0] ?? null;

    if (selectedComposerId && selectedComposerId !== previousComposerId) {
      const selectedComposer = rootComposers.find(
        (composer) => composer.composerId === selectedComposerId
      );
      if (selectedComposer) {
        return selectedComposer;
      }
    }

    const recentComposer = rootComposers.find(
      (composer) =>
        composer.composerId !== previousComposerId &&
        typeof composer.createdAt === 'number' &&
        composer.createdAt >= startedAt - 2000
    );
    if (recentComposer) {
      return recentComposer;
    }

    await delay(500);
  }

  return null;
}

export async function selectComposer(
  context: vscode.ExtensionContext,
  composerId: string
): Promise<boolean> {
  const dbPath = getWorkspaceDatabasePath(context);
  const data = await getComposerData(context);
  if (!dbPath || !data) {
    return false;
  }

  const nextData: CursorComposerData = {
    ...data,
    selectedComposerIds: reorderComposerIds(
      composerId,
      data.selectedComposerIds,
      data.lastFocusedComposerIds
    ),
    lastFocusedComposerIds: reorderComposerIds(
      composerId,
      data.lastFocusedComposerIds,
      data.selectedComposerIds
    ),
  };

  const updatedSelection = await writeCursorStorageValue(
    dbPath,
    COMPOSER_STORAGE_KEY,
    JSON.stringify(nextData)
  );
  const updatedPaneState = await rewriteComposerPaneViewState(dbPath, composerId);
  const updatedActivePanel = await setActiveComposerPanel(dbPath, composerId);
  return updatedSelection || updatedPaneState || updatedActivePanel;
}

export async function getActiveComposerId(
  context: vscode.ExtensionContext
): Promise<string | null> {
  const dbPath = getWorkspaceDatabasePath(context);
  if (!dbPath) {
    return null;
  }

  const activePanelId = await readCursorStorageValue(dbPath, 'workbench.auxiliarybar.activepanelid');
  if (!activePanelId?.startsWith('workbench.panel.aichat.')) {
    return null;
  }

  const panelSuffix = activePanelId.slice('workbench.panel.aichat.'.length);
  const paneStateRaw = await readCursorStorageValue(
    dbPath,
    `workbench.panel.composerChatViewPane.${panelSuffix}`
  );
  if (!paneStateRaw) {
    return null;
  }

  try {
    const paneState = JSON.parse(paneStateRaw) as Record<string, unknown>;
    const viewId = Object.keys(paneState)[0];
    if (!viewId?.startsWith('workbench.panel.aichat.view.')) {
      return null;
    }
    return viewId.slice('workbench.panel.aichat.view.'.length);
  } catch {
    return null;
  }
}

function reorderComposerIds(
  primaryComposerId: string,
  ...composerIdGroups: Array<string[] | undefined>
): string[] {
  const orderedComposerIds = [primaryComposerId];

  for (const group of composerIdGroups) {
    if (!group) {
      continue;
    }

    for (const composerId of group) {
      if (!orderedComposerIds.includes(composerId)) {
        orderedComposerIds.push(composerId);
      }
    }
  }

  return orderedComposerIds;
}

function getWorkspaceDatabasePath(context: vscode.ExtensionContext): string | null {
  if (!context.storageUri) {
    return null;
  }

  const workspaceStorageRoot = path.dirname(context.storageUri.fsPath);
  const dbPath = path.join(workspaceStorageRoot, 'state.vscdb');
  return existsSync(dbPath) ? dbPath : null;
}

function getGlobalDatabasePath(context: vscode.ExtensionContext): string | null {
  // globalStorageUri = .../User/globalStorage/<ext-id>
  // state.vscdb lives one level up, alongside the extension folder.
  const globalStorageUri = context.globalStorageUri;
  if (globalStorageUri) {
    const dbPath = path.join(path.dirname(globalStorageUri.fsPath), 'state.vscdb');
    if (existsSync(dbPath)) {
      return dbPath;
    }
  }

  // Fallback: derive from workspace storageUri (.../workspaceStorage/<hash>/<ext-id>)
  if (context.storageUri) {
    const userDir = path.resolve(context.storageUri.fsPath, '../../..');
    const dbPath = path.join(userDir, 'globalStorage', 'state.vscdb');
    if (existsSync(dbPath)) {
      return dbPath;
    }
  }

  return null;
}

async function readCursorStorageValue(
  dbPath: string,
  key: string
): Promise<string | null> {
  const script = [
    'import sqlite3, sys',
    'db_path, key = sys.argv[1], sys.argv[2]',
    "conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)",
    'cur = conn.cursor()',
    "row = cur.execute(\"SELECT value FROM ItemTable WHERE [key] = ?\", (key,)).fetchone()",
    "print(row[0] if row and row[0] else '')",
  ].join('\n');

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const stdout = await execFileAsync(candidate, [ '-c', script, dbPath, key ]);
      return stdout.trim() || null;
    } catch {
      continue;
    }
  }

  return null;
}

async function writeCursorStorageValue(
  dbPath: string,
  key: string,
  value: string
): Promise<boolean> {
  const script = [
    'import sqlite3, sys',
    'db_path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]',
    'conn = sqlite3.connect(db_path)',
    'cur = conn.cursor()',
    "cur.execute(\"UPDATE ItemTable SET value = ? WHERE [key] = ?\", (value, key))",
    'conn.commit()',
    'print(cur.rowcount)',
  ].join('\n');

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const stdout = await execFileAsync(candidate, [ '-c', script, dbPath, key, value ]);
      return Number(stdout.trim()) > 0;
    } catch {
      continue;
    }
  }

  return false;
}

async function rewriteComposerPaneViewState(
  dbPath: string,
  composerId: string
): Promise<boolean> {
  const targetViewId = `workbench.panel.aichat.view.${composerId}`;
  const prefix = 'workbench.panel.composerChatViewPane.';
  const script = [
    'import json, sqlite3, sys',
    'db_path, prefix, target_view_id = sys.argv[1], sys.argv[2], sys.argv[3]',
    'conn = sqlite3.connect(db_path)',
    'cur = conn.cursor()',
    "rows = cur.execute(\"SELECT [key], value FROM ItemTable WHERE [key] LIKE ?\", (prefix + '%',)).fetchall()",
    'updated = 0',
    'for key, value in rows:',
    '    try:',
    '        parsed = json.loads(value) if value else {}',
    '    except Exception:',
    '        parsed = {}',
    '    first_value = next(iter(parsed.values()), {"collapsed": False, "isHidden": False, "size": 1348})',
    '    next_value = json.dumps({target_view_id: first_value}, separators=(\",\", \":\"))',
    '    cur.execute("UPDATE ItemTable SET value = ? WHERE [key] = ?", (next_value, key))',
    '    updated += cur.rowcount',
    'conn.commit()',
    'print(updated)',
  ].join('\n');

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const stdout = await execFileAsync(candidate, ['-c', script, dbPath, prefix, targetViewId]);
      return Number(stdout.trim()) > 0;
    } catch {
      continue;
    }
  }

  return false;
}

async function setActiveComposerPanel(
  dbPath: string,
  composerId: string
): Promise<boolean> {
  const paneKey = await findPaneKeyForComposer(dbPath, composerId);
  if (!paneKey) {
    return false;
  }

  const panelId = `workbench.panel.aichat.${paneKey}`;
  return writeCursorStorageValue(dbPath, 'workbench.auxiliarybar.activepanelid', panelId);
}

async function findPaneKeyForComposer(
  dbPath: string,
  composerId: string
): Promise<string | null> {
  const targetViewId = `workbench.panel.aichat.view.${composerId}`;
  const prefix = 'workbench.panel.composerChatViewPane.';
  const script = [
    'import json, sqlite3, sys',
    'db_path, prefix, target_view_id = sys.argv[1], sys.argv[2], sys.argv[3]',
    'conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)',
    'cur = conn.cursor()',
    "rows = cur.execute(\"SELECT [key], value FROM ItemTable WHERE [key] LIKE ?\", (prefix + '%',)).fetchall()",
    'for key, value in rows:',
    '    try:',
    '        parsed = json.loads(value) if value else {}',
    '    except Exception:',
    '        parsed = {}',
    '    if target_view_id in parsed:',
    '        print(key[len(prefix):])',
    '        break',
  ].join('\n');

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const stdout = await execFileAsync(candidate, ['-c', script, dbPath, prefix, targetViewId]);
      return stdout.trim() || null;
    } catch {
      continue;
    }
  }

  return null;
}

function execFileAsync(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
