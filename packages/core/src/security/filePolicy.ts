/**
 * AgentDrop - File Policy & Exclusion Rules
 * Authoritative Implementation Plan: Sections 14, 18, 25
 */

import path from "node:path";

export const EXCLUDED_FILE_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i,
  /.*\.pem$/i,
  /.*\.key$/i,
  /credentials\..+$/i,
  /service-account.*\.json$/i,
  /id_rsa(\..+)?$/i,
  /.*\.p12$/i,
  /.*\.pfx$/i,
  /secrets?\..+$/i,
  /^node_modules$/i,
  /^\.git$/i
];

export const SAFE_UNTRACKED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".json", ".md", ".css", ".scss", ".html",
  ".yaml", ".yml", ".toml", ".sql", ".rs", ".go",
  ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".rb"
]);

export const LIMITS = {
  MAX_INDIVIDUAL_FILE_BYTES: 5 * 1024 * 1024,   // 5 MB
  MAX_COMPRESSED_BYTES: 50 * 1024 * 1024,      // 50 MB
  MAX_UNCOMPRESSED_BYTES: 100 * 1024 * 1024,   // 100 MB decomp bomb threshold
  MAX_FILE_COUNT: 500
};

export function isFileExcluded(filePath: string): boolean {
  const base = path.basename(filePath);
  // Check if any directory segment or the filename itself matches excluded patterns
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts.some(part => EXCLUDED_FILE_PATTERNS.some(regex => regex.test(part)));
}

export function isSafeUntrackedExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SAFE_UNTRACKED_EXTENSIONS.has(ext);
}
