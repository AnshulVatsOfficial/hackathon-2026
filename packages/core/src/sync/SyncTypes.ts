/**
 * AgentDrop - Asynchronous Context Sync Types
 * Authoritative Pivot: Git & GitHub-Native Portability
 */

import { AiCapsule, GitHandoverDocument, WorkspaceIdentity } from "../capsule/schema.js";

export interface SaveHandoffOptions {
  /** If true, also writes the full .agentdrop/capsule.json archive */
  saveFullCapsule?: boolean;
  /** Custom commit message or note */
  note?: string;
}

export interface SaveHandoffResult {
  success: boolean;
  handoverPath: string;
  capsulePath?: string;
  document: GitHandoverDocument;
  identity: WorkspaceIdentity;
  error?: string;
}

export interface LoadHandoffResult {
  found: boolean;
  document?: GitHandoverDocument;
  capsule?: AiCapsule;
  isBranchMatch: boolean;
  currentBranch: string;
  handoverBranch?: string;
  commitSha?: string;
  error?: string;
}

export interface SyncStatusResult {
  hasActiveHandoff: boolean;
  workspaceIdentity: WorkspaceIdentity;
  handover?: GitHandoverDocument;
  isBranchMatch: boolean;
}

export interface InitializeProjectOptions {
  setupGitHooks?: boolean;
  setupAgentBridge?: boolean;
  setupNpmScripts?: boolean;
}

export interface InitializeProjectResult {
  agentdropDir: string;
  agentBridgeUpdated: boolean;
  hooksInstalled: string[];
  packageJsonUpdated: boolean;
}
