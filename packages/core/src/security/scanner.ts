/**
 * AgentDrop - Universal Security Scanner (Layer 2 Content Redactor)
 * Authoritative Implementation Plan: Sections 14, 15
 */

import { isFileExcluded } from "./filePolicy.js";

export interface SecretPattern {
  name: string;
  regex: RegExp;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { name: "OpenAI Key", regex: /sk-(?:proj-)?[a-zA-Z0-9_\-]{20,}/g },
  { name: "Google API Key", regex: /AIza[0-9A-Za-z-_]{35}/g },
  { name: "GitHub Token", regex: /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{40,})/g },
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g },
  { name: "Bearer Token", regex: /Bearer\s+[a-zA-Z0-9_\-\.=:_\+\/]{20,}/g },
  { name: "JWT Token", regex: /eyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}/g },
  { name: "Private Key", regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g },
  { name: "Database URL", regex: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[a-zA-Z0-9_\-\.:%]+@[a-zA-Z0-9_\-\.:]+(?:\/[a-zA-Z0-9_\-\.]*)?/g },
  { name: "Generic Secret Assignment", regex: /(?<=(?:api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token)\s*[:=]\s*["']?)[a-zA-Z0-9_\-\.+=/]{16,}/gi }
];

export class SecurityScanner {
  /**
   * Sanitizes a string, replacing detected secrets with [REDACTED_SECRET].
   */
  static sanitizeText(text: string): { cleanText: string; redactions: number } {
    if (!text || typeof text !== "string") {
      return { cleanText: text, redactions: 0 };
    }

    let cleanText = text;
    let redactions = 0;

    for (const { regex } of SECRET_PATTERNS) {
      // Create new RegExp to reset lastIndex
      const pattern = new RegExp(regex.source, regex.flags);
      cleanText = cleanText.replace(pattern, () => {
        redactions++;
        return "[REDACTED_SECRET]";
      });
    }

    return { cleanText, redactions };
  }

  /**
   * Recursively sanitizes any JavaScript object or primitive.
   */
  static sanitizeObject<T>(obj: T): { sanitized: T; totalRedactions: number } {
    if (obj === null || obj === undefined) {
      return { sanitized: obj, totalRedactions: 0 };
    }

    if (typeof obj === "string") {
      const { cleanText, redactions } = this.sanitizeText(obj);
      return { sanitized: cleanText as unknown as T, totalRedactions: redactions };
    }

    if (typeof obj !== "object") {
      return { sanitized: obj, totalRedactions: 0 };
    }

    if (Array.isArray(obj)) {
      let totalRedactions = 0;
      const sanitizedArray = obj.map(item => {
        const res = this.sanitizeObject(item);
        totalRedactions += res.totalRedactions;
        return res.sanitized;
      });
      return { sanitized: sanitizedArray as unknown as T, totalRedactions };
    }

    let totalRedactions = 0;
    const sanitizedObj: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Check if the key itself indicates a sensitive file or key
      if (isFileExcluded(key)) {
        totalRedactions++;
        sanitizedObj[key] = "[EXCLUDED_SENSITIVE_FILE]";
        continue;
      }

      const res = this.sanitizeObject(value);
      totalRedactions += res.totalRedactions;
      sanitizedObj[key] = res.sanitized;
    }

    return { sanitized: sanitizedObj as T, totalRedactions };
  }
}
