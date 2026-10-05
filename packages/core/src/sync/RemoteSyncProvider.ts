/**
 * AgentDrop - Remote / Gist Context Sync Provider
 * Allows zero-working-tree context persistence indexed by Git remote + branch
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AiCapsule, WorkspaceIdentity } from "../capsule/schema.js";

export class RemoteSyncProvider {
  private static getGlobalCacheDir(): string {
    return path.join(os.homedir(), ".agentdrop", "cloud-cache");
  }

  /**
   * Saves capsule to the global context cache indexed by contextKey (repo:branch hash).
   */
  public static async save(capsule: AiCapsule, identity: WorkspaceIdentity): Promise<{ success: boolean; contextKey: string }> {
    try {
      const cacheDir = this.getGlobalCacheDir();
      await fs.mkdir(cacheDir, { recursive: true });

      const contextKey = identity.contextKey || "default-context";
      const filePath = path.join(cacheDir, `${contextKey}.json`);

      await fs.writeFile(filePath, JSON.stringify(capsule, null, 2), "utf-8");
      return { success: true, contextKey };
    } catch {
      return { success: false, contextKey: "" };
    }
  }

  /**
   * Loads capsule from the global context cache using the workspace contextKey.
   */
  public static async load(identity: WorkspaceIdentity): Promise<AiCapsule | null> {
    try {
      const contextKey = identity.contextKey || "default-context";
      const filePath = path.join(this.getGlobalCacheDir(), `${contextKey}.json`);

      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
