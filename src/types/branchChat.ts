export type BranchChatStatus = 'active' | 'archived';

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
  createdAt: string;
  updatedAt: string;
  workspaceFolder: string;
  status: BranchChatStatus;
}

export interface ChatRegistryData {
  entries: BranchChatEntry[];
  version: number;
}
