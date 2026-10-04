/**
 * AgentDrop - Security & Sanitization Tests
 * Authoritative Plan: Section 46 (npm run test:security)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { SecurityScanner } from "../src/security/scanner.js";
import { isFileExcluded } from "../src/security/filePolicy.js";
import { PreSanitizer, RawTurn } from "../src/security/preSanitizer.js";

describe("Security & File Policy", () => {
  it("should correctly identify sensitive and excluded files", () => {
    assert.strictEqual(isFileExcluded(".env"), true);
    assert.strictEqual(isFileExcluded(".env.local"), true);
    assert.strictEqual(isFileExcluded("config/.env.production"), true);
    assert.strictEqual(isFileExcluded("id_rsa"), true);
    assert.strictEqual(isFileExcluded("cert.pem"), true);
    assert.strictEqual(isFileExcluded("service-account.json"), true);
    assert.strictEqual(isFileExcluded("credentials.json"), true);

    // Safe files
    assert.strictEqual(isFileExcluded("src/index.ts"), false);
    assert.strictEqual(isFileExcluded("package.json"), false);
    assert.strictEqual(isFileExcluded("README.md"), false);
  });

  it("should redact API keys and credentials from text", () => {
    const rawText = `
      OpenAI: sk-proj-1234567890abcdef1234567890abcdef12
      Google: AIzaSyA1234567890abcdefghijklmnopqrstuv
      GitHub: ghp_1234567890abcdefghijklmnopqrstuvwxyz
      AWS: AKIAIOSFODNN7EXAMPLE
      Bearer: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz
      DB: postgres://postgres:mysecretpassword@db.example.com:5432/mydb
    `;

    const { cleanText, redactions } = SecurityScanner.sanitizeText(rawText);
    assert.ok(redactions >= 6, `Expected at least 6 redactions, got ${redactions}`);
    assert.ok(!cleanText.includes("sk-proj-"), "OpenAI key leaked");
    assert.ok(!cleanText.includes("AIzaSyA"), "Google key leaked");
    assert.ok(!cleanText.includes("ghp_"), "GitHub token leaked");
    assert.ok(!cleanText.includes("AKIAIOSFODNN7EXAMPLE"), "AWS key leaked");
    assert.ok(!cleanText.includes("mysecretpassword"), "DB password leaked");
    assert.ok(cleanText.includes("[REDACTED_SECRET]"), "Expected [REDACTED_SECRET] marker");
  });

  it("should enforce Invariant 2: Pre-AI Sanitization on raw transcripts", () => {
    const rawTurns: RawTurn[] = [
      {
        role: "user",
        timestamp: "2026-10-04T10:00:00Z",
        content: "Please test with key sk-1234567890abcdef1234567890abcdef"
      },
      {
        role: "assistant",
        timestamp: "2026-10-04T10:00:05Z",
        content: "Configuring environment with key.",
        toolCalls: [
          {
            toolName: "write_file",
            arguments: {
              path: ".env",
              content: "API_KEY=sk-1234567890abcdef1234567890abcdef"
            },
            output: "Wrote to .env"
          }
        ]
      }
    ];

    const result = PreSanitizer.preSanitize(rawTurns);
    assert.ok(result.redactedCount > 0, "Expected redactions in pre-sanitization");
    assert.ok(!result.sanitizedTurns[0].content.includes("sk-1234567890"), "User key was not pre-sanitized");
    assert.strictEqual(result.sanitizedTurns[1].toolCalls?.[0].arguments?.path, "[EXCLUDED_SENSITIVE_FILE]");
  });
});
