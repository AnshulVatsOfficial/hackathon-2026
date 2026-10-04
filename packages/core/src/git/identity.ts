/**
 * AgentDrop - Git Workspace Identity
 * Authoritative Implementation Plan: Section 17
 */

import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { WorkspaceIdentity } from "../capsule/schema.js";

const execAsync = promisify(exec);

export class GitIdentity {
  /**
   * Discovers and computes the privacy-safe identity of a git repository.
   */
  static async getWorkspaceIdentity(workspacePath: string): Promise<WorkspaceIdentity> {
    const name = path.basename(path.resolve(workspacePath));

    try {
      // 1. Current Branch
      const { stdout: branchOut } = await execAsync("git branch --show-current", { cwd: workspacePath });
      const branch = branchOut.trim() || "HEAD (detached)";

      // 2. Head Commit
      const { stdout: headOut } = await execAsync("git rev-parse HEAD", { cwd: workspacePath });
      const headCommit = headOut.trim();

      // 3. Status clean check
      const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd: workspacePath });
      const isClean = statusOut.trim().length === 0;

      // 4. Remote Origin Fingerprint (privacy-safe, does not expose raw URL)
      let remoteOriginFingerprint: string | undefined;
      try {
        const { stdout: remoteOut } = await execAsync("git remote get-url origin", { cwd: workspacePath });
        const rawRemote = remoteOut.trim();
        if (rawRemote) {
          remoteOriginFingerprint = crypto.createHash("sha256").update(rawRemote).digest("hex").slice(0, 16);
        }
      } catch {
        // No remote origin configured
      }

      // 5. Repository Root Commit Hash for Repo Fingerprint
      let rootCommit = headCommit;
      try {
        const { stdout: rootCommitOut } = await execAsync("git rev-list --max-parents=0 HEAD", { cwd: workspacePath });
        const firstCommit = rootCommitOut.trim().split("\n")[0];
        if (firstCommit) {
          rootCommit = firstCommit.trim();
        }
      } catch {
        // Fallback to head commit
      }

      const repositoryFingerprint = crypto.createHash("sha256").update(rootCommit).digest("hex").slice(0, 16);

      return {
        name,
        branch,
        headCommit,
        isClean,
        remoteOriginFingerprint,
        repositoryFingerprint
      };
    } catch {
      // If not a git repository, fallback to local directory hash
      const fallbackFingerprint = crypto.createHash("sha256").update(name).digest("hex").slice(0, 16);
      return {
        name,
        branch: "none",
        headCommit: "none",
        isClean: true,
        repositoryFingerprint: fallbackFingerprint
      };
    }
  }
}
