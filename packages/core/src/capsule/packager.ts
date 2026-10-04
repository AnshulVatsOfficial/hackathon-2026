/**
 * AgentDrop - Capsule Packager
 * Authoritative Implementation Plan: Invariant 3, Sections 15, 20, 21
 */

import crypto from "node:crypto";
import { AiCapsule, AiCapsuleManifest, AiHandoverState, GitSnapshot } from "./schema.js";
import { SecurityScanner } from "../security/scanner.js";
import { CapsuleValidator } from "./validator.js";
import { CURRENT_CAPSULE_VERSION } from "./version.js";

export interface PackCapsuleInput {
  tier?: "fast" | "full" | "native";
  sourceAgent: "antigravity" | "claude-code";
  agentVersion?: string;
  workspaceName: string;
  handover: AiHandoverState;
  git: GitSnapshot;
  conversation?: AiCapsule["conversation"];
  selectedFiles?: AiCapsule["selectedFiles"];
  nativePayload?: AiCapsule["nativePayload"];
}

export class CapsulePackager {
  /**
   * Assembles and packs an AiCapsule, enforcing Invariant 3:
   * Universal security scanning across all components (including nativePayload and git).
   */
  static pack(input: PackCapsuleInput): { capsule: AiCapsule; serialized: string } {
    const tier = input.tier || "full";
    const capsuleId = crypto.randomUUID();

    const manifest: AiCapsuleManifest = {
      version: CURRENT_CAPSULE_VERSION,
      capsuleId,
      createdAt: new Date().toISOString(),
      tier,
      source: {
        agent: input.sourceAgent,
        agentVersion: input.agentVersion,
        os: process.platform as "win32" | "darwin" | "linux",
        hostname: process.env.COMPUTERNAME || process.env.HOSTNAME || "localhost",
        workspaceName: input.workspaceName
      },
      compatibility: {
        adapterVersion: "1.0.0",
        nativeRestoreSupported: !!input.nativePayload
      }
    };

    // 1. Assemble raw capsule structure
    const rawCapsule: AiCapsule = {
      manifest,
      handover: input.handover,
      git: input.git,
      securitySummary: {
        redactedSecretsCount: 0,
        excludedFiles: []
      },
      conversation: tier !== "fast" ? input.conversation : undefined,
      selectedFiles: input.selectedFiles,
      nativePayload: tier === "native" ? input.nativePayload : undefined
    };

    // 2. Enforce Invariant 3: Universal Security Scan across entire capsule
    const { sanitized, totalRedactions } = SecurityScanner.sanitizeObject(rawCapsule);
    sanitized.securitySummary.redactedSecretsCount = totalRedactions;

    // 3. Schema validation
    CapsuleValidator.validateSchema(sanitized);

    const serialized = JSON.stringify(sanitized, null, 2);

    return {
      capsule: sanitized,
      serialized
    };
  }
}
