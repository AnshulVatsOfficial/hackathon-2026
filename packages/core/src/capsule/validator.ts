/**
 * AgentDrop - Capsule Validator & Archive Boundary Guard
 * Authoritative Implementation Plan: Invariant 5, Sections 23, 24, 25
 */

import path from "node:path";
import { LIMITS } from "../security/filePolicy.js";
import { isVersionCompatible } from "./version.js";
import { AiCapsule } from "./schema.js";

export class CapsuleValidator {
  /**
   * Enforces Invariant 5: Segment-aware path validation preventing Zip-Slip / directory traversal.
   * Allows legitimate filenames like 'foo..bar.ts' while rejecting actual traversal segments.
   */
  static validateSafeRelativePath(targetDirectory: string, relativePath: string): string {
    if (!relativePath || typeof relativePath !== "string") {
      throw new Error("Validation Error: Relative path must be a non-empty string");
    }

    // 1. Normalize slash direction
    const normalized = relativePath.replace(/\\/g, "/");

    // 2. Reject absolute paths or Windows drive letters
    if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith("/")) {
      throw new Error(`Security Violation: Absolute path prohibited: ${relativePath}`);
    }

    // 3. Segment-aware check: reject any segment that is strictly '..' or '.'
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 0) {
      throw new Error(`Security Violation: Path contains no valid segments: ${relativePath}`);
    }

    for (const segment of segments) {
      if (segment === ".." || segment === ".") {
        throw new Error(`Security Violation: Path traversal segment prohibited: ${relativePath}`);
      }
    }

    // 4. Boundary escape check
    const resolvedTarget = path.resolve(targetDirectory);
    const resolvedPath = path.resolve(resolvedTarget, ...segments);
    const targetPrefix = resolvedTarget.endsWith(path.sep) ? resolvedTarget : resolvedTarget + path.sep;

    if (!resolvedPath.startsWith(targetPrefix)) {
      throw new Error(`Security Violation: Path escapes target directory: ${relativePath}`);
    }

    return resolvedPath;
  }

  /**
   * Enforces decompression bomb thresholds and size limits.
   */
  static validateDecompressionLimits(
    entryCount: number,
    compressedBytes: number,
    uncompressedBytes: number
  ): void {
    if (entryCount > LIMITS.MAX_FILE_COUNT) {
      throw new Error(
        `Security Violation: Capsule exceeds max file count limit (${entryCount} > ${LIMITS.MAX_FILE_COUNT})`
      );
    }

    if (compressedBytes > LIMITS.MAX_COMPRESSED_BYTES) {
      throw new Error(
        `Security Violation: Capsule exceeds compressed size limit (${compressedBytes} > ${LIMITS.MAX_COMPRESSED_BYTES} bytes)`
      );
    }

    if (uncompressedBytes > LIMITS.MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Security Violation: Capsule exceeds uncompressed size limit (${uncompressedBytes} > ${LIMITS.MAX_UNCOMPRESSED_BYTES} bytes)`
      );
    }
  }

  /**
   * Rejects duplicate paths in capsule archives to prevent overwrites / shadowing attacks.
   */
  static validateNoDuplicatePaths(filePaths: string[]): void {
    const seen = new Set<string>();
    for (const p of filePaths) {
      const normalized = p.replace(/\\/g, "/").toLowerCase();
      if (seen.has(normalized)) {
        throw new Error(`Security Violation: Duplicate path detected in capsule: ${p}`);
      }
      seen.add(normalized);
    }
  }

  /**
   * Validates capsule schema and version compatibility.
   */
  static validateSchema(capsule: unknown): asserts capsule is AiCapsule {
    if (!capsule || typeof capsule !== "object") {
      throw new Error("Validation Error: Capsule payload is not an object");
    }

    const c = capsule as Partial<AiCapsule>;

    if (!c.manifest || typeof c.manifest !== "object") {
      throw new Error("Validation Error: Missing or invalid capsule manifest");
    }

    if (!c.manifest.version || !isVersionCompatible(c.manifest.version)) {
      throw new Error(`Validation Error: Unsupported capsule version: ${c.manifest.version}`);
    }

    if (!c.manifest.capsuleId || typeof c.manifest.capsuleId !== "string") {
      throw new Error("Validation Error: Missing or invalid capsuleId in manifest");
    }

    if (!c.handover || typeof c.handover !== "object") {
      throw new Error("Validation Error: Missing or invalid handover state in capsule");
    }

    if (typeof c.handover.objective !== "string" || typeof c.handover.primedResumePrompt !== "string") {
      throw new Error("Validation Error: Handover must contain objective and primedResumePrompt");
    }

    if (!c.git || typeof c.git !== "object") {
      throw new Error("Validation Error: Missing or invalid git snapshot in capsule");
    }

    if (!c.git.identity || typeof c.git.identity.repositoryFingerprint !== "string") {
      throw new Error("Validation Error: Git snapshot must include workspace identity fingerprint");
    }

    if (!c.securitySummary || typeof c.securitySummary.redactedSecretsCount !== "number") {
      throw new Error("Validation Error: Missing securitySummary in capsule");
    }
  }
}
