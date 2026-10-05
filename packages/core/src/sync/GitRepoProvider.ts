/**
 * AgentDrop - Git-Native In-Repo Context Provider
 * Authoritative Pivot: Solves D1/M1 -> GitHub -> D2/M2 Asynchronous Handoff
 */

import fs from "node:fs/promises";
import path from "node:path";
import { AiCapsule, GitHandoverDocument } from "../capsule/schema.js";
import { GitIdentity } from "../git/identity.js";
import { SaveHandoffOptions, SaveHandoffResult, LoadHandoffResult } from "./SyncTypes.js";

export class GitRepoProvider {
  /**
   * Saves AI working context directly into the project repository under .agentdrop/
   * When D1 runs `git push`, this context travels to GitHub alongside the code!
   */
  public static async saveHandoff(
    workspacePath: string,
    capsule: AiCapsule,
    options: SaveHandoffOptions = {}
  ): Promise<SaveHandoffResult> {
    try {
      const identity = await GitIdentity.getWorkspaceIdentity(workspacePath);
      const agentdropDir = path.join(workspacePath, ".agentdrop");
      await fs.mkdir(agentdropDir, { recursive: true });

      const doc: GitHandoverDocument = {
        version: "1.0.0",
        capsuleId: capsule.manifest.capsuleId,
        createdAt: new Date().toISOString(),
        sourceAgent: capsule.manifest.source.agent,
        author: identity.author,
        git: {
          repository: identity.remoteOriginUrl,
          branch: identity.branch,
          commitSha: identity.headCommit,
          contextKey: identity.contextKey || "default"
        },
        handover: capsule.handover,
        securitySummary: capsule.securitySummary
      };

      // 1. Write structured JSON contract
      const handoverPath = path.join(agentdropDir, "handover.json");
      await fs.writeFile(handoverPath, JSON.stringify(doc, null, 2), "utf-8");

      // 2. Write human-readable GitHub Markdown file (viewable directly on GitHub.com)
      const markdownPath = path.join(agentdropDir, "HANDOVER.md");
      const mdContent = this.generateMarkdown(doc);
      await fs.writeFile(markdownPath, mdContent, "utf-8");

      // 3. Write full capsule if requested
      let capsulePath: string | undefined;
      if (options.saveFullCapsule) {
        capsulePath = path.join(agentdropDir, "capsule.json");
        await fs.writeFile(capsulePath, JSON.stringify(capsule, null, 2), "utf-8");
      }

      return {
        success: true,
        handoverPath,
        capsulePath,
        document: doc,
        identity
      };
    } catch (err: any) {
      const identity = await GitIdentity.getWorkspaceIdentity(workspacePath);
      return {
        success: false,
        handoverPath: "",
        document: {} as any,
        identity,
        error: err?.message
      };
    }
  }

  /**
   * Loads AI working context from .agentdrop/handover.json when D2 clones or pulls on Machine M2.
   */
  public static async loadHandoff(workspacePath: string): Promise<LoadHandoffResult> {
    try {
      const identity = await GitIdentity.getWorkspaceIdentity(workspacePath);
      const handoverPath = path.join(workspacePath, ".agentdrop", "handover.json");

      try {
        await fs.access(handoverPath);
      } catch {
        return {
          found: false,
          currentBranch: identity.branch,
          isBranchMatch: false
        };
      }

      const content = await fs.readFile(handoverPath, "utf-8");
      const doc: GitHandoverDocument = JSON.parse(content);

      // Check if current checkout matches the branch that created the handoff
      const isBranchMatch = doc.git.branch === identity.branch || doc.git.branch === "HEAD (detached)";

      // Optionally load full capsule if present
      let capsule: AiCapsule | undefined;
      const capsulePath = path.join(workspacePath, ".agentdrop", "capsule.json");
      try {
        await fs.access(capsulePath);
        const capContent = await fs.readFile(capsulePath, "utf-8");
        capsule = JSON.parse(capContent);
      } catch {
        // Capsule JSON not present, handover doc is sufficient
      }

      return {
        found: true,
        document: doc,
        capsule,
        isBranchMatch,
        currentBranch: identity.branch,
        handoverBranch: doc.git.branch,
        commitSha: doc.git.commitSha
      };
    } catch (err: any) {
      return {
        found: false,
        currentBranch: "unknown",
        isBranchMatch: false,
        error: err?.message
      };
    }
  }

  /**
   * Generates a GitHub-flavored Markdown document for direct viewing on GitHub.com.
   */
  public static generateMarkdown(doc: GitHandoverDocument): string {
    const h = doc.handover;
    const authorLine = doc.author ? `**Author:** ${doc.author}  \n` : "";
    const repoLine = doc.git.repository ? `**Repository:** ${doc.git.repository}  \n` : "";

    let md = `# AI Context Handover\n\n`;
    md += `> **AgentDrop Asynchronous Context Handoff**  \n`;
    md += `${authorLine}${repoLine}**Branch:** \`${doc.git.branch}\` | **Commit:** \`${doc.git.commitSha.slice(0, 7)}\` | **Source Agent:** \`${doc.sourceAgent}\`\n\n`;
    md += `---\n\n`;

    md += `## Objective\n`;
    md += `${h.objective}\n\n`;

    if (h.completedMilestones?.length || h.observedActivity?.length) {
      md += `## Completed Milestones & Observed Work\n`;
      for (const item of h.completedMilestones || h.observedActivity || []) {
        md += `- [x] ${item}\n`;
      }
      md += `\n`;
    }

    if (h.importantDecisions?.length) {
      md += `## Important Implementation Decisions\n`;
      for (const dec of h.importantDecisions) {
        md += `- :heavy_check_mark: **${dec}**\n`;
      }
      md += `\n`;
    }

    if (h.failedAttempts?.length) {
      md += `## Failed Approaches (Do Not Repeat)\n`;
      for (const failed of h.failedAttempts) {
        md += `- :x: ${failed}\n`;
      }
      md += `\n`;
    }

    if (h.currentBlockerOrActiveState) {
      md += `## Current Roadblock / Active State\n`;
      md += `> :warning: **${h.currentBlockerOrActiveState}**\n\n`;
    }

    if (h.criticalFiles?.length) {
      md += `## Critical Files\n`;
      for (const f of h.criticalFiles) {
        md += `- \`${f}\`\n`;
      }
      md += `\n`;
    }

    md += `## Primed Resume Prompt\n`;
    md += `*Copy and paste this into Antigravity, Claude Code, Cursor, or any AI coding tool on Machine B to resume instantly:*\n\n`;
    md += `\`\`\`text\n`;
    md += `${h.primedResumePrompt}\n`;
    md += `\`\`\`\n\n`;

    md += `---\n`;
    md += `*Generated by AgentDrop — Local-First AI Context Portability Layer*\n`;

    return md;
  }
}
