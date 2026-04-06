import * as vscode from 'vscode';
import type { BranchChatEntry, ChatRegistryData } from '../types/branchChat';

const STORAGE_KEY = 'cursorBranchChat.registry';
const DATA_VERSION = 1;

function loadRaw(context: vscode.Memento): ChatRegistryData | null {
  const raw = context.get<ChatRegistryData>(STORAGE_KEY);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) {
    return null;
  }
  return raw;
}

function saveRaw(context: vscode.Memento, data: ChatRegistryData): void {
  context.update(STORAGE_KEY, data);
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getAllEntries(context: vscode.Memento): BranchChatEntry[] {
  const data = loadRaw(context);
  return data ? data.entries : [];
}

export function getEntriesForBranch(context: vscode.Memento, branchName: string, workspaceFolder: string): BranchChatEntry[] {
  const entries = getAllEntries(context);
  return entries.filter(
    (e) => e.branchName === branchName && e.workspaceFolder === workspaceFolder && e.status === 'active'
  );
}

export function getEntryByComposerId(
  context: vscode.Memento,
  composerId: string,
  workspaceFolder: string
): BranchChatEntry | null {
  const entries = getAllEntries(context);
  return entries.find((e) => e.composerId === composerId && e.workspaceFolder === workspaceFolder) ?? null;
}

export function upsertEntry(
  context: vscode.Memento,
  entry: Omit<BranchChatEntry, 'id' | 'createdAt' | 'updatedAt'>
): BranchChatEntry {
  const all = getAllEntries(context);
  const now = new Date().toISOString();
  const existingIndex = all.findIndex(
    (candidate) =>
      candidate.composerId === entry.composerId && candidate.workspaceFolder === entry.workspaceFolder
  );

  if (existingIndex !== -1) {
    const updated: BranchChatEntry = {
      ...all[existingIndex],
      ...entry,
      updatedAt: now,
    };
    const newEntries = [...all];
    newEntries[existingIndex] = updated;
    saveRaw(context, { entries: newEntries, version: DATA_VERSION });
    return updated;
  }

  const newEntry: BranchChatEntry = {
    ...entry,
    id: nextId(),
    createdAt: now,
    updatedAt: now,
  };
  const data: ChatRegistryData = {
    entries: [...all, newEntry],
    version: DATA_VERSION,
  };
  saveRaw(context, data);
  return newEntry;
}

export function updateEntry(
  context: vscode.Memento,
  id: string,
  patch: Partial<Pick<BranchChatEntry, 'branchName' | 'startCommitHash' | 'cachedName' | 'customName' | 'status' | 'updatedAt'>>
): BranchChatEntry | null {
  const all = getAllEntries(context);
  const index = all.findIndex((e) => e.id === id);
  if (index === -1) return null;
  const updated: BranchChatEntry = {
    ...all[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const newEntries = [...all];
  newEntries[index] = updated;
  saveRaw(context, { entries: newEntries, version: DATA_VERSION });
  return updated;
}

export function archiveEntry(context: vscode.Memento, id: string): BranchChatEntry | null {
  return updateEntry(context, id, { status: 'archived' });
}
