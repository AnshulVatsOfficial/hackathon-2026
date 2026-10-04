/**
 * AgentDrop - Pre-AI Sanitizer
 * Authoritative Implementation Plan: Invariant 2, Sections 3, 13
 */

import { SecurityScanner } from "./scanner.js";
import { isFileExcluded } from "./filePolicy.js";

export interface RawTurn {
  role: "user" | "assistant";
  timestamp: string;
  content: string;
  toolSummary?: string;
  toolCalls?: Array<{
    toolName: string;
    arguments?: Record<string, any>;
    output?: string;
  }>;
}

export interface PreSanitizeResult {
  sanitizedTurns: RawTurn[];
  redactedCount: number;
  excludedFileCount: number;
}

export class PreSanitizer {
  /**
   * Enforces Invariant 2: Scrubs raw conversation turns before ANY model (local or cloud)
   * can inspect them.
   */
  static preSanitize(rawTurns: RawTurn[]): PreSanitizeResult {
    let redactedCount = 0;
    let excludedFileCount = 0;

    const sanitizedTurns: RawTurn[] = rawTurns.map(turn => {
      // 1. Sanitize content text
      const contentRes = SecurityScanner.sanitizeText(turn.content);
      redactedCount += contentRes.redactions;

      // 2. Sanitize tool summary if present
      let toolSummary = turn.toolSummary;
      if (toolSummary) {
        const summaryRes = SecurityScanner.sanitizeText(toolSummary);
        redactedCount += summaryRes.redactions;
        toolSummary = summaryRes.cleanText;
      }

      // 3. Sanitize tool calls
      let toolCalls = turn.toolCalls;
      if (toolCalls && Array.isArray(toolCalls)) {
        toolCalls = toolCalls.map(call => {
          let cleanOutput = call.output;
          if (cleanOutput) {
            const outRes = SecurityScanner.sanitizeText(cleanOutput);
            redactedCount += outRes.redactions;
            cleanOutput = outRes.cleanText;
          }

          let cleanArgs = call.arguments;
          if (cleanArgs) {
            // Check for file exclusions in arguments
            for (const [argKey, argVal] of Object.entries(cleanArgs)) {
              if (typeof argVal === "string" && isFileExcluded(argVal)) {
                excludedFileCount++;
                cleanArgs[argKey] = "[EXCLUDED_SENSITIVE_FILE]";
              }
            }
            const argsRes = SecurityScanner.sanitizeObject(cleanArgs);
            redactedCount += argsRes.totalRedactions;
            cleanArgs = argsRes.sanitized;
          }

          return {
            toolName: call.toolName,
            arguments: cleanArgs,
            output: cleanOutput
          };
        });
      }

      return {
        role: turn.role,
        timestamp: turn.timestamp,
        content: contentRes.cleanText,
        toolSummary,
        toolCalls
      };
    });

    return {
      sanitizedTurns,
      redactedCount,
      excludedFileCount
    };
  }
}
