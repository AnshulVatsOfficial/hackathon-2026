/**
 * AgentDrop - Unified Context Sync Manager
 * Orchestrates Git-native in-repo handoffs and remote sync
 */

import { AiCapsule } from "../capsule/schema.js";
import { GitIdentity } from "../git/identity.js";
import { GitRepoProvider } from "./GitRepoProvider.js";
import { RemoteSyncProvider } from "./RemoteSyncProvider.js";
import { SaveHandoffOptions, SaveHandoffResult, LoadHandoffResult, SyncStatusResult } from "./SyncTypes.js";

export class ContextSyncManager {
  /**
   * Saves active AI context to Git repository (.agentdrop/handover.json & HANDOVER.md)
   * so it automatically travels with git push to GitHub!
   */
  public static async saveHandoff(
    workspacePath: string,
    capsule: AiCapsule,
    options: SaveHandoffOptions = {}
  ): Promise<SaveHandoffResult> {
    const gitResult = await GitRepoProvider.saveHandoff(workspacePath, capsule, options);
    // Also update remote/global cache
    await RemoteSyncProvider.save(capsule, gitResult.identity);
    return gitResult;
  }

  /**
   * Automatically discovers and loads AI context when a developer opens a cloned repository.
   * Priority: 1. Git-native in-repo (.agentdrop/handover.json) -> 2. Remote/Gist sync key
   */
  public static async loadHandoff(workspacePath: string): Promise<LoadHandoffResult> {
    // 1. Try Git in-repo handoff
    const gitLoad = await GitRepoProvider.loadHandoff(workspacePath);
    if (gitLoad.found) {
      return gitLoad;
    }

    // 2. Fallback to remote context cache using repo+branch contextKey
    const identity = await GitIdentity.getWorkspaceIdentity(workspacePath);
    const remoteCapsule = await RemoteSyncProvider.load(identity);
    if (remoteCapsule) {
      return {
        found: true,
        capsule: remoteCapsule,
        document: {
          version: "1.0.0",
          capsuleId: remoteCapsule.manifest.capsuleId,
          createdAt: remoteCapsule.manifest.createdAt,
          sourceAgent: remoteCapsule.manifest.source.agent,
          git: {
            branch: identity.branch,
            commitSha: identity.headCommit,
            contextKey: identity.contextKey || "default"
          },
          handover: remoteCapsule.handover,
          securitySummary: remoteCapsule.securitySummary
        },
        isBranchMatch: true,
        currentBranch: identity.branch,
        handoverBranch: identity.branch,
        commitSha: identity.headCommit
      };
    }

    return {
      found: false,
      currentBranch: identity.branch,
      isBranchMatch: false
    };
  }

  /**
   * Returns current sync and handoff status for the workspace.
   */
  public static async getStatus(workspacePath: string): Promise<SyncStatusResult> {
    const identity = await GitIdentity.getWorkspaceIdentity(workspacePath);
    const loadResult = await this.loadHandoff(workspacePath);

    return {
      hasActiveHandoff: loadResult.found,
      workspaceIdentity: identity,
      handover: loadResult.document,
      isBranchMatch: loadResult.isBranchMatch
    };
  }
}
