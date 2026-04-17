export type BranchChatStatus = 'active' | 'archived';

export type ChatSource = 'cursor' | 'claude';

export interface CursorComposerSummary {
  composerId: string;
  name?: string;
  subtitle?: string;
  createdAt: number;
  lastUpdatedAt?: number;
  hasUnreadMessages?: boolean;
  isArchived?: boolean;
  subagentInfo?: {
    parentComposerId: string;
  };
}

export interface CursorComposerData {
  allComposers: CursorComposerSummary[];
  selectedComposerIds?: string[];
  lastFocusedComposerIds?: string[];
}

export interface BranchChatEntry {
  id: string;
  composerId: string;
  branchName: string;
  promptText?: string;
  startCommitHash?: string;
  cachedName?: string;
  customName?: string;
  createdAt: string;
  updatedAt: string;
  workspaceFolder: string;
  status: BranchChatStatus;
  /** 'cursor' (default, for backwards-compat when undefined) or 'claude' */
  source?: ChatSource;
  /** For claude entries: absolute path of the JSONL session file at attach time. */
  sessionFilePath?: string;
}

export interface ChatRegistryData {
  entries: BranchChatEntry[];
  version: number;
}
