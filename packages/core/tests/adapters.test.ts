/**
 * AgentDrop - Agent Adapters Automated Tests
 * Authoritative Plan: Section 6, 7, 8, 9
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import { AntigravityAdapter } from "../src/adapters/antigravity/AntigravityAdapter.js";
import { ClaudeCodeAdapter } from "../src/adapters/claude/ClaudeCodeAdapter.js";

describe("Agent Adapters (Antigravity & Claude Code)", () => {
  const mockBaseDir = path.resolve("./temp-mock-adapters");
  const mockAntigravityDir = path.join(mockBaseDir, "antigravity-cli");
  const mockClaudeDir = path.join(mockBaseDir, "claude");

  before(async () => {
    // 1. Setup mock Antigravity brain session
    const brainDir = path.join(mockAntigravityDir, "brain", "test-session-uuid-1");
    const logsDir = path.join(brainDir, ".system_generated", "logs");
    await fs.mkdir(logsDir, { recursive: true });

    const mockTranscript = [
      JSON.stringify({
        step_index: 1,
        source: "USER_EXPLICIT",
        content: "Fix JWT expiration bug in AuthController.ts",
        created_at: "2026-10-04T10:00:00Z"
      }),
      JSON.stringify({
        step_index: 2,
        source: "MODEL",
        content: "I will check the token expiration logic.",
        thinking: "TOP_SECRET_INTERNAL_CHAIN_OF_THOUGHT_THAT_MUST_BE_STRIPPED",
        tool_calls: [{ toolName: "view_file", arguments: { path: "src/AuthController.ts" } }],
        created_at: "2026-10-04T10:00:10Z"
      })
    ].join("\n");

    await fs.writeFile(path.join(logsDir, "transcript.jsonl"), mockTranscript, "utf-8");
    await fs.writeFile(path.join(brainDir, "task_plan.md"), "# Auth Bug Fix Plan", "utf-8");

    // 2. Setup mock Claude Code project session
    const projectDir = path.join(mockClaudeDir, "projects", "my-api");
    await fs.mkdir(projectDir, { recursive: true });

    const mockClaudeSession = [
      JSON.stringify({
        role: "user",
        content: "Implement rate limiting using Redis",
        timestamp: "2026-10-04T10:05:00Z"
      }),
      JSON.stringify({
        role: "assistant",
        content: "Adding rate-limiter middleware.",
        tool_use: { name: "bash", command: "npm test" },
        timestamp: "2026-10-04T10:05:30Z"
      })
    ].join("\n");

    await fs.writeFile(path.join(projectDir, "session-1.jsonl"), mockClaudeSession, "utf-8");
  });

  after(async () => {
    await fs.rm(mockBaseDir, { recursive: true, force: true }).catch(() => {});
  });

  it("should discover and extract Antigravity sessions while stripping hidden thinking chains", async () => {
    const adapter = new AntigravityAdapter(mockAntigravityDir);
    assert.strictEqual(await adapter.isInstalled(), true);

    const sessions = await adapter.listRecentSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].sessionId, "test-session-uuid-1");
    assert.ok(sessions[0].title.includes("Fix JWT expiration bug"));

    const extracted = await adapter.extractSession(sessions[0].sessionId);
    assert.strictEqual(extracted.turns.length, 2);
    assert.strictEqual(extracted.artifacts?.length, 1);
    assert.strictEqual(extracted.artifacts?.[0].fileName, "task_plan.md");

    // Enforce Section 9: Ensure thinking was completely stripped
    const modelTurn = extracted.turns[1];
    assert.strictEqual((modelTurn as any).thinking, undefined);
    assert.strictEqual(JSON.stringify(extracted).includes("TOP_SECRET_INTERNAL"), false);
  });

  it("should discover and extract Claude Code project sessions", async () => {
    const adapter = new ClaudeCodeAdapter(mockClaudeDir);
    assert.strictEqual(await adapter.isInstalled(), true);

    const sessions = await adapter.listRecentSessions();
    assert.strictEqual(sessions.length, 1);
    assert.ok(sessions[0].sessionId.includes("session-1.jsonl"));
    assert.ok(sessions[0].title.includes("Implement rate limiting"));

    const extracted = await adapter.extractSession(sessions[0].sessionId);
    assert.strictEqual(extracted.turns.length, 2);
    assert.strictEqual(extracted.turns[0].role, "user");
    assert.strictEqual(extracted.turns[1].role, "assistant");
  });
});
