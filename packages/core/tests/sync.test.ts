/**
 * AgentDrop - Asynchronous Context Sync Tests
 * Verifies D1/M1 -> Git/GitHub -> D2/M2 Workflow
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  ContextSyncManager,
  GitRepoProvider,
  RemoteSyncProvider,
  AiCapsule
} from "../src/index.js";

const execAsync = promisify(exec);

describe("Git & Asynchronous Context Sync", () => {
  let tempRepo: string;

  before(async () => {
    // Create an isolated temporary git repository
    tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), "agentdrop-sync-test-"));
    await execAsync("git init", { cwd: tempRepo });
    await execAsync("git config user.name \"Developer D1\"", { cwd: tempRepo });
    await execAsync("git config user.email \"d1@example.com\"", { cwd: tempRepo });
    await fs.writeFile(path.join(tempRepo, "README.md"), "# Project P1\n", "utf-8");
    await execAsync("git add .", { cwd: tempRepo });
    await execAsync("git commit -m \"Initial commit\"", { cwd: tempRepo });
    await execAsync("git checkout -b feature/refresh-token", { cwd: tempRepo });
  });

  after(async () => {
    try {
      await fs.rm(tempRepo, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const sampleCapsule: AiCapsule = {
    manifest: {
      version: "1.0.0",
      capsuleId: "cap-test-123",
      createdAt: new Date().toISOString(),
      tier: "fast",
      source: {
        agent: "antigravity",
        os: "win32",
        hostname: "Machine-M1",
        workspaceName: "Project-P1"
      }
    },
    handover: {
      objective: "Implement refresh-token rotation with reuse detection",
      completedMilestones: ["Token hashing implementation", "Atomic Redis rotation"],
      observedActivity: ["Modified AuthService.ts", "Added Redis lock helper"],
      failedAttempts: ["In-memory stateless tokens failed concurrency tests"],
      importantDecisions: ["Redis token rotation selected over MongoDB", "Node 20+ runtime"],
      environmentConstraints: ["Existing login response contract must not change"],
      currentBlockerOrActiveState: "AssertionError: Expected 401 on 500ms replay, got 200",
      criticalFiles: ["src/services/TokenService.ts", "src/controllers/AuthController.ts"],
      suggestedNextAction: "Add atomic single-key check in TokenService.ts",
      primedResumePrompt: "You are resuming work on refresh-token rotation. Current blocker: AssertionError on 500ms replay window. Fix TokenService.ts."
    },
    git: {
      identity: {
        name: "Project-P1",
        branch: "feature/refresh-token",
        headCommit: "a83f91c",
        isClean: false,
        repositoryFingerprint: "fingerprint-123"
      },
      workingTreePatch: "",
      stagedPatch: "",
      untrackedSourceFiles: []
    },
    securitySummary: {
      redactedSecretsCount: 2,
      excludedFiles: [".env"]
    }
  };

  it("should save structured AI handoff into .agentdrop/ in the repo (Git-Native)", async () => {
    const saveResult = await ContextSyncManager.saveHandoff(tempRepo, sampleCapsule, { saveFullCapsule: true });

    assert.strictEqual(saveResult.success, true);
    assert.strictEqual(saveResult.identity.branch, "feature/refresh-token");
    assert.strictEqual(saveResult.document.sourceAgent, "antigravity");
    assert.strictEqual(saveResult.document.author, "Developer D1");

    // Verify .agentdrop/handover.json exists
    const handoverJsonPath = path.join(tempRepo, ".agentdrop", "handover.json");
    const jsonExists = await fs.access(handoverJsonPath).then(() => true).catch(() => false);
    assert.strictEqual(jsonExists, true);

    // Verify .agentdrop/HANDOVER.md exists and contains human-readable GitHub summary
    const mdPath = path.join(tempRepo, ".agentdrop", "HANDOVER.md");
    const mdContent = await fs.readFile(mdPath, "utf-8");
    assert.ok(mdContent.includes("# AI Context Handover"));
    assert.ok(mdContent.includes("Implement refresh-token rotation with reuse detection"));
    assert.ok(mdContent.includes("Redis token rotation selected over MongoDB"));
    assert.ok(mdContent.includes("AssertionError: Expected 401 on 500ms replay, got 200"));
    assert.ok(mdContent.includes("primedResumePrompt") || mdContent.includes("You are resuming work on refresh-token rotation"));
  });

  it("should allow D2 on Machine M2 to discover and load D1's AI context upon opening the repo", async () => {
    // Simulate D2 opening the repo
    const loadResult = await ContextSyncManager.loadHandoff(tempRepo);

    assert.strictEqual(loadResult.found, true);
    assert.strictEqual(loadResult.isBranchMatch, true);
    assert.strictEqual(loadResult.currentBranch, "feature/refresh-token");
    assert.strictEqual(loadResult.document?.handover.objective, "Implement refresh-token rotation with reuse detection");
    assert.strictEqual(loadResult.document?.author, "Developer D1");
    assert.ok(loadResult.document?.handover.primedResumePrompt.includes("Fix TokenService.ts"));
  });

  it("should report sync status and detect branch mismatches accurately", async () => {
    const status = await ContextSyncManager.getStatus(tempRepo);
    assert.strictEqual(status.hasActiveHandoff, true);
    assert.strictEqual(status.isBranchMatch, true);

    // Switch branch to main (simulating D2 on different branch)
    await execAsync("git checkout master", { cwd: tempRepo });
    const masterStatus = await ContextSyncManager.getStatus(tempRepo);
    assert.strictEqual(masterStatus.isBranchMatch, false);

    // Switch back
    await execAsync("git checkout feature/refresh-token", { cwd: tempRepo });
  });

  it("should support off-tree remote/cache context sync via contextKey", async () => {
    const identity = await GitRepoProvider.saveHandoff(tempRepo, sampleCapsule).then(r => r.identity);
    const cached = await RemoteSyncProvider.load(identity);

    assert.ok(cached !== null);
    assert.strictEqual(cached?.handover.objective, "Implement refresh-token rotation with reuse detection");
  });
});
