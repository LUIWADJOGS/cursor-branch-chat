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
  const focused = await resolveFocusedComposerId(context);
  if (focused) {
    return focused;
  }
  const data = await getComposerData(context);
  return data?.lastFocusedComposerIds?.[0] ?? data?.selectedComposerIds?.[0] ?? null;
}

export async function getSelectedRootComposer(
  context: vscode.ExtensionContext
): Promise<CursorComposerSummary | null> {
  const [data, focusedId] = await Promise.all([
    getComposerData(context),
    resolveFocusedComposerId(context),
  ]);

  const selectedComposerId =
    focusedId ??
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

export async function getOpenComposerIds(
  context: vscode.ExtensionContext
): Promise<string[]> {
  const dbPath = getWorkspaceDatabasePath(context);
  if (!dbPath) {
    return [];
  }

  const embeddedIds = await readEmbeddedAuxBarComposerIds(dbPath);
  if (embeddedIds.length > 0) {
    return embeddedIds;
  }

  const paneInfo = await readActivePaneComposerInfo(dbPath);
  return paneInfo.orderedIds;
}

/**
 * Read the focused composerId directly from the VSCode TabGroups API.
 * Covers "editor mode" composer tabs where Cursor opens the chat as a regular
 * editor tab. Returns null for aux-bar-hosted chats (those are invisible to
 * the public tabs API and handled by the SQLite path below).
 */
function readFocusedComposerFromTabGroups(): string | null {
  try {
    const activeGroup =
      vscode.window.tabGroups.all.find((g) => g.isActive) ?? vscode.window.tabGroups.activeTabGroup;
    const activeTab = activeGroup?.activeTab;
    const candidates: vscode.Tab[] = [];
    if (activeTab) {
      candidates.push(activeTab);
    }
    for (const group of vscode.window.tabGroups.all) {
      if (group.activeTab && group.activeTab !== activeTab) {
        candidates.push(group.activeTab);
      }
    }

    for (const tab of candidates) {
      const id = extractComposerIdFromTab(tab);
      if (id) {
        return id;
      }
    }
  } catch (e) {
    log(`readFocusedComposerFromTabGroups error: ${e}`);
  }
  return null;
}

function extractComposerIdFromTab(tab: vscode.Tab): string | null {
  const input = tab.input as Record<string, unknown> | undefined;
  if (!input) {
    return null;
  }

  const viewType = typeof input.viewType === 'string' ? input.viewType : '';
  const isComposerLike =
    viewType.toLowerCase().includes('composer') || viewType.toLowerCase().includes('aichat');

  const directId = typeof input.composerId === 'string' ? input.composerId : '';
  if (directId && UUID_RE.test(directId)) {
    return directId;
  }

  const uri = input.uri as vscode.Uri | undefined;
  if (uri) {
    const fromUri = extractUuid(uri.path) ?? extractUuid(uri.query) ?? extractUuid(uri.fragment);
    if (fromUri && (isComposerLike || uri.scheme.toLowerCase().includes('composer'))) {
      return fromUri;
    }
  }

  if (isComposerLike) {
    const idField = typeof input.id === 'string' ? input.id : '';
    const fromId = extractUuid(idField);
    if (fromId) {
      return fromId;
    }
  }

  return null;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function extractUuid(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = UUID_RE.exec(value);
  return match ? match[0] : null;
}

/**
 * Prefer the real-time VSCode API (no SQLite lag when user switches tabs),
 * then the active embedded-aux-bar editor state on newer Cursor builds,
 * then the older composer pane state when that metadata is unavailable.
 */
async function resolveFocusedComposerId(context: vscode.ExtensionContext): Promise<string | null> {
  const fromTabs = readFocusedComposerFromTabGroups();
  if (fromTabs) {
    log(`resolveFocusedComposerId (tabGroups): ${fromTabs}`);
    return fromTabs;
  }

  const dbPath = getWorkspaceDatabasePath(context);
  if (!dbPath) {
    return null;
  }

  try {
    const embeddedComposerIds = await readEmbeddedAuxBarComposerIds(dbPath);
    if (embeddedComposerIds.length > 0) {
      log(`resolveFocusedComposerId (embedded aux bar): ${embeddedComposerIds[0]}`);
      return embeddedComposerIds[0];
    }

    const raw = await readCursorStorageValue(dbPath, COMPOSER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as {
      selectedComposerIds?: string[];
      lastFocusedComposerIds?: string[];
    };
    const paneInfo = await readActivePaneComposerInfo(dbPath);
    const orderedOpen = paneInfo.orderedIds;

    if (orderedOpen.length === 0) {
      const stale =
        parsed.lastFocusedComposerIds?.[0] ?? parsed.selectedComposerIds?.[0] ?? null;
      log(`resolveFocusedComposerId (no open pane): ${stale ?? 'NULL'}`);
      return stale;
    }

    if (orderedOpen.length === 1) {
      log(`resolveFocusedComposerId (single tab): ${orderedOpen[0]}`);
      return orderedOpen[0];
    }

    const openSet = new Set(orderedOpen);

    for (const id of parsed.lastFocusedComposerIds ?? []) {
      if (openSet.has(id)) {
        log(`resolveFocusedComposerId (lastFocused ∩ open): ${id}`);
        return id;
      }
    }
    for (const id of parsed.selectedComposerIds ?? []) {
      if (openSet.has(id)) {
        log(`resolveFocusedComposerId (selected ∩ open): ${id}`);
        return id;
      }
    }

    const sized = orderedOpen.filter((id) => paneInfo.sizeById.get(id) !== undefined);
    if (sized.length === 1) {
      log(`resolveFocusedComposerId (unique size): ${sized[0]}`);
      return sized[0];
    }

    const lastInPane = orderedOpen[orderedOpen.length - 1];
    log(`resolveFocusedComposerId (last tab in pane order): ${lastInPane}`);
    return lastInPane;
  } catch (e) {
    log(`resolveFocusedComposerId error: ${e}`);
    return null;
  }
}

type EmbeddedAuxBarEditorState = {
  activeGroup?: number;
  mostRecentActiveGroups?: number[];
  serializedGrid?: {
    root?: EmbeddedAuxBarGridNode;
  };
};

type EmbeddedAuxBarGridNode =
  | {
      type?: 'branch';
      data?: EmbeddedAuxBarGridNode[];
    }
  | {
      type?: 'leaf';
      data?: {
        id?: number;
        editors?: Array<{
          id?: string;
          value?: string;
        }>;
        mru?: number[];
      };
    };

async function readEmbeddedAuxBarComposerIds(dbPath: string): Promise<string[]> {
  const raw = await readCursorStorageValue(dbPath, 'workbench.parts.embeddedAuxBarEditor.state');
  if (!raw) {
    return [];
  }

  try {
    const state = JSON.parse(raw) as EmbeddedAuxBarEditorState;
    const activeGroupId =
      typeof state.activeGroup === 'number'
        ? state.activeGroup
        : state.mostRecentActiveGroups?.find((groupId): groupId is number => typeof groupId === 'number');
    if (activeGroupId === undefined) {
      return [];
    }

    const activeLeaf = findEmbeddedAuxBarLeafById(state.serializedGrid?.root, activeGroupId);
    log(`readEmbeddedAuxBarComposerIds: activeGroupId=${activeGroupId}, rootType=${(state.serializedGrid?.root as any)?.type ?? 'NONE'}, leafFound=${!!activeLeaf}`);
    const editors = activeLeaf?.data?.editors;
    if (!Array.isArray(editors) || editors.length === 0) {
      log(`readEmbeddedAuxBarComposerIds: no editors in leaf (editors=${editors ? 'empty' : 'null'})`);
      return [];
    }
    log(`readEmbeddedAuxBarComposerIds: ${editors.length} editor(s), ids=[${editors.map(e => e?.id ?? '?').join(', ')}], mru=${JSON.stringify(activeLeaf?.data?.mru)}`);

    const preferredIndexes = [
      ...(activeLeaf?.data?.mru ?? []),
      ...editors.map((_, index) => index),
    ].filter((index, position, all) => Number.isInteger(index) && all.indexOf(index) === position);

    const composerIds: string[] = [];
    for (const index of preferredIndexes) {
      const editor = editors[index];
      if (editor?.id !== 'workbench.editor.composer.input' || !editor.value) {
        continue;
      }

      const parsed = JSON.parse(editor.value) as { composerId?: unknown };
      if (typeof parsed.composerId === 'string' && parsed.composerId) {
        composerIds.push(parsed.composerId);
      }
    }

    return composerIds;
  } catch (e) {
    log(`readEmbeddedAuxBarComposerIds error: ${e}`);
    return [];
  }
}

function findEmbeddedAuxBarLeafById(
  node: EmbeddedAuxBarGridNode | undefined,
  targetId: number
): Extract<EmbeddedAuxBarGridNode, { type?: 'leaf' }> | null {
  if (!node) {
    return null;
  }

  // Leaf node: data is an object with an id field (not an array).
  // Check this way instead of relying on node.type because the root
  // node of VSCode's serialized grid often has no `type` property.
  if (node.data && !Array.isArray(node.data) && typeof node.data === 'object') {
    const leaf = node as Extract<EmbeddedAuxBarGridNode, { type?: 'leaf' }>;
    return leaf.data?.id === targetId ? leaf : null;
  }

  // Branch node: data is an array of children.  Works whether or not
  // `type` is set (the root grid node typically omits it).
  if (Array.isArray(node.data)) {
    for (const child of node.data) {
      const match = findEmbeddedAuxBarLeafById(child, targetId);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

type ActivePaneComposerInfo = {
  orderedIds: string[];
  sizeById: Map<string, number>;
};

async function readActivePaneComposerInfo(dbPath: string): Promise<ActivePaneComposerInfo> {
  const empty: ActivePaneComposerInfo = { orderedIds: [], sizeById: new Map() };

  const activePanelId = await readCursorStorageValue(dbPath, 'workbench.auxiliarybar.activepanelid');
  if (!activePanelId?.startsWith('workbench.panel.aichat.')) {
    return empty;
  }

  const panelSuffix = activePanelId.slice('workbench.panel.aichat.'.length);
  const paneStateRaw = await readCursorStorageValue(
    dbPath,
    `workbench.panel.composerChatViewPane.${panelSuffix}`
  );
  if (!paneStateRaw) {
    return empty;
  }

  try {
    const paneState = JSON.parse(paneStateRaw) as Record<string, unknown>;
    const orderedIds: string[] = [];
    const sizeById = new Map<string, number>();

    for (const viewId of Object.keys(paneState)) {
      if (!viewId.startsWith('workbench.panel.aichat.view.')) {
        continue;
      }
      const composerId = viewId.slice('workbench.panel.aichat.view.'.length);
      orderedIds.push(composerId);
      const state = paneState[viewId];
      if (state && typeof state === 'object') {
        const size = (state as { size?: unknown }).size;
        if (typeof size === 'number') {
          sizeById.set(composerId, size);
        }
      }
    }

    return { orderedIds, sizeById };
  } catch {
    return empty;
  }
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
    const selectedComposerId = await resolveFocusedComposerId(context);

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

export async function getActiveComposerId(
  context: vscode.ExtensionContext
): Promise<string | null> {
  return resolveFocusedComposerId(context);
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

/**
 * Diagnostic: dump all storage keys related to composer/editor/auxbar
 * so we can see what Cursor actually stores.
 */
export async function dumpComposerDiagnostics(
  context: vscode.ExtensionContext
): Promise<string> {
  const lines: string[] = [];
  const dbPath = getWorkspaceDatabasePath(context);
  lines.push(`workspaceDb: ${dbPath ?? 'NULL'}`);

  if (!dbPath) {
    return lines.join('\n');
  }

  // List all keys that contain composer/auxbar/aichat/editor
  const listScript = [
    'import sqlite3, sys, json',
    'db_path = sys.argv[1]',
    "conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)",
    'cur = conn.cursor()',
    "rows = cur.execute(\"SELECT [key] FROM ItemTable\").fetchall()",
    "keys = [r[0] for r in rows]",
    "relevant = [k for k in keys if any(w in k.lower() for w in ['composer', 'auxbar', 'aichat', 'embeddedaux', 'auxiliarybar', 'panel.chat'])]",
    "print(json.dumps(relevant))",
  ].join('\n');

  let relevantKeys: string[] = [];
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const stdout = await execFileAsync(candidate, ['-c', listScript, dbPath]);
      relevantKeys = JSON.parse(stdout.trim());
      break;
    } catch {
      continue;
    }
  }

  lines.push(`\n=== Relevant keys (${relevantKeys.length}) ===`);
  for (const key of relevantKeys) {
    lines.push(`  ${key}`);
  }

  // Dump values for the critical keys
  const criticalKeys = [
    'workbench.parts.embeddedAuxBarEditor.state',
    'composer.composerData',
    'workbench.auxiliarybar.activepanelid',
    ...relevantKeys.filter((k) => k.startsWith('workbench.panel.composerChatViewPane.')),
  ];

  for (const key of [...new Set(criticalKeys)]) {
    const raw = await readCursorStorageValue(dbPath, key);
    lines.push(`\n=== ${key} ===`);
    if (!raw) {
      lines.push('  (null)');
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      lines.push(JSON.stringify(parsed, null, 2).slice(0, 3000));
    } catch {
      lines.push(raw.slice(0, 1000));
    }
  }

  // Dump VSCode Tab Groups API (real-time, no SQLite lag)
  lines.push('\n=== vscode.window.tabGroups ===');
  try {
    for (const group of vscode.window.tabGroups.all) {
      lines.push(`Group viewColumn=${group.viewColumn} isActive=${group.isActive} tabs=${group.tabs.length}`);
      for (const tab of group.tabs) {
        const input = tab.input as Record<string, unknown> | undefined;
        lines.push(`  Tab label=${JSON.stringify(tab.label)} isActive=${tab.isActive} inputType=${input?.constructor?.name ?? typeof input}`);
        if (input) {
          const props: Record<string, unknown> = {};
          for (const key of ['viewType', 'uri', 'composerId', 'id', 'scheme'] as const) {
            if (key in input) {
              props[key] = String(input[key]);
            }
          }
          lines.push(`    props=${JSON.stringify(props)}`);
        }
      }
    }
  } catch (e) {
    lines.push(`  error: ${e}`);
  }

  // Check lastActivePart
  const lastActivePart = await readCursorStorageValue(dbPath, 'workbench.parts.embeddedAuxBarEditor.lastActivePart');
  lines.push(`\n=== lastActivePart ===`);
  lines.push(lastActivePart ?? '(null)');

  return lines.join('\n');
}
