/**
 * AgentDrop - Git-Native In-Repo Context Provider
 * Authoritative Pivot: Solves D1/M1 -> GitHub -> D2/M2 Asynchronous Handoff
 */

import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { AiCapsule, GitHandoverDocument } from "../capsule/schema.js";
import { GitIdentity } from "../git/identity.js";
import { SaveHandoffOptions, SaveHandoffResult, LoadHandoffResult, InitializeProjectOptions, InitializeProjectResult } from "./SyncTypes.js";

const execAsync = promisify(exec);

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

      // 4. Ensure AI Agent Instruction Bridge (AGENTS.md / CLAUDE.md)
      await this.ensureAgentInstructionBridge(workspacePath);

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

  /**
   * Ensures project-level AI instruction files (AGENTS.md and CLAUDE.md)
   * explicitly point AI assistants to .agentdrop/HANDOVER.md on Turn 1.
   */
  public static async ensureAgentInstructionBridge(workspacePath: string): Promise<boolean> {
    const bridgeMarker = "<!-- AgentDrop Context Bridge Start -->";
    const bridgeText = `${bridgeMarker}
## Active AI Context & Handover Instructions
When continuing unfinished work or answering questions about active tasks in this repository, always inspect \`.agentdrop/HANDOVER.md\` (or \`.agentdrop/handover.json\`) first for the latest objectives, architectural decisions, and current blockers before making changes.
<!-- AgentDrop Context Bridge End -->`;

    let changed = false;

    // 1. Check / update AGENTS.md
    const agentsPath = path.join(workspacePath, "AGENTS.md");
    try {
      let content = "";
      try {
        content = await fs.readFile(agentsPath, "utf-8");
      } catch {
        content = `# Agent Working Instructions\n\n`;
      }
      if (!content.includes(bridgeMarker)) {
        content = content.trimEnd() + "\n\n" + bridgeText + "\n";
        await fs.writeFile(agentsPath, content, "utf-8");
        changed = true;
      }
    } catch {}

    // 2. Check / update CLAUDE.md if it exists
    const claudePath = path.join(workspacePath, "CLAUDE.md");
    try {
      const content = await fs.readFile(claudePath, "utf-8");
      if (!content.includes(bridgeMarker)) {
        const updated = content.trimEnd() + "\n\n" + bridgeText + "\n";
        await fs.writeFile(claudePath, updated, "utf-8");
        changed = true;
      }
    } catch {}

    return changed;
  }

  /**
   * Resolves the .git directory even if running inside a monorepo subfolder.
   */
  public static async resolveGitDir(workspacePath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git rev-parse --git-dir", { cwd: workspacePath });
      const trimmed = stdout.trim();
      if (trimmed) {
        return path.resolve(workspacePath, trimmed);
      }
    } catch {}

    const directGit = path.join(workspacePath, ".git");
    try {
      await fs.access(directGit);
      return directGit;
    } catch {
      return null;
    }
  }

  /**
   * Installs lightweight Git lifecycle hooks in .git/hooks/ so git pull
   * and git checkout alert developers to active AI handovers.
   */
  public static async installGitHooks(workspacePath: string): Promise<{ success: boolean; hooks: string[] }> {
    const gitDir = await this.resolveGitDir(workspacePath);
    if (!gitDir) {
      return { success: false, hooks: [] };
    }

    const hooksDir = path.join(gitDir, "hooks");
    await fs.mkdir(hooksDir, { recursive: true });

    const hookScript = `#!/bin/sh
# AgentDrop Post-Pull / Post-Checkout Notification Hook
if [ -f ".agentdrop/handover.json" ]; then
  if command -v agentdrop >/dev/null 2>&1; then
    agentdrop status
  elif [ -f "./node_modules/.bin/agentdrop" ]; then
    ./node_modules/.bin/agentdrop status
  elif command -v npx >/dev/null 2>&1; then
    npx --no-install agentdrop status 2>/dev/null || npx agentdrop-portability-cli status 2>/dev/null || true
  else
    echo "⚡ [AgentDrop] Active AI handover found in .agentdrop/HANDOVER.md"
    echo "   Run 'npm run ai:status' to view the full handover card."
  fi
fi
`;

    const installed: string[] = [];
    for (const hookName of ["post-merge", "post-checkout"]) {
      const hookPath = path.join(hooksDir, hookName);
      await fs.writeFile(hookPath, hookScript, { encoding: "utf-8", mode: 0o755 });
      installed.push(hookName);
    }

    return { success: true, hooks: installed };
  }

  /**
   * Uninstalls AgentDrop hooks from .git/hooks/
   */
  public static async uninstallGitHooks(workspacePath: string): Promise<{ success: boolean }> {
    const gitDir = await this.resolveGitDir(workspacePath);
    if (!gitDir) {
      return { success: false };
    }

    const hooksDir = path.join(gitDir, "hooks");
    for (const hookName of ["post-merge", "post-checkout"]) {
      const hookPath = path.join(hooksDir, hookName);
      try {
        const content = await fs.readFile(hookPath, "utf-8");
        if (content.includes("AgentDrop")) {
          await fs.unlink(hookPath);
        }
      } catch {}
    }
    return { success: true };
  }

  /**
   * Injects idiomatic npm scripts ("ai:resume", "ai:status") into package.json
   */
  public static async injectPackageJsonScripts(workspacePath: string): Promise<boolean> {
    const candidatePaths = [
      path.join(workspacePath, "package.json"),
      path.join(workspacePath, "frontend", "package.json"),
      path.join(workspacePath, "backend", "package.json"),
      path.join(workspacePath, "client", "package.json"),
      path.join(workspacePath, "web", "package.json"),
      path.join(workspacePath, "app", "package.json")
    ];

    let anyModified = false;
    for (const pkgPath of candidatePaths) {
      try {
        const content = await fs.readFile(pkgPath, "utf-8");
        const pkg = JSON.parse(content);
        if (!pkg.scripts) {
          pkg.scripts = {};
        }
        let modified = false;
        if (!pkg.scripts["ai:save"]) {
          pkg.scripts["ai:save"] = "agentdrop save";
          modified = true;
        }
        if (!pkg.scripts["ai:resume"]) {
          pkg.scripts["ai:resume"] = "agentdrop load";
          modified = true;
        }
        if (!pkg.scripts["ai:status"]) {
          pkg.scripts["ai:status"] = "agentdrop status";
          modified = true;
        }

        const safePostinstallCmd = "agentdrop hook install || npx --no-install agentdrop hook install || true";
        if (!pkg.scripts["postinstall"]) {
          pkg.scripts["postinstall"] = safePostinstallCmd;
          modified = true;
        } else if (!pkg.scripts["postinstall"].includes("agentdrop hook install")) {
          pkg.scripts["postinstall"] += ` && (${safePostinstallCmd})`;
          modified = true;
        }

        // Ensure agentdrop-portability-cli is recorded in devDependencies so Machine 2 installs it on 'npm install'
        const hasCliDep = (pkg.dependencies && (pkg.dependencies["agentdrop-portability-cli"] || pkg.dependencies["@agentdrop/cli"])) ||
                          (pkg.devDependencies && (pkg.devDependencies["agentdrop-portability-cli"] || pkg.devDependencies["@agentdrop/cli"]));
        if (!hasCliDep) {
          if (!pkg.devDependencies) {
            pkg.devDependencies = {};
          }
          pkg.devDependencies["agentdrop-portability-cli"] = "^1.0.15";
          modified = true;
        }

        if (modified) {
          await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
          anyModified = true;
        }
      } catch {}
    }
    return anyModified;
  }

  /**
   * One-command full project initialization for AgentDrop
   */
  public static async initializeProject(
    workspacePath: string,
    options: InitializeProjectOptions = {}
  ): Promise<InitializeProjectResult> {
    const agentdropDir = path.join(workspacePath, ".agentdrop");
    await fs.mkdir(agentdropDir, { recursive: true });

    let agentBridgeUpdated = false;
    if (options.setupAgentBridge !== false) {
      agentBridgeUpdated = await this.ensureAgentInstructionBridge(workspacePath);
    }

    let hooksInstalled: string[] = [];
    if (options.setupGitHooks !== false) {
      const hookRes = await this.installGitHooks(workspacePath);
      hooksInstalled = hookRes.hooks;
    }

    let packageJsonUpdated = false;
    if (options.setupNpmScripts !== false) {
      packageJsonUpdated = await this.injectPackageJsonScripts(workspacePath);
    }

    return {
      agentdropDir,
      agentBridgeUpdated,
      hooksInstalled,
      packageJsonUpdated
    };
  }
}
