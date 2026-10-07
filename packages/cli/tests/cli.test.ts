/**
 * AgentDrop - Standalone CLI Integration Tests
 * Authoritative Plan: Section 43
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import path from "node:path";

describe("AgentDrop CLI (beam & listen)", () => {
  const cliBin = path.resolve("./bin/agentdrop.js");

  it("should display version on --version or -v", async () => {
    const proc = spawn(process.execPath, [cliBin, "--version"]);
    let stdout = "";
    proc.stdout.on("data", chunk => (stdout += chunk));
    await new Promise(resolve => proc.on("close", resolve));
    assert.ok(stdout.includes("agentdrop-portability-cli v1.0.4"));

    const procV = spawn(process.execPath, [cliBin, "-v"]);
    let stdoutV = "";
    procV.stdout.on("data", chunk => (stdoutV += chunk));
    await new Promise(resolve => procV.on("close", resolve));
    assert.ok(stdoutV.includes("agentdrop-portability-cli v1.0.4"));
  });

  it("should display usage on --help", async () => {
    const proc = spawn(process.execPath, [cliBin, "--help"]);
    let stdout = "";
    proc.stdout.on("data", chunk => (stdout += chunk));

    await new Promise(resolve => proc.on("close", resolve));

    assert.ok(stdout.includes("AgentDrop — AI Context Portability Layer"));
    assert.ok(stdout.includes("agentdrop beam"));
    assert.ok(stdout.includes("agentdrop listen"));
  });

  it("should list discovered sessions", async () => {
    const proc = spawn(process.execPath, [cliBin, "sessions"]);
    let stdout = "";
    proc.stdout.on("data", chunk => (stdout += chunk));

    await new Promise(resolve => proc.on("close", resolve));

    assert.ok(stdout.includes("Installed Agents:"));
    assert.ok(stdout.includes("Google Antigravity"));
  });

  it("should beam golden fixture and receive it via listen command", async () => {
    // 1. Spawn sender: agentdrop beam --demo
    const beamProc = spawn(process.execPath, [cliBin, "beam", "--demo"]);

    let beamStdout = "";
    let token = "";

    await new Promise<void>((resolve, reject) => {
      beamProc.stdout.on("data", chunk => {
        const text = chunk.toString();
        beamStdout += text;

        // Look for the base64 pairing payload
        const match = beamStdout.match(/PAIRING PAYLOAD \(For Machine B\):\s*\r?\n\s*([A-Za-z0-9+/=]+)/);
        if (match && match[1] && !token) {
          token = match[1].trim();
          resolve();
        }
      });

      beamProc.stderr.on("data", chunk => {
        console.error("beam stderr:", chunk.toString());
      });

      beamProc.on("error", reject);
    });

    assert.ok(token.length > 20, "Failed to capture pairing token from beam output");

    // 2. Spawn receiver: agentdrop listen <token>
    const listenProc = spawn(process.execPath, [cliBin, "listen", token]);
    let listenStdout = "";

    listenProc.stdout.on("data", chunk => {
      listenStdout += chunk.toString();
    });

    await new Promise(resolve => listenProc.on("close", resolve));
    await new Promise(resolve => beamProc.on("close", resolve));

    // 3. Verify that Handover Card was received and printed
    assert.ok(listenStdout.includes("AI HANDOVER CARD RECEIVED"), "Handover card not received");
    assert.ok(listenStdout.includes("Fix refresh-token race condition"), "Objective not found in handover");
    assert.ok(listenStdout.includes("PRIMED RESUME PROMPT"), "Primed resume prompt not rendered");
  });

  it("should save golden demo fixture into .agentdrop/ and inspect via status command", async () => {
    const saveProc = spawn(process.execPath, [cliBin, "save", "--demo"]);
    let saveStdout = "";
    saveProc.stdout.on("data", chunk => (saveStdout += chunk));
    await new Promise(resolve => saveProc.on("close", resolve));

    assert.ok(saveStdout.includes("AI CONTEXT HANDOFF SAVED"), "Save command failed");
    assert.ok(saveStdout.includes(".agentdrop/HANDOVER.md"), "Markdown path missing");

    const statusProc = spawn(process.execPath, [cliBin, "status"]);
    let statusStdout = "";
    statusProc.stdout.on("data", chunk => (statusStdout += chunk));
    await new Promise(resolve => statusProc.on("close", resolve));

    assert.ok(statusStdout.includes("ACTIVE AI HANDOVER FOUND FOR THIS REPOSITORY"), "Status failed to find handover");
    assert.ok(statusStdout.includes("Fix refresh-token race condition"), "Objective missing in status");
    assert.ok(statusStdout.includes("PRIMED RESUME PROMPT"), "Prompt missing in status");
  });

  it("should initialize project via 'init' command", async () => {
    const initProc = spawn(process.execPath, [cliBin, "init"]);
    let initStdout = "";
    initProc.stdout.on("data", chunk => (initStdout += chunk));
    await new Promise(resolve => initProc.on("close", resolve));

    assert.ok(initStdout.includes("Project Initialized Successfully"), "Init banner missing");
    assert.ok(initStdout.includes(".agentdrop/"), "Context dir missing in init output");
  });

  it("should install and uninstall hooks via 'hook' command", async () => {
    const hookInstallProc = spawn(process.execPath, [cliBin, "hook", "install"]);
    let hookStdout = "";
    hookInstallProc.stdout.on("data", chunk => (hookStdout += chunk));
    await new Promise(resolve => hookInstallProc.on("close", resolve));

    assert.ok(hookStdout.includes("Installed Git lifecycle hooks") || hookStdout.includes("hooks in .git/hooks/"), "Hook install output missing");

    const hookUninstallProc = spawn(process.execPath, [cliBin, "hook", "uninstall"]);
    let unhookStdout = "";
    hookUninstallProc.stdout.on("data", chunk => (unhookStdout += chunk));
    await new Promise(resolve => hookUninstallProc.on("close", resolve));

    assert.ok(unhookStdout.includes("uninstalled"), "Hook uninstall output missing");
  });
});

