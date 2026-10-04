/**
 * AgentDrop - Target Workspace Safety & Verification
 * Authoritative Plan: Section 19 & Invariant (Never overwrite without approval)
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { GitSnapshot } from "../capsule/schema.js";
import { GitIdentity } from "./identity.js";

const execAsync = promisify(exec);

export interface WorkspaceSafetyReport {
  isGitRepo: boolean;
  targetBranch?: string;
  targetHead?: string;
  repoFingerprintMatch: boolean;
  hasLocalUncommittedChanges: boolean;
  patchCanApplyCleanly: boolean;
  warnings: string[];
}

export class TargetWorkspaceSafety {
  /**
   * Verifies that the target workspace on Machine B can safely receive incoming Git patches.
   */
  public static async verifyTargetWorkspace(
    targetDir: string,
    snapshot?: GitSnapshot
  ): Promise<WorkspaceSafetyReport> {
    const report: WorkspaceSafetyReport = {
      isGitRepo: false,
      repoFingerprintMatch: false,
      hasLocalUncommittedChanges: false,
      patchCanApplyCleanly: true,
      warnings: []
    };

    try {
      // 1. Determine target repository identity
      const targetIdentity = await GitIdentity.getWorkspaceIdentity(targetDir);
      report.isGitRepo = true;
      report.targetBranch = targetIdentity.branch;
      report.targetHead = targetIdentity.headCommit;

      if (snapshot?.identity) {
        if (targetIdentity.repositoryFingerprint === snapshot.identity.repositoryFingerprint) {
          report.repoFingerprintMatch = true;
        } else {
          report.repoFingerprintMatch = false;
          report.warnings.push(
            `Repository fingerprint mismatch: incoming (${snapshot.identity.repositoryFingerprint}) vs target (${targetIdentity.repositoryFingerprint}). Workspace may be a different project.`
          );
        }

        if (targetIdentity.branch !== snapshot.identity.branch) {
          report.warnings.push(
            `Branch mismatch: incoming changes from '${snapshot.identity.branch}', target is on '${targetIdentity.branch}'.`
          );
        }
      }

      // 2. Check for existing local uncommitted changes
      if (!targetIdentity.isClean) {
        report.hasLocalUncommittedChanges = true;
        report.warnings.push(
          "Target workspace has existing uncommitted modifications. Applying patch could conflict."
        );
      }

      // 3. Test patch with git apply --check (if patch exists)
      if (snapshot?.workingTreePatch && snapshot.workingTreePatch.trim().length > 0) {
        const tempPatchPath = path.join(targetDir, ".agentdrop-temp-check.patch");
        try {
          await fs.writeFile(tempPatchPath, snapshot.workingTreePatch, "utf-8");
          await execAsync(`git apply --check "${tempPatchPath}"`, { cwd: targetDir });
          report.patchCanApplyCleanly = true;
        } catch {
          report.patchCanApplyCleanly = false;
          report.warnings.push("Incoming working diff does not apply cleanly onto current target HEAD.");
        } finally {
          try {
            await fs.unlink(tempPatchPath);
          } catch {
            // ignore
          }
        }
      }
    } catch {
      report.isGitRepo = false;
      report.warnings.push("Target directory is not a Git repository.");
    }

    return report;
  }

  /**
   * Applies the snapshot onto target directory with explicit user approval.
   */
  public static async applySnapshot(
    targetDir: string,
    snapshot: GitSnapshot,
    options: { applyWorkingDiff?: boolean; copyUntracked?: boolean } = {}
  ): Promise<{ success: boolean; appliedDiff: boolean; copiedFiles: number; error?: string }> {
    try {
      let appliedDiff = false;
      let copiedFiles = 0;

      // 1. Apply working diff if requested and present
      if (options.applyWorkingDiff !== false && snapshot.workingTreePatch?.trim()) {
        const patchPath = path.join(targetDir, ".agentdrop-incoming.patch");
        try {
          await fs.writeFile(patchPath, snapshot.workingTreePatch, "utf-8");
          await execAsync(`git apply "${patchPath}"`, { cwd: targetDir });
          appliedDiff = true;
        } finally {
          try {
            await fs.unlink(patchPath);
          } catch {
            // ignore
          }
        }
      }

      // 2. Copy untracked files if requested
      if (options.copyUntracked !== false && snapshot.untrackedSourceFiles) {
        for (const file of snapshot.untrackedSourceFiles) {
          const destPath = path.join(targetDir, file.relativePath);
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.writeFile(destPath, file.content, "utf-8");
          copiedFiles++;
        }
      }

      return { success: true, appliedDiff, copiedFiles };
    } catch (err: any) {
      return { success: false, appliedDiff: false, copiedFiles: 0, error: err?.message };
    }
  }
}
