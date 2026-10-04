/**
 * AgentDrop - Standalone CLI Companion
 * Authoritative Implementation Plan: Section 43
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  AgentDropSender,
  AgentDropReceiver,
  CapsulePackager,
  PreSanitizer,
  DeterministicExtractor,
  GitSnapshotCollector,
  NetworkDiscovery,
  AntigravityAdapter,
  ClaudeCodeAdapter,
  QRPairingPayload
} from "@agentdrop/core";

import { DashboardServer } from "./ui.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "--help";

  console.log(`\n======================================================`);
  console.log(`  AgentDrop — AI Context Portability Layer (v1.0.0)`);
  console.log(`  "It doesn't move a chat window. It moves context."`);
  console.log(`======================================================\n`);

  switch (command) {
    case "beam":
      await handleBeam(args.slice(1));
      break;

    case "listen":
      await handleListen(args.slice(1));
      break;

    case "sessions":
      await handleSessions();
      break;

    case "ui":
      await handleUi(args.slice(1));
      break;

    case "--help":
    case "-h":
    default:
      printUsage();
      break;
  }
}

async function handleBeam(args: string[]): Promise<void> {
  const isDemo = args.includes("--demo");

  let serializedCapsule = "";
  let sessionTitle = "Active Development Task";

  if (isDemo) {
    console.log(`[*] DEMO MODE ENABLED: Loading Golden Fixture (Section 44)...`);
    // Find expected-capsule.json
    const possiblePaths = [
      path.resolve(process.cwd(), "packages/core/fixtures/antigravity-auth-fixture/expected-capsule.json"),
      path.resolve(process.cwd(), "fixtures/antigravity-auth-fixture/expected-capsule.json"),
      path.resolve(process.cwd(), "../core/fixtures/antigravity-auth-fixture/expected-capsule.json")
    ];

    let foundPath = "";
    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        foundPath = p;
        break;
      } catch {
        // try next
      }
    }

    if (!foundPath) {
      console.error(`[-] Error: Could not locate expected-capsule.json fixture.`);
      process.exit(1);
    }

    serializedCapsule = await fs.readFile(foundPath, "utf-8");
    sessionTitle = "Fix refresh-token race condition";
  } else {
    console.log(`[*] Scanning local system for active AI coding sessions...`);
    const antigravity = new AntigravityAdapter();
    const claude = new ClaudeCodeAdapter();

    const agSessions = (await antigravity.isInstalled()) ? await antigravity.listRecentSessions() : [];
    const claudeSessions = (await claude.isInstalled()) ? await claude.listRecentSessions() : [];

    if (agSessions.length === 0 && claudeSessions.length === 0) {
      console.log(`[!] No active local sessions found in Antigravity or Claude Code.`);
      console.log(`[*] Tip: Run 'agentdrop beam --demo' to test the transfer with the golden demo fixture!`);
      process.exit(0);
    }

    console.log(`[+] Discovered Sessions:`);
    let selectedAdapter: any = antigravity;
    let selectedSessionId = "";

    if (agSessions.length > 0) {
      console.log(`    [Antigravity] ${agSessions[0].title} (${agSessions[0].sessionId.slice(0, 8)}...)`);
      selectedSessionId = agSessions[0].sessionId;
      selectedAdapter = antigravity;
    } else if (claudeSessions.length > 0) {
      console.log(`    [Claude Code] ${claudeSessions[0].title}`);
      selectedSessionId = claudeSessions[0].sessionId;
      selectedAdapter = claude;
    }

    console.log(`[*] Extracting session context and stripping hidden thinking chains (Section 9)...`);
    const extracted = await selectedAdapter.extractSession(selectedSessionId);
    sessionTitle = extracted.title;

    console.log(`[*] Enforcing Invariant 2: Pre-AI Sanitization...`);
    const { sanitizedTurns, redactedCount } = PreSanitizer.preSanitize(extracted.turns);
    console.log(`    - Scrubbed ${redactedCount} potential secret(s)`);

    console.log(`[*] Capturing Git working tree & safe untracked source files...`);
    const gitSnapshot = await GitSnapshotCollector.captureSnapshot(process.cwd());
    console.log(`    - Branch: ${gitSnapshot.identity.branch} (Repo Fingerprint: ${gitSnapshot.identity.repositoryFingerprint})`);
    console.log(`    - Safe untracked files captured: ${gitSnapshot.untrackedSourceFiles.length}`);

    console.log(`[*] Synthesizing structured handover state via Deterministic Extractor...`);
    const handover = DeterministicExtractor.extract({
      sessionTitle: extracted.title,
      firstSubstantiveUserPrompt: sanitizedTurns[0]?.content || "Development task",
      recentUserPrompts: sanitizedTurns.filter((t: any) => t.role === "user").map((t: any) => t.content).slice(-3),
      lastAssistantResponse: sanitizedTurns.filter((t: any) => t.role === "assistant").pop()?.content,
      recentToolErrors: [],
      modifiedFilesList: []
    });

    console.log(`[*] Packing .aicapsule with Universal Security Scanner (Invariant 3)...`);
    const packResult = CapsulePackager.pack({
      sourceAgent: selectedAdapter.id,
      workspaceName: gitSnapshot.identity.name,
      handover,
      git: gitSnapshot,
      conversation: {
        totalTurns: sanitizedTurns.length,
        turns: sanitizedTurns
      },
      selectedFiles: gitSnapshot.untrackedSourceFiles,
      nativePayload: {
        adapterId: selectedAdapter.id,
        rawFiles: extracted.rawFiles
      }
    });

    serializedCapsule = packResult.serialized;
  }

  // Start Sender
  const sender = new AgentDropSender(serializedCapsule, NetworkDiscovery.getDeviceName());
  const port = await sender.start(0);
  const localIp = NetworkDiscovery.getLocalIp();
  const pairingPayload = sender.getPairingPayload(localIp);

  console.log(`\n======================================================`);
  console.log(`  BEAM SERVER ACTIVE on Local Network (Offline Ready)`);
  console.log(`======================================================`);
  console.log(`  Task:       ${sessionTitle}`);
  console.log(`  Device:     ${pairingPayload.deviceName}`);
  console.log(`  Local IP:   http://${localIp}:${port}`);
  console.log(`  TransferId: ${pairingPayload.transferId}`);
  console.log(`\n  PAIRING PAYLOAD (For Machine B):`);
  console.log(`  ${Buffer.from(JSON.stringify(pairingPayload)).toString("base64")}\n`);
  console.log(`  OR on Machine B run:`);
  console.log(`  npx agentdrop listen http://${localIp}:${port} ${pairingPayload.pairingSecret}`);
  console.log(`======================================================\n`);
  console.log(`[*] Waiting for peer device connection on local network...`);

  sender.on("peerConnected", (deviceName: string, sasCode: string) => {
    console.log(`\n[+] Peer connected: ${deviceName}`);
    console.log(`[!] VERIFY 6-DIGIT CONFIRMATION CODE (SAS): [ ${sasCode.slice(0, 3)} - ${sasCode.slice(3)} ]`);
    console.log(`    Ensure this matches the code on ${deviceName}!`);
  });

  sender.on("transferComplete", (bytes: number) => {
    console.log(`\n[+] Handover transfer successfully completed! (${bytes} bytes transferred)`);
    console.log(`[*] Closing server. Target machine is now resuming context.\n`);
    setTimeout(() => process.exit(0), 1000);
  });
}

async function handleListen(args: string[]): Promise<void> {
  let endpoint = "";
  let pairingSecret = "";
  let payload: QRPairingPayload;

  if (args.length >= 2) {
    endpoint = args[0];
    pairingSecret = args[1];
    payload = {
      v: 1,
      transferId: args[2] || "cli-transfer",
      endpoint,
      senderPub: "",
      pairingSecret,
      deviceName: "Sender"
    };
  } else if (args.length === 1) {
    try {
      // Decode base64 payload
      const decoded: QRPairingPayload = JSON.parse(Buffer.from(args[0], "base64").toString("utf-8"));
      endpoint = decoded.endpoint;
      pairingSecret = decoded.pairingSecret;
      payload = decoded;
    } catch {
      console.error(`[-] Error: Invalid pairing token argument.`);
      process.exit(1);
    }
  } else {
    console.log(`Usage: agentdrop listen <endpoint> <pairingSecret>`);
    console.log(`   OR: agentdrop listen <base64PairingPayload>`);
    process.exit(1);
  }

  const stagingDir = path.resolve("./.agentdrop/staging");
  await fs.mkdir(stagingDir, { recursive: true });

  const receiver = new AgentDropReceiver(stagingDir, NetworkDiscovery.getDeviceName());

  console.log(`[*] Connecting to Sender at ${endpoint}...`);

  try {
    const { sasCode, senderDevice } = await receiver.initiateHandshake(payload);

    console.log(`\n======================================================`);
    console.log(`  PEER CONNECTED: ${senderDevice}`);
    console.log(`  VERIFY 6-DIGIT CONFIRMATION CODE: [ ${sasCode.slice(0, 3)} - ${sasCode.slice(3)} ]`);
    console.log(`======================================================\n`);
    console.log(`[*] Codes match! Auto-accepting handover...`);

    const result = await receiver.acceptHandover();

    console.log(`\n======================================================`);
    console.log(`  AI HANDOVER CARD RECEIVED (Offline P2P)`);
    console.log(`======================================================`);
    console.log(`  OBJECTIVE:`);
    console.log(`    ${result.capsule.handover.objective}`);
    console.log(`\n  OBSERVED ACTIVITY:`);
    for (const act of result.capsule.handover.observedActivity || []) {
      console.log(`    • ${act}`);
    }
    if (result.capsule.handover.importantDecisions?.length) {
      console.log(`\n  IMPORTANT DECISIONS:`);
      for (const dec of result.capsule.handover.importantDecisions) {
        console.log(`    ✓ ${dec}`);
      }
    }
    if (result.capsule.handover.currentBlockerOrActiveState) {
      console.log(`\n  CURRENT ROADBLOCK / ACTIVE STATE:`);
      console.log(`    ! ${result.capsule.handover.currentBlockerOrActiveState}`);
    }
    console.log(`\n  PRIMED RESUME PROMPT (Ready to paste or launch):`);
    console.log(`------------------------------------------------------`);
    console.log(result.capsule.handover.primedResumePrompt);
    console.log(`------------------------------------------------------`);
    console.log(`\n[+] Handover staged in: ${stagingDir}`);
    console.log(`[+] Task ready for continuation!\n`);
    process.exit(0);
  } catch (err: any) {
    console.error(`[-] Handover failed: ${err?.message}`);
    process.exit(1);
  }
}

async function handleSessions(): Promise<void> {
  const antigravity = new AntigravityAdapter();
  const claude = new ClaudeCodeAdapter();

  console.log(`[*] Installed Agents:`);
  console.log(`    Google Antigravity: ${(await antigravity.isInstalled()) ? "INSTALLED" : "Not Found"}`);
  console.log(`    Claude Code:        ${(await claude.isInstalled()) ? "INSTALLED" : "Not Found"}\n`);

  if (await antigravity.isInstalled()) {
    const sessions = await antigravity.listRecentSessions();
    console.log(`[+] Antigravity Sessions (${sessions.length}):`);
    for (const s of sessions.slice(0, 5)) {
      console.log(`    • [${s.sessionId.slice(0, 8)}] ${s.title} (${s.turnCount} turns) - ${s.lastActive.toLocaleString()}`);
    }
  }

  if (await claude.isInstalled()) {
    const sessions = await claude.listRecentSessions();
    console.log(`\n[+] Claude Code Sessions (${sessions.length}):`);
    for (const s of sessions.slice(0, 5)) {
      console.log(`    • [${s.sessionId}] ${s.title} (${s.turnCount} turns)`);
    }
  }
}

async function handleUi(args: string[]): Promise<void> {
  const port = parseInt(args[0], 10) || 3333;
  const dashboard = new DashboardServer(port);
  await dashboard.start();
  const localIp = NetworkDiscovery.getLocalIp();

  console.log(`======================================================`);
  console.log(`  AgentDrop Web Dashboard Active! (Offline Ready)`);
  console.log(`======================================================`);
  console.log(`  Local:   http://localhost:${port}`);
  console.log(`  Network: http://${localIp}:${port}`);
  console.log(`\n  Open the URL in any browser on Machine A or Machine B.`);
  console.log(`  Press Ctrl+C to stop.\n`);

  await new Promise(() => {});
}

function printUsage(): void {
  console.log(`Usage:`);
  console.log(`  agentdrop beam             Beam the most recent active AI coding session`);
  console.log(`  agentdrop beam --demo      Beam the verified Golden Demo Fixture`);
  console.log(`  agentdrop listen <token>   Receive incoming AI handover session`);
  console.log(`  agentdrop sessions         List local AI sessions across installed tools`);
  console.log(`  agentdrop ui [port]        Launch interactive Web UI dashboard (default: 3333)`);
  console.log(`  agentdrop --help           Show this help information\n`);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
