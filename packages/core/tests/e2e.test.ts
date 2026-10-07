/**
 * AgentDrop - Full End-to-End Integration Test
 * Authoritative Plan: Section 46 (npm run test:e2e)
 *
 * Simulates complete chain:
 * Mock Session ➔ Git Snapshot ➔ Pre-Sanitize ➔ Handover Engine ➔ Capsule Pack
 * ➔ Pairing ➔ ECDH/HKDF ➔ AES-GCM ➔ Transfer ➔ Decrypt ➔ Validate ➔ Extract ➔ Handover Ready
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import {
  PreSanitizer,
  DeterministicExtractor,
  CapsulePackager,
  AgentDropSender,
  AgentDropReceiver,
  GitIdentity
} from "../src/index.js";

describe("AgentDrop End-to-End Integration (test:e2e)", () => {
  const stagingDir = path.resolve("./temp-e2e-staging");
  const repoRoot = path.resolve("./");

  before(async () => {
    await fs.mkdir(stagingDir, { recursive: true });
  });

  after(async () => {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  });

  it("should successfully execute full end-to-end context portability chain", async () => {
    // 1. Raw in-flight agent conversation turns with unscrubbed sensitive keys
    const rawTurns = [
      {
        role: "user" as const,
        timestamp: "2026-10-04T10:00:00Z",
        content: "Fix the race condition in TokenService.ts. Use sk-1234567890abcdef1234567890abcdef for testing."
      },
      {
        role: "assistant" as const,
        timestamp: "2026-10-04T10:00:15Z",
        content: "I will add Redis single-key lock in TokenService.ts.",
        toolSummary: "view_file src/TokenService.ts"
      },
      {
        role: "user" as const,
        timestamp: "2026-10-04T10:01:00Z",
        content: "Make sure Node 20+ runtime is targeted and run tests."
      },
      {
        role: "assistant" as const,
        timestamp: "2026-10-04T10:01:45Z",
        content: "Running tests: AssertionError: Expected 401 on token reuse, got 200.",
        toolSummary: "run_command npm test"
      }
    ];

    // 2. Enforce Invariant 2: Pre-AI Sanitization
    const { sanitizedTurns, redactedCount } = PreSanitizer.preSanitize(rawTurns);
    assert.ok(redactedCount > 0, "Pre-sanitizer must scrub raw keys before context distillation");
    assert.ok(!sanitizedTurns[0].content.includes("sk-1234567890"), "Raw key leaked through pre-sanitizer");

    // 3. Git Snapshot
    const identity = await GitIdentity.getWorkspaceIdentity(repoRoot);
    const mockGitSnapshot = {
      identity,
      workingTreePatch: "diff --git a/src/TokenService.ts b/src/TokenService.ts\n+ lock.acquire();",
      stagedPatch: "",
      untrackedSourceFiles: [
        {
          relativePath: "src/types/token.ts",
          content: "export interface TokenPair { access: string; refresh: string; }"
        }
      ]
    };

    // 4. Deterministic Context Extractor (Mode A: Offline Guaranteed)
    const handover = DeterministicExtractor.extract({
      sessionTitle: "Fix refresh-token race condition",
      firstSubstantiveUserPrompt: sanitizedTurns[0].content,
      recentUserPrompts: [sanitizedTurns[0].content, sanitizedTurns[2].content],
      lastAssistantResponse: sanitizedTurns[3].content,
      recentToolErrors: ["AssertionError: Expected 401 on token reuse, got 200."],
      modifiedFilesList: ["src/TokenService.ts"],
      gitDiffStat: "1 file changed, 1 insertion(+)"
    });

    assert.strictEqual(handover.objective, "Make sure Node 20+ runtime is targeted and run tests.");
    assert.ok(handover.primedResumePrompt.includes("Make sure Node 20+ runtime is targeted and run tests."));
    assert.ok(handover.primedResumePrompt.includes("AssertionError"));

    // 5. Pack Capsule with Universal Security Scan (Invariant 3)
    const { serialized } = CapsulePackager.pack({
      tier: "full",
      sourceAgent: "antigravity",
      workspaceName: "cadence-api",
      handover,
      git: mockGitSnapshot,
      conversation: {
        totalTurns: sanitizedTurns.length,
        turns: sanitizedTurns
      },
      selectedFiles: mockGitSnapshot.untrackedSourceFiles
    });

    // 6. Start Sender on Machine A
    const sender = new AgentDropSender(serialized, "Anshul-Workstation");
    const port = await sender.start(0);

    try {
      const qrPayload = sender.getPairingPayload("127.0.0.1");

      // 7. Receiver on Machine B initiates handshake
      const receiver = new AgentDropReceiver(stagingDir, "Anshul-Laptop");
      const { sasCode, senderDevice } = await receiver.initiateHandshake(qrPayload);

      assert.strictEqual(senderDevice, "Anshul-Workstation");
      assert.strictEqual(sasCode.length, 6);

      // 8. Explicit User Acceptance on Receiver (Invariant: Receiver Approval)
      const unpackResult = await receiver.acceptHandover();

      // 9. Verify Final Handover State on Machine B
      assert.strictEqual(unpackResult.capsule.handover.objective, "Make sure Node 20+ runtime is targeted and run tests.");
      assert.strictEqual(unpackResult.capsule.git.identity.name, identity.name);
      assert.strictEqual(unpackResult.capsule.conversation?.totalTurns, 4);
      assert.ok(unpackResult.validatedFilePaths.length > 0);
      assert.strictEqual(receiver.getState(), "HANDOVER_READY");
      assert.strictEqual(sender.getState(), "COMPLETE");
    } finally {
      await sender.close();
    }
  });
});
