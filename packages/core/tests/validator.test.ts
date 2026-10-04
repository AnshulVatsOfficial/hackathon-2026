/**
 * AgentDrop - Capsule Validator Tests
 * Authoritative Plan: Section 46 (npm run test:validator)
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { CapsuleValidator } from "../src/capsule/validator.js";

describe("CapsuleValidator & Boundary Guard", () => {
  const targetDir = path.resolve("./temp-staging");

  it("should block directory traversal attacks (../ and segment checks)", () => {
    assert.throws(
      () => CapsuleValidator.validateSafeRelativePath(targetDir, "../escape.ts"),
      /Path traversal segment prohibited/
    );

    assert.throws(
      () => CapsuleValidator.validateSafeRelativePath(targetDir, "foo/../../escape.ts"),
      /Path traversal segment prohibited/
    );

    assert.throws(
      () => CapsuleValidator.validateSafeRelativePath(targetDir, "src/../../../etc/passwd"),
      /Path traversal segment prohibited/
    );
  });

  it("should block absolute paths and Windows drive letters", () => {
    assert.throws(
      () => CapsuleValidator.validateSafeRelativePath(targetDir, "/absolute/path/file.ts"),
      /Absolute path prohibited/
    );

    assert.throws(
      () => CapsuleValidator.validateSafeRelativePath(targetDir, "C:/Windows/System32/calc.exe"),
      /Absolute path prohibited/
    );
  });

  it("should allow legitimate filenames with double dots like 'foo..bar.ts'", () => {
    const safePath = CapsuleValidator.validateSafeRelativePath(targetDir, "src/foo..bar.ts");
    assert.ok(safePath.includes("foo..bar.ts"), "Failed to allow legitimate filename foo..bar.ts");
  });

  it("should enforce decompression file count limits", () => {
    assert.throws(
      () => CapsuleValidator.validateDecompressionLimits(501, 1000, 2000),
      /exceeds max file count limit/
    );
  });

  it("should block duplicate paths in archives", () => {
    assert.throws(
      () => CapsuleValidator.validateNoDuplicatePaths(["src/index.ts", "src/Index.ts"]),
      /Duplicate path detected/
    );
  });
});
