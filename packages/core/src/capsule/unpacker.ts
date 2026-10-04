/**
 * AgentDrop - Capsule Unpacker
 * Authoritative Implementation Plan: Invariant 5, Sections 23, 24, 25
 */

import { AiCapsule } from "./schema.js";
import { CapsuleValidator } from "./validator.js";

export interface UnpackResult {
  capsule: AiCapsule;
  validatedFilePaths: string[];
  totalBytes: number;
}

export class CapsuleUnpacker {
  /**
   * Parses, validates, and bounds-checks an incoming capsule string or payload.
   */
  static unpack(serializedCapsule: string, targetStagingDir?: string): UnpackResult {
    if (!serializedCapsule || typeof serializedCapsule !== "string") {
      throw new Error("Unpack Error: Serialized capsule must be a non-empty string");
    }

    const uncompressedBytes = Buffer.byteLength(serializedCapsule, "utf-8");

    let parsed: unknown;
    try {
      parsed = JSON.parse(serializedCapsule);
    } catch (err: any) {
      throw new Error(`Unpack Error: Failed to parse capsule JSON: ${err?.message}`);
    }

    // 1. Schema & Version Validation
    CapsuleValidator.validateSchema(parsed);

    const capsule = parsed;
    const validatedFilePaths: string[] = [];

    // 2. Collect all file paths (untracked files and native files)
    const allPaths: string[] = [];

    if (capsule.selectedFiles && Array.isArray(capsule.selectedFiles)) {
      for (const file of capsule.selectedFiles) {
        allPaths.push(file.relativePath);
      }
    }

    if (capsule.nativePayload && capsule.nativePayload.rawFiles) {
      for (const relPath of Object.keys(capsule.nativePayload.rawFiles)) {
        allPaths.push(relPath);
      }
    }

    // 3. Enforce Decompression & File Count Limits
    CapsuleValidator.validateDecompressionLimits(allPaths.length, uncompressedBytes, uncompressedBytes);

    // 4. Duplicate Path Protection
    CapsuleValidator.validateNoDuplicatePaths(allPaths);

    // 5. Segment-Aware Path Traversal Checks
    if (targetStagingDir) {
      for (const relPath of allPaths) {
        const safeResolved = CapsuleValidator.validateSafeRelativePath(targetStagingDir, relPath);
        validatedFilePaths.push(safeResolved);
      }
    }

    return {
      capsule,
      validatedFilePaths,
      totalBytes: uncompressedBytes
    };
  }
}
