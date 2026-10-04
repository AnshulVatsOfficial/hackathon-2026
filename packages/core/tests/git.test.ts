/**
 * AgentDrop - Git Snapshot Tests
 * Authoritative Plan: Section 46 (npm run test:git)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { GitIdentity } from "../src/git/identity.js";
import { GitSnapshotCollector } from "../src/git/snapshot.js";

function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fsSync.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

describe("Git Identity & Snapshot Collector", () => {
  const repoRoot = findRepoRoot();

  it("should discover workspace identity and repository fingerprint", async () => {
    const identity = await GitIdentity.getWorkspaceIdentity(repoRoot);
    assert.ok(identity.name.length > 0);
    assert.ok(identity.branch.length > 0);
    assert.strictEqual(identity.repositoryFingerprint.length, 16);
  });

  it("should capture active git snapshot and untracked files safely", async () => {
    // Create a temporary safe untracked file
    const testFilePath = path.resolve(repoRoot, "packages/core/tests/temp_test_untracked.ts");
    await fs.writeFile(testFilePath, "export const tempTest = true;", "utf-8");

    try {
      const snapshot = await GitSnapshotCollector.captureSnapshot(repoRoot);
      assert.ok(snapshot.identity.repositoryFingerprint.length > 0);
      assert.ok(Array.isArray(snapshot.untrackedSourceFiles));

      const found = snapshot.untrackedSourceFiles.some(f =>
        f.relativePath.includes("temp_test_untracked.ts")
      );
      assert.ok(found, "Failed to capture safe untracked source file");
    } finally {
      await fs.unlink(testFilePath).catch(() => {});
    }
  });
});
