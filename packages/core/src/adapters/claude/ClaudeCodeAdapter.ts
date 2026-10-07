/**
 * AgentDrop - Claude Code CLI Adapter
 * Authoritative Implementation Plan: Section 8, Section 9
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AgentAdapter, ExtractedSession, RestoreResult, SessionSummary } from "../AgentAdapter.js";
import { AiCapsule } from "../../capsule/schema.js";

export class ClaudeCodeAdapter implements AgentAdapter {
  public readonly id = "claude-code" as const;
  public readonly displayName = "Claude Code";

  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.join(os.homedir(), ".claude");
  }

  public getProjectsDir(): string {
    return path.join(this.baseDir, "projects");
  }

  public async isInstalled(): Promise<boolean> {
    try {
      const projDir = this.getProjectsDir();
      const stat = await fs.stat(projDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  public async listRecentSessions(targetWorkspacePath?: string): Promise<SessionSummary[]> {
    const projDir = this.getProjectsDir();
    const sessions: SessionSummary[] = [];

    try {
      const projects = await fs.readdir(projDir, { withFileTypes: true });

      for (const project of projects) {
        if (!project.isDirectory()) continue;
        const projectPath = path.join(projDir, project.name);

        try {
          const files = await fs.readdir(projectPath, { withFileTypes: true });
          for (const file of files) {
            if (file.isFile() && file.name.endsWith(".jsonl")) {
              const filePath = path.join(projectPath, file.name);
              const stat = await fs.stat(filePath);
              const sessionId = `${project.name}/${file.name}`;

              let title = `Claude: ${project.name}`;
              let turnCount = 0;

              try {
                const content = await fs.readFile(filePath, "utf-8");
                const lines = content.split("\n").filter(l => l.trim().length > 0);
                turnCount = lines.length;

                for (const line of lines) {
                  try {
                    const entry = JSON.parse(line);
                    if (entry.role === "user" || entry.type === "user") {
                      const text = typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content || "");
                      title = text.slice(0, 80);
                      break;
                    }
                  } catch {
                    // Skip invalid line
                  }
                }
              } catch {
                // File unreadable
              }

              sessions.push({
                sessionId,
                title,
                lastActive: stat.mtime,
                workspaceHint: project.name,
                turnCount
              });
            }
          }
        } catch {
          // Project directory unreadable
        }
      }

      sessions.sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());

      if (targetWorkspacePath) {
        const normTarget = path.normalize(targetWorkspacePath).toLowerCase();
        const matching = sessions.filter(s => s.workspaceHint && normTarget.includes(s.workspaceHint.toLowerCase()));
        if (matching.length > 0) {
          return matching;
        }
      }
    } catch {
      // Base directory missing
    }

    return sessions;
  }

  public async extractSession(sessionId: string): Promise<ExtractedSession> {
    const filePath = path.join(this.getProjectsDir(), sessionId);
    const turns: NonNullable<AiCapsule["conversation"]>["turns"] = [];
    let title = `Claude Session ${sessionId}`;
    const rawFiles: Record<string, string> = {};

    try {
      const data = await fs.readFile(filePath, "utf-8");
      rawFiles[path.basename(filePath)] = data;

      const lines = data.split("\n").filter(l => l.trim().length > 0);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const role = (entry.role || entry.type) === "assistant" ? "assistant" : "user";
          let content = "";

          if (typeof entry.content === "string") {
            content = entry.content;
          } else if (Array.isArray(entry.content)) {
            content = entry.content.map((c: any) => c.text || JSON.stringify(c)).join("\n");
          }

          let toolSummary: string | undefined;
          if (entry.tool_use || entry.tool_calls) {
            toolSummary = JSON.stringify(entry.tool_use || entry.tool_calls);
          }

          turns.push({
            role,
            timestamp: entry.timestamp || new Date().toISOString(),
            content,
            toolSummary
          });
        } catch {
          // Skip unparseable lines
        }
      }
    } catch {
      // File read error
    }

    return {
      title,
      turns,
      rawFiles
    };
  }

  public async restoreNativeSession(capsule: AiCapsule, _targetWorkspacePath: string): Promise<RestoreResult> {
    try {
      const projDir = this.getProjectsDir();
      const workspaceSlug = capsule.manifest.source.workspaceName || "imported-project";
      const targetDir = path.join(projDir, workspaceSlug);

      await fs.mkdir(targetDir, { recursive: true });

      const targetFile = path.join(targetDir, `${capsule.manifest.capsuleId}.jsonl`);

      if (capsule.nativePayload?.rawFiles) {
        const firstRaw = Object.values(capsule.nativePayload.rawFiles)[0];
        if (firstRaw) {
          await fs.writeFile(targetFile, firstRaw, "utf-8");
          return {
            success: true,
            message: `Native session restored to Claude Code: ${targetFile}`,
            targetSessionId: `${workspaceSlug}/${capsule.manifest.capsuleId}.jsonl`
          };
        }
      }

      return {
        success: false,
        message: "No native payload present. Handover Card active."
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Native restore skipped (${err?.message}). Portable Handover remains active.`
      };
    }
  }
}
