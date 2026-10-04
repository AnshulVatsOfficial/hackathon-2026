/**
 * AgentDrop - Core Capsule Schema (Portability Contract)
 * Authoritative Implementation Plan: Section 21
 */

export interface WorkspaceIdentity {
  name: string;
  remoteOriginFingerprint?: string;
  repositoryFingerprint: string;
  branch: string;
  headCommit: string;
  isClean: boolean;
}

export interface GitSnapshot {
  identity: WorkspaceIdentity;
  workingTreePatch: string;
  stagedPatch: string;
  untrackedSourceFiles: Array<{
    relativePath: string;
    content: string;
  }>;
}

export interface AiHandoverState {
  objective: string;
  completedMilestones: string[];
  observedActivity?: string[];
  failedAttempts: string[];
  currentBlockerOrActiveState: string;
  criticalFiles: string[];
  importantDecisions: string[];
  environmentConstraints: string[];
  suggestedNextAction: string;
  primedResumePrompt: string;
  confidence?: {
    objective: "high" | "medium" | "low";
    currentState: "high" | "medium" | "low";
  };
}

export interface AiCapsuleManifest {
  version: "1.0.0";
  capsuleId: string;
  createdAt: string;
  tier: "fast" | "full" | "native";
  source: {
    agent: "antigravity" | "claude-code";
    agentVersion?: string;
    os: "win32" | "darwin" | "linux";
    hostname: string;
    workspaceName: string;
  };
  compatibility?: {
    adapterVersion: string;
    nativeRestoreSupported: boolean;
  };
}

export interface AiCapsule {
  manifest: AiCapsuleManifest;
  handover: AiHandoverState;
  git: GitSnapshot;
  securitySummary: {
    redactedSecretsCount: number;
    excludedFiles: string[];
  };
  conversation?: {
    totalTurns: number;
    turns: Array<{
      role: "user" | "assistant";
      timestamp: string;
      content: string;
      toolSummary?: string;
    }>;
  };
  selectedFiles?: Array<{
    relativePath: string;
    content: string;
  }>;
  nativePayload?: {
    adapterId: "antigravity" | "claude-code";
    rawFiles: Record<string, string>;
  };
}
