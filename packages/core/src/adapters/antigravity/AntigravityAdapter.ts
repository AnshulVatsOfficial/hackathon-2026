/**
 * AgentDrop - Google Antigravity CLI / IDE Adapter
 * Authoritative Implementation Plan: Section 7, Section 9
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AgentAdapter, ExtractedSession, RestoreResult, SessionSummary } from "../AgentAdapter.js";
import { AiCapsule } from "../../capsule/schema.js";

function cleanPromptText(raw: string): string {
  if (!raw) return "";
  let text = raw;
  const reqMatch = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
  if (reqMatch && reqMatch[1]) {
    text = reqMatch[1].trim();
  } else {
    text = text.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, "");
    text = text.replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, "");
    text = text.replace(/<PLAN>[\s\S]*?<\/PLAN>/gi, "");
    text = text.replace(/<\/?USER_REQUEST>/gi, "");
  }
  return text.trim() || raw.trim();
}

function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase().replace(/[\/\\]+$/, "");
}

function isWorkspaceMatch(hint: string | undefined, target: string): boolean {
  if (!hint || !target) return false;
  const normHint = normalizePath(hint);
  const normTarget = normalizePath(target);
  return normHint === normTarget || normTarget.startsWith(normHint) || normHint.startsWith(normTarget);
}

function extractWorkspaceHintFromTranscript(content: string): string | undefined {
  if (!content) return undefined;
  const match = content.match(/Active Workspaces:\s*\r?\n\s*-\s*([^\r\n]+)/i) ||
                content.match(/Command Working Directory:\s*([^\r\n]+)/i) ||
                content.match(/Directory:\s*([^\r\n]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  const cwdMatch = content.match(/"Cwd":\s*"([^"]+)"/i) || content.match(/"AbsolutePath":\s*"([^"]+)"/i);
  if (cwdMatch && cwdMatch[1]) {
    const raw = cwdMatch[1].replace(/\\\\/g, "\\");
    return raw.includes("\\") || raw.includes("/") ? (raw.endsWith(".ts") || raw.endsWith(".js") ? path.dirname(raw) : raw) : raw;
  }
  return undefined;
}

export class AntigravityAdapter implements AgentAdapter {
  public readonly id = "antigravity" as const;
  public readonly displayName = "Google Antigravity";

  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.join(os.homedir(), ".gemini", "antigravity-cli");
  }

  public getBrainDir(): string {
    return path.join(this.baseDir, "brain");
  }

  public async isInstalled(): Promise<boolean> {
    try {
      const brainDir = this.getBrainDir();
      const stat = await fs.stat(brainDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  public async listRecentSessions(targetWorkspacePath?: string): Promise<SessionSummary[]> {
    const brainDir = this.getBrainDir();
    const sessions: SessionSummary[] = [];

    try {
      const entries = await fs.readdir(brainDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sessionId = entry.name;
        const sessionPath = path.join(brainDir, sessionId);

        try {
          const stat = await fs.stat(sessionPath);
          const transcriptPath = path.join(sessionPath, ".system_generated", "logs", "transcript.jsonl");

          let title = `Session ${sessionId.slice(0, 8)}`;
          let turnCount = 0;
          let workspaceHint: string | undefined;

          try {
            const content = await fs.readFile(transcriptPath, "utf-8");
            const lines = content.split("\n").filter(l => l.trim().length > 0);
            turnCount = lines.length;
            workspaceHint = extractWorkspaceHintFromTranscript(content);

            // Find first user input for title
            for (const line of lines) {
              try {
                const step = JSON.parse(line);
                if (step.source === "USER_EXPLICIT" && step.content) {
                  const rawPrompt = cleanPromptText(step.content);
                  title = rawPrompt.length > 80 ? rawPrompt.slice(0, 77) + "..." : rawPrompt;
                  break;
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          } catch {
            // Transcript not yet generated or empty
          }

          sessions.push({
            sessionId,
            title,
            lastActive: stat.mtime,
            workspaceHint,
            turnCount
          });
        } catch {
          // Skip unreadable folder
        }
      }

      // Sort by most recently modified
      sessions.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());

      if (targetWorkspacePath) {
        const matching = sessions.filter(s => isWorkspaceMatch(s.workspaceHint, targetWorkspacePath));
        if (matching.length > 0) {
          return matching;
        }
      }
    } catch {
      // Directory listing failed
    }

    return sessions;
  }

  public async extractSession(sessionId: string): Promise<ExtractedSession> {
    const sessionPath = path.join(this.getBrainDir(), sessionId);
    const transcriptPath = path.join(sessionPath, ".system_generated", "logs", "transcript.jsonl");

    const turns: NonNullable<AiCapsule["conversation"]>["turns"] = [];
    let title = `Session ${sessionId.slice(0, 8)}`;
    const rawFiles: Record<string, string> = {};
    const artifacts: Array<{ fileName: string; filePath: string; content: string }> = [];

    // 1. Read Transcript & Enforce Section 9 (No Hidden Chain-of-Thought)
    try {
      const transcriptData = await fs.readFile(transcriptPath, "utf-8");
      const lines = transcriptData.split("\n").filter(l => l.trim().length > 0);
      const cleanedLines: string[] = [];

      for (const line of lines) {
        try {
          const step = JSON.parse(line);
          // Invariant Section 9: strip thinking field
          delete step.thinking;
          cleanedLines.push(JSON.stringify(step));

          const role: "user" | "assistant" = step.source === "USER_EXPLICIT" ? "user" : "assistant";
          const turnContent = role === "user" ? cleanPromptText(step.content || "") : (step.content || "");

          if (role === "user" && title.startsWith("Session ") && turnContent) {
            title = turnContent.slice(0, 100);
          }

          let toolSummary: string | undefined;
          if (step.tool_calls && Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
            toolSummary = step.tool_calls.map((tc: any) => `${tc.toolName} ${JSON.stringify(tc.arguments || {})}`).join("; ");
          }

          turns.push({
            role,
            timestamp: step.created_at || new Date().toISOString(),
            content: turnContent,
            toolSummary
          });
        } catch {
          // Skip unparseable line
        }
      }

      rawFiles[".system_generated/logs/transcript.jsonl"] = cleanedLines.join("\n");
    } catch {
      // No transcript found
    }

    // 2. Read artifacts (.md files in brain root)
    try {
      const topEntries = await fs.readdir(sessionPath, { withFileTypes: true });
      for (const entry of topEntries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const filePath = path.join(sessionPath, entry.name);
          const content = await fs.readFile(filePath, "utf-8");
          artifacts.push({
            fileName: entry.name,
            filePath: entry.name,
            content
          });
          rawFiles[entry.name] = content;
        }
      }
    } catch {
      // Artifact scan failed
    }

    return {
      title,
      turns,
      rawFiles,
      artifacts
    };
  }

  public async restoreNativeSession(capsule: AiCapsule, _targetWorkspacePath: string): Promise<RestoreResult> {
    // Invariant 1: Native Restore Failure NEVER causes handover failure
    try {
      const targetBrainDir = this.getBrainDir();
      const newSessionId = capsule.manifest.capsuleId;
      const targetPath = path.join(targetBrainDir, newSessionId);

      // Create target directory structure
      await fs.mkdir(path.join(targetPath, ".system_generated", "logs"), { recursive: true });

      // If nativePayload contains rawFiles, write them
      if (capsule.nativePayload && capsule.nativePayload.rawFiles) {
        for (const [relPath, content] of Object.entries(capsule.nativePayload.rawFiles)) {
          const dest = path.join(targetPath, relPath);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, content, "utf-8");
        }
      }

      return {
        success: true,
        message: `Native session restored into Antigravity brain: ${newSessionId}`,
        targetSessionId: newSessionId
      };
    } catch (err: any) {
      // Graceful fallback to portable handover
      return {
        success: false,
        message: `Native restore skipped (${err?.message}). Portable Handover remains active.`
      };
    }
  }
}
