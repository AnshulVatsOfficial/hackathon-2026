/**
 * AgentDrop - Git Snapshot Collector
 * Authoritative Implementation Plan: Sections 16, 18
 */

import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { GitSnapshot } from "../capsule/schema.js";
import { GitIdentity } from "./identity.js";
import { isFileExcluded, isSafeUntrackedExtension, LIMITS } from "../security/filePolicy.js";
import { SecurityScanner } from "../security/scanner.js";

const execAsync = promisify(exec);

export class GitSnapshotCollector {
  /**
   * Captures the active development git state:
   * - Working tree diff (unstaged)
   * - Staged diff
   * - Safe untracked source files with their contents
   */
  static async captureSnapshot(workspacePath: string): Promise<GitSnapshot> {
    const identity = await GitIdentity.getWorkspaceIdentity(workspacePath);

    let workingTreePatch = "";
    let stagedPatch = "";
    const untrackedSourceFiles: Array<{ relativePath: string; content: string }> = [];

    try {
      // 1. Working tree diff (unstaged modifications)
      const { stdout: diffOut } = await execAsync("git diff", {
        cwd: workspacePath,
        maxBuffer: LIMITS.MAX_INDIVIDUAL_FILE_BYTES
      });
      workingTreePatch = diffOut;

      // 2. Staged diff
      const { stdout: stagedDiffOut } = await execAsync("git diff --cached", {
        cwd: workspacePath,
        maxBuffer: LIMITS.MAX_INDIVIDUAL_FILE_BYTES
      });
      stagedPatch = stagedDiffOut;

      // 3. Status porcelain v2 with -uall to list all untracked files individually
      const { stdout: statusOut } = await execAsync("git status --porcelain=v2 -uall", {
        cwd: workspacePath,
        maxBuffer: LIMITS.MAX_INDIVIDUAL_FILE_BYTES
      });

      const lines = statusOut.split("\n");
      for (const line of lines) {
        // Untracked entries start with '? <path>' in porcelain v2
        if (line.startsWith("? ")) {
          const rawRelPath = line.slice(2).trim();
          const fullPath = path.resolve(workspacePath, rawRelPath);

          // File Exclusion Checks
          if (isFileExcluded(rawRelPath) || isFileExcluded(fullPath)) {
            continue;
          }

          // Check extension safety whitelist
          if (!isSafeUntrackedExtension(rawRelPath)) {
            continue;
          }

          try {
            const stat = await fs.stat(fullPath);
            if (stat.isFile() && stat.size <= LIMITS.MAX_INDIVIDUAL_FILE_BYTES) {
              const fileContent = await fs.readFile(fullPath, "utf-8");
              // Sanitize content before adding to snapshot
              const { cleanText } = SecurityScanner.sanitizeText(fileContent);
              untrackedSourceFiles.push({
                relativePath: rawRelPath.replace(/\\/g, "/"),
                content: cleanText
              });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // If git commands fail (e.g. non-git directory), patches remain empty
    }

    // Sanitize patches
    const { cleanText: cleanWorkingPatch } = SecurityScanner.sanitizeText(workingTreePatch);
    const { cleanText: cleanStagedPatch } = SecurityScanner.sanitizeText(stagedPatch);

    return {
      identity,
      workingTreePatch: cleanWorkingPatch,
      stagedPatch: cleanStagedPatch,
      untrackedSourceFiles
    };
  }
}
