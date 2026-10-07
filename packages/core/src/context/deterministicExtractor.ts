/**
 * AgentDrop - Deterministic Context Extractor
 * Authoritative Implementation Plan: Sections 12, 38, 39
 */

import { AiHandoverState } from "../capsule/schema.js";

export interface FallbackInput {
  sessionTitle?: string;
  firstSubstantiveUserPrompt: string;
  recentUserPrompts: string[];
  lastAssistantResponse?: string;
  recentToolErrors: string[];
  modifiedFilesList: string[];
  gitDiffStat?: string;
}

export class DeterministicExtractor {
  /**
   * Synthesizes actionable developer state without requiring a cloud LLM or local model.
   * Mode A: Deterministic Offline (must never fail).
   */
  static extract(input: FallbackInput): AiHandoverState {
    // 1. Determine Objective: prefer most recent user prompt, fallback to sessionTitle or first substantive user prompt
    let objective = "Active Coding Session";
    if (input.recentUserPrompts && input.recentUserPrompts.length > 0) {
      const lastPrompt = input.recentUserPrompts[input.recentUserPrompts.length - 1].trim();
      if (lastPrompt.length > 0) {
        objective = lastPrompt.length > 120 ? lastPrompt.slice(0, 117) + "..." : lastPrompt;
      }
    } else if (input.sessionTitle && input.sessionTitle.trim().length > 3) {
      objective = input.sessionTitle.trim();
    } else if (input.firstSubstantiveUserPrompt && input.firstSubstantiveUserPrompt.trim().length > 0) {
      const cleanPrompt = input.firstSubstantiveUserPrompt.trim();
      objective = cleanPrompt.length > 120 ? cleanPrompt.slice(0, 117) + "..." : cleanPrompt;
    }

    // 2. Observed Activity (observable facts, not fabricated milestones)
    const observedActivity: string[] = [];
    if (input.modifiedFilesList.length > 0) {
      observedActivity.push(`Modified ${input.modifiedFilesList.length} files during session`);
    }
    if (input.gitDiffStat && input.gitDiffStat.trim()) {
      observedActivity.push(`Diff: ${input.gitDiffStat.trim()}`);
    } else {
      observedActivity.push("Working tree edits captured in git snapshot");
    }

    // 3. Failed Attempts / Errors
    const failedAttempts = input.recentToolErrors.slice(-3).map(err => {
      const clean = err.trim();
      return clean.length > 180 ? clean.slice(0, 177) + "..." : clean;
    });

    // 4. Current Blocker or Active State
    let currentBlockerOrActiveState = "Active development in progress";
    if (input.recentToolErrors.length > 0) {
      const lastErr = input.recentToolErrors[input.recentToolErrors.length - 1].trim();
      currentBlockerOrActiveState = `Active roadblock: ${lastErr.length > 160 ? lastErr.slice(0, 157) + "..." : lastErr}`;
    } else if (input.lastAssistantResponse) {
      const cleanResp = input.lastAssistantResponse.trim().split("\n")[0];
      if (cleanResp.length > 5) {
        currentBlockerOrActiveState = `Last assistant state: ${cleanResp.length > 140 ? cleanResp.slice(0, 137) + "..." : cleanResp}`;
      }
    }

    // 5. Critical Files
    const criticalFiles = Array.from(new Set(input.modifiedFilesList));

    // 6. Next Action
    const suggestedNextAction = input.recentToolErrors.length > 0
      ? "Resolve current error and continue implementation"
      : "Review recent changes and resume task";

    // 7. Primed Resume Prompt
    const promptLines: string[] = [
      `You are resuming an in-flight development session.`,
      `Objective: ${objective}`,
      `Critical Files: ${criticalFiles.length > 0 ? criticalFiles.join(", ") : "See working tree changes"}`
    ];

    if (input.recentToolErrors.length > 0) {
      promptLines.push(`Current Error: ${input.recentToolErrors[input.recentToolErrors.length - 1]}`);
    }

    if (input.recentUserPrompts.length > 0) {
      promptLines.push(`Recent instructions:`);
      for (const p of input.recentUserPrompts.slice(-3)) {
        promptLines.push(`- ${p.trim()}`);
      }
    }

    promptLines.push(`Please inspect these files and continue from where we left off.`);

    const primedResumePrompt = promptLines.join("\n");

    return {
      objective,
      completedMilestones: [], // Kept empty unless explicitly confirmed
      observedActivity,
      failedAttempts,
      currentBlockerOrActiveState,
      criticalFiles,
      importantDecisions: [],
      environmentConstraints: [],
      suggestedNextAction,
      primedResumePrompt,
      confidence: {
        objective: input.sessionTitle ? "high" : "medium",
        currentState: input.recentToolErrors.length > 0 ? "high" : "medium"
      }
    };
  }
}
