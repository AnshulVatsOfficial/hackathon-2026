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
  if (!p) return "";
  let clean = p.trim();
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.slice(1, -1);
  }
  return path.normalize(clean).toLowerCase().replace(/[\/\\]+$/, "");
}

function isWorkspaceMatch(hints: string | string[] | undefined, target: string): boolean {
  if (!hints || !target) return false;
  const normTarget = normalizePath(target);
  const sepNormTarget = normTarget + path.sep;

  const hintList = Array.isArray(hints) ? hints : [hints];

  for (const hint of hintList) {
    const normHint = normalizePath(hint);
    if (!normHint) continue;
    if (normHint === normTarget) return true;

    const sepNormHint = normHint + path.sep;
    if (normTarget.startsWith(sepNormHint) || normHint.startsWith(sepNormTarget)) {
      return true;
    }

    // Check shared project directory root
    const hintParts = normHint.split(path.sep).filter(Boolean);
    const targetParts = normTarget.split(path.sep).filter(Boolean);
    let commonDepth = 0;
    for (let i = 0; i < Math.min(hintParts.length, targetParts.length); i++) {
      if (hintParts[i] === targetParts[i]) {
        commonDepth++;
      } else {
        break;
      }
    }
    if (commonDepth >= 5) {
      return true;
    }
  }

  return false;
}

function extractPrimaryWorkspaceHint(lines: string[]): string | undefined {
  // Read initial system instructions (step index 0-10) for explicit active workspace or command working directory
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    let text = lines[i];
    try {
      const step = JSON.parse(lines[i]);
      if (typeof step.content === "string") {
        text = step.content;
      }
    } catch {}

    if (typeof text === "string") {
      const match = text.match(/Active Workspaces:\s*(?:\r?\n)?\s*-\s*([^\r\n]+)/i) ||
                    text.match(/Command Working Directory:\s*([^\r\n]+)/i) ||
                    text.match(/Directory:\s*([^\r\n]+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  // Fallback: first tool call Cwd or SearchDirectory
  for (const line of lines) {
    try {
      const step = JSON.parse(line);
      if (step.tool_calls && Array.isArray(step.tool_calls)) {
        for (const tc of step.tool_calls) {
          const args = tc.arguments || tc.args;
          if (args && typeof args === "object") {
            const dir = args.Cwd || args.SearchDirectory;
            if (dir && typeof dir === "string") {
              const clean = dir.trim().replace(/^"|"$/g, "");
              if (!clean.includes("antigravity-cli") && !clean.includes("temp-mock")) {
                return clean;
              }
            }
          }
        }
      }
    } catch {}
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
          const folderStat = await fs.stat(sessionPath);
          const transcriptPath = path.join(sessionPath, ".system_generated", "logs", "transcript.jsonl");

          let lastActive = folderStat.mtime;
          try {
            const transcriptStat = await fs.stat(transcriptPath);
            lastActive = transcriptStat.mtime; // Use transcript file mtime for accurate recency
          } catch {
            // Transcript file missing or unreadable
          }

          let title = `Session ${sessionId.slice(0, 8)}`;
          let turnCount = 0;
          let workspaceHint: string | undefined;

          try {
            const content = await fs.readFile(transcriptPath, "utf-8");
            const lines = content.split("\n").filter(l => l.trim().length > 0);
            turnCount = lines.length;

            workspaceHint = extractPrimaryWorkspaceHint(lines);

            for (const line of lines) {
              try {
                const step = JSON.parse(line);
                if (step.source === "USER_EXPLICIT" && step.content && title.startsWith("Session ")) {
                  const rawPrompt = cleanPromptText(step.content);
                  title = rawPrompt.length > 80 ? rawPrompt.slice(0, 77) + "..." : rawPrompt;
                }
              } catch {
                // Skip unparseable lines
              }
            }
          } catch {
            // Transcript unreadable
          }

          sessions.push({
            sessionId,
            title,
            lastActive,
            workspaceHint,
            turnCount
          });
        } catch {
          // Skip unreadable folder
        }
      }

      // Sort by most recently modified transcript
      sessions.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());

      if (targetWorkspacePath) {
        return sessions.filter(s => isWorkspaceMatch(s.workspaceHint, targetWorkspacePath));
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

          if (step.source === "SYSTEM") continue;

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
