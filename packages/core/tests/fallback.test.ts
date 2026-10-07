/**
 * AgentDrop - Deterministic Fallback Tests
 * Authoritative Plan: Section 46 (npm run test:fallback)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { DeterministicExtractor } from "../src/context/deterministicExtractor.js";

describe("Deterministic Context Extractor", () => {
  it("should synthesize structured handover state from development signals", () => {
    const handover = DeterministicExtractor.extract({
      sessionTitle: "Fix refresh-token race condition",
      firstSubstantiveUserPrompt: "Fix concurrent requests reusing an expired refresh token",
      recentUserPrompts: [
        "Check Redis lock logic",
        "Run unit tests for auth controller",
        "Make sure token rotation returns 401 on replay"
      ],
      lastAssistantResponse: "Updated TokenService.ts to check Redis replay cache.",
      recentToolErrors: [
        "TypeError: Cannot read properties of undefined (reading 'replayHash')",
        "AssertionError: Expected 401 but received 200"
      ],
      modifiedFilesList: ["src/services/TokenService.ts", "src/controllers/AuthController.ts"],
      gitDiffStat: "2 files changed, 45 insertions(+), 12 deletions(-)"
    });

    assert.strictEqual(handover.objective, "Make sure token rotation returns 401 on replay");
    assert.ok(handover.observedActivity && handover.observedActivity.length > 0);
    assert.strictEqual(handover.failedAttempts.length, 2);
    assert.ok(handover.currentBlockerOrActiveState.includes("AssertionError"));
    assert.strictEqual(handover.criticalFiles.length, 2);
    assert.ok(handover.primedResumePrompt.includes("Make sure token rotation returns 401 on replay"));
    assert.ok(handover.primedResumePrompt.includes("AssertionError"));
    assert.strictEqual(handover.confidence?.objective, "high");
  });
});
