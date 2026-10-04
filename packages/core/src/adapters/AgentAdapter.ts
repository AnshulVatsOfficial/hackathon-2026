/**
 * AgentDrop - Universal Agent Adapter Interface
 * Authoritative Implementation Plan: Section 6
 */

import { AiCapsule } from "../capsule/schema.js";

export interface SessionSummary {
  sessionId: string;
  title: string;
  lastActive: Date;
  workspaceHint?: string;
  turnCount?: number;
}

export interface ExtractedSession {
  title: string;
  workspaceHint?: string;
  turns: NonNullable<AiCapsule["conversation"]>["turns"];
  rawFiles: Record<string, string>;
  artifacts?: Array<{
    fileName: string;
    filePath: string;
    content: string;
  }>;
}

export interface RestoreResult {
  success: boolean;
  message: string;
  targetSessionId?: string;
}

export interface AgentAdapter {
  readonly id: "antigravity" | "claude-code";
  readonly displayName: string;

  /**
   * Checks if the AI agent CLI or storage directory exists on this machine.
   */
  isInstalled(): Promise<boolean>;

  /**
   * Lists available in-flight or completed sessions for this agent.
   */
  listRecentSessions(): Promise<SessionSummary[]>;

  /**
   * Extracts conversation turns and artifacts from a session.
   * Enforces Section 9: MUST NOT extract or include internal model chain-of-thought (thinking).
   */
  extractSession(sessionId: string): Promise<ExtractedSession>;

  /**
   * Attempts an experimental native session restoration on the target machine.
   * Invariant 1: Must never throw or block handover. Returns success: false gracefully on error.
   */
  restoreNativeSession(capsule: AiCapsule, targetWorkspacePath: string): Promise<RestoreResult>;
}
