/**
 * AgentDrop - Golden Demo Fixture Loader
 * Authoritative Implementation Plan: Section 44
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AiCapsule } from "./schema.js";

export class GoldenDemoFixture {
  private static cachedSerialized?: string;

  /**
   * Resolves and loads the serialized expected-capsule.json golden fixture string.
   */
  public static async loadSerialized(): Promise<string> {
    if (this.cachedSerialized) {
      return this.cachedSerialized;
    }

    const currentDir = path.dirname(fileURLToPath(import.meta.url));

    const possiblePaths = [
      path.resolve(currentDir, "../../../fixtures/antigravity-auth-fixture/expected-capsule.json"),
      path.resolve(currentDir, "../../fixtures/antigravity-auth-fixture/expected-capsule.json"),
      path.resolve(currentDir, "../fixtures/antigravity-auth-fixture/expected-capsule.json"),
      path.resolve(process.cwd(), "packages/core/fixtures/antigravity-auth-fixture/expected-capsule.json"),
      path.resolve(process.cwd(), "fixtures/antigravity-auth-fixture/expected-capsule.json"),
      path.resolve(process.cwd(), "../core/fixtures/antigravity-auth-fixture/expected-capsule.json")
    ];

    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        const content = await fs.readFile(p, "utf-8");
        this.cachedSerialized = content;
        return content;
      } catch {
        // try next
      }
    }

    throw new Error(
      `Could not locate golden demo fixture 'expected-capsule.json'. Checked paths:\n${possiblePaths.join("\n")}`
    );
  }

  /**
   * Loads and parses the golden fixture into an AiCapsule object.
   */
  public static async loadCapsule(): Promise<AiCapsule> {
    const raw = await this.loadSerialized();
    return JSON.parse(raw);
  }
}
