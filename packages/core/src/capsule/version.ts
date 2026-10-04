/**
 * AgentDrop - Capsule Versioning
 * Authoritative Implementation Plan: Section 22
 */

export const CURRENT_CAPSULE_VERSION = "1.0.0";
export const SUPPORTED_CAPSULE_VERSIONS = new Set(["1.0.0"]);

export function isVersionCompatible(version: string): boolean {
  return SUPPORTED_CAPSULE_VERSIONS.has(version);
}
