/**
 * AgentDrop - Capsule Packaging & Unpacking Round-Trip Tests
 * Authoritative Plan: Section 45, 46 (npm run test:capsule)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { CapsulePackager } from "../src/capsule/packager.js";
import { CapsuleUnpacker } from "../src/capsule/unpacker.js";
import { AiHandoverState, GitSnapshot } from "../src/capsule/schema.js";

describe("Capsule Packager & Unpacker Round-Trip", () => {
  const mockHandover: AiHandoverState = {
    objective: "Implement token rotation",
    completedMilestones: ["Created TokenService.ts"],
    observedActivity: ["Modified 2 files"],
    failedAttempts: ["Initial stateless approach failed"],
    currentBlockerOrActiveState: "Testing token replay prevention",
    criticalFiles: ["src/TokenService.ts"],
    importantDecisions: ["Use Redis for token cache"],
    environmentConstraints: ["Requires Node 20+"],
    suggestedNextAction: "Run test suite",
    primedResumePrompt: "Please resume implementation of token rotation in src/TokenService.ts."
  };

  const mockGit: GitSnapshot = {
    identity: {
      name: "cadence-api",
      branch: "feature/auth",
      headCommit: "a83f91c9201",
      isClean: false,
      repositoryFingerprint: "e3b0c44298fc1c14"
    },
    workingTreePatch: "diff --git a/src/TokenService.ts b/src/TokenService.ts\n+ export const token = 'sk-proj-secretkey1234567890abcdef12345';",
    stagedPatch: "",
    untrackedSourceFiles: [
      {
        relativePath: "tests/TokenService.test.ts",
        content: "describe('TokenService', () => {});"
      }
    ]
  };

  it("should assemble, universally sanitize, serialize, and unpack a valid capsule", () => {
    // 1. Pack
    const { capsule, serialized } = CapsulePackager.pack({
      tier: "native",
      sourceAgent: "antigravity",
      workspaceName: "cadence-api",
      handover: mockHandover,
      git: mockGit,
      selectedFiles: [
        {
          relativePath: "tests/TokenService.test.ts",
          content: "describe('TokenService', () => {});"
        }
      ],
      nativePayload: {
        adapterId: "antigravity",
        rawFiles: {
          "brain/transcript.jsonl": "User prompt containing sk-1234567890abcdef1234567890abcdef"
        }
      }
    });

    assert.ok(serialized.length > 0);
    assert.strictEqual(capsule.manifest.version, "1.0.0");
    assert.strictEqual(capsule.manifest.source.workspaceName, "cadence-api");

    // Invariant 3: Verify secrets in git patch and nativePayload were universally redacted
    assert.ok(!capsule.git.workingTreePatch.includes("sk-proj-secretkey"), "Secret leaked into git patch");
    assert.ok(
      !capsule.nativePayload?.rawFiles["brain/transcript.jsonl"].includes("sk-1234567890"),
      "Secret leaked into nativePayload"
    );
    assert.ok(capsule.securitySummary.redactedSecretsCount >= 2, "Expected redactions in capsule");

    // 2. Unpack
    const stagingDir = path.resolve("./temp-staging");
    const { capsule: unpacked, validatedFilePaths } = CapsuleUnpacker.unpack(serialized, stagingDir);

    assert.strictEqual(unpacked.manifest.capsuleId, capsule.manifest.capsuleId);
    assert.strictEqual(unpacked.handover.objective, mockHandover.objective);
    assert.ok(validatedFilePaths.length >= 2, "Expected validated paths for untracked and native files");
  });

  it("should validate and unpack the golden demo fixture successfully", async () => {
    const fs = await import("node:fs/promises");
    const fixturePath = path.resolve("./fixtures/antigravity-auth-fixture/expected-capsule.json");
    const fixtureContent = await fs.readFile(fixturePath, "utf-8");

    const stagingDir = path.resolve("./temp-staging");
    const { capsule, totalBytes } = CapsuleUnpacker.unpack(fixtureContent, stagingDir);

    assert.strictEqual(capsule.manifest.capsuleId, "demo-golden-fixture-uuid");
    assert.strictEqual(capsule.handover.objective, "Fix refresh-token race condition");
    assert.strictEqual(capsule.handover.importantDecisions.length, 2);
    assert.strictEqual(capsule.handover.environmentConstraints.length, 2);
    assert.ok(totalBytes > 0);
  });
});
