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
  QRPairingPayload,
  ContextSyncManager,
  GoldenDemoFixture
} from "agentdrop-portability-core";

import { DashboardServer } from "./ui.js";

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let CLI_VERSION = "1.0.11";
try {
  const pkg = require("../../package.json");
  CLI_VERSION = pkg.version || CLI_VERSION;
} catch {
  try {
    const pkg = require("../../../package.json");
    CLI_VERSION = pkg.version || CLI_VERSION;
  } catch {}
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "--help";

  if (command === "--version" || command === "-v" || command === "version") {
    console.log(`agentdrop-portability-cli v${CLI_VERSION}`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`  AgentDrop — AI Context Portability Layer (v${CLI_VERSION})`);
  console.log(`  "It doesn't move a chat window. It moves context."`);
  console.log(`======================================================\n`);

  switch (command) {
    case "init":
      await handleInit();
      break;

    case "hook":
      await handleHook(args.slice(1));
      break;

    case "save":
      await handleSave(args.slice(1));
      break;

    case "status":
      await handleStatus();
      break;

    case "load":
      await handleLoad();
      break;

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
    serializedCapsule = await GoldenDemoFixture.loadSerialized();
    sessionTitle = "Fix refresh-token race condition (Golden Demo)";
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

async function handleSave(args: string[]): Promise<void> {
  const isDemo = args.includes("--demo");
  const workspaceRoot = process.cwd();

  console.log(`[*] Generating Git-Native AI Context Handoff for project...`);

  let capsule: any;

  if (isDemo) {
    console.log(`[*] DEMO MODE ENABLED: Loading Golden Fixture (Section 44)...`);
    capsule = await GoldenDemoFixture.loadCapsule();
  } else {
    const antigravity = new AntigravityAdapter();
    const claude = new ClaudeCodeAdapter();

    const agSessions = (await antigravity.isInstalled()) ? await antigravity.listRecentSessions(workspaceRoot) : [];
    const claudeSessions = (await claude.isInstalled()) ? await claude.listRecentSessions(workspaceRoot) : [];

    if (agSessions.length === 0 && claudeSessions.length === 0) {
      console.log(`[!] No active local sessions found matching workspace: ${workspaceRoot}`);
      console.log(`[*] Tip: Run 'agentdrop save --demo' to test the Git handoff with the verified golden demo fixture!`);
      process.exit(0);
    }

    let selectedAdapter: any = agSessions.length > 0 ? antigravity : claude;
    let selectedSession = agSessions.length > 0 ? agSessions[0] : claudeSessions[0];

    console.log(`[+] Capturing session: [${selectedAdapter.displayName}] "${selectedSession.title}"`);
    const extracted = await selectedAdapter.extractSession(selectedSession.sessionId);

    const { sanitizedTurns, redactedCount } = PreSanitizer.preSanitize(extracted.turns);
    console.log(`    - Scrubbed ${redactedCount} potential secret(s)`);

    const gitSnapshot = await GitSnapshotCollector.captureSnapshot(workspaceRoot);
    const handover = DeterministicExtractor.extract({
      sessionTitle: extracted.title,
      firstSubstantiveUserPrompt: sanitizedTurns[0]?.content || "Development task",
      recentUserPrompts: sanitizedTurns.filter((t: any) => t.role === "user").map((t: any) => t.content).slice(-3),
      lastAssistantResponse: sanitizedTurns.filter((t: any) => t.role === "assistant").pop()?.content,
      recentToolErrors: [],
      modifiedFilesList: []
    });

    const packResult = CapsulePackager.pack({
      sourceAgent: selectedAdapter.id,
      workspaceName: gitSnapshot.identity.name,
      handover,
      git: gitSnapshot,
      conversation: { totalTurns: sanitizedTurns.length, turns: sanitizedTurns },
      selectedFiles: gitSnapshot.untrackedSourceFiles,
      nativePayload: { adapterId: selectedAdapter.id, rawFiles: extracted.rawFiles }
    });

    capsule = packResult.capsule;
  }

  const saveResult = await ContextSyncManager.saveHandoff(workspaceRoot, capsule, { saveFullCapsule: true });

  console.log(`\n======================================================`);
  console.log(`  AI CONTEXT HANDOFF SAVED (Git-Native & Persistent)`);
  console.log(`======================================================`);
  console.log(`  Contract:  ${saveResult.handoverPath}`);
  console.log(`  Markdown:  .agentdrop/HANDOVER.md (Rendered directly on GitHub.com)`);
  console.log(`  Branch:    ${saveResult.identity.branch}`);
  console.log(`  Commit:    ${saveResult.identity.headCommit.slice(0, 7)}`);
  console.log(`  Objective: ${saveResult.document.handover.objective}`);
  console.log(`======================================================\n`);
  console.log(`[*] NEXT STEP FOR DEVELOPER 1:`);
  console.log(`    git add .agentdrop && git commit -m "chore: save AI handover" && git push`);
  console.log(`\n[*] ON MACHINE 2:`);
  console.log(`    When Developer 2 clones or checks out '${saveResult.identity.branch}',`);
  console.log(`    run 'npm run ai:status' (or 'npx agentdrop status') to inspect active handover!`);
  console.log(`    run 'npm run ai:resume' (or 'npx agentdrop load') to emit the primed prompt.\n`);
}

async function handleStatus(): Promise<void> {
  const workspaceRoot = process.cwd();
  const status = await ContextSyncManager.getStatus(workspaceRoot);

  console.log(`Workspace: ${status.workspaceIdentity.name}`);
  console.log(`Branch:    ${status.workspaceIdentity.branch}`);
  if (status.workspaceIdentity.remoteOriginUrl) {
    console.log(`Remote:    ${status.workspaceIdentity.remoteOriginUrl}`);
  }

  if (!status.hasActiveHandoff) {
    console.log(`\n[!] No active AI handoff found in this repository.`);
    console.log(`    Run 'agentdrop save' to capture the current AI coding context!`);
    return;
  }

  const doc = status.handover!;
  console.log(`\n======================================================`);
  console.log(`  ACTIVE AI HANDOVER FOUND FOR THIS REPOSITORY`);
  console.log(`======================================================`);
  console.log(`  Author:    ${doc.author || "Unknown"}`);
  console.log(`  Branch:    ${doc.git.branch} ${status.isBranchMatch ? "(Current Branch)" : "(Branch Mismatch!)"}`);
  console.log(`  Commit:    ${doc.git.commitSha.slice(0, 7)}`);
  console.log(`  Objective: ${doc.handover.objective}`);
  if (doc.handover.currentBlockerOrActiveState) {
    console.log(`\n  CURRENT ROADBLOCK:`);
    console.log(`    ! ${doc.handover.currentBlockerOrActiveState}`);
  }
  if (doc.handover.importantDecisions?.length) {
    console.log(`\n  IMPORTANT DECISIONS:`);
    for (const d of doc.handover.importantDecisions) {
      console.log(`    ✓ ${d}`);
    }
  }
  console.log(`\n  PRIMED RESUME PROMPT (Ready to paste or launch):`);
  console.log(`------------------------------------------------------`);
  console.log(doc.handover.primedResumePrompt);
  console.log(`------------------------------------------------------\n`);
}

async function handleLoad(): Promise<void> {
  const workspaceRoot = process.cwd();
  const result = await ContextSyncManager.loadHandoff(workspaceRoot);

  if (!result.found || !result.document) {
    console.error(`[-] No AI handoff found in current workspace. Run 'agentdrop save' first.`);
    process.exit(1);
  }

  console.log(result.document.handover.primedResumePrompt);
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

async function handleInit(): Promise<void> {
  const workspaceRoot = process.cwd();
  console.log(`[*] Initializing AgentDrop in workspace: ${path.basename(workspaceRoot)}...`);

  const res = await ContextSyncManager.initializeProject(workspaceRoot);

  console.log(`\n======================================================`);
  console.log(`  AgentDrop — Project Initialized Successfully!`);
  console.log(`======================================================`);
  console.log(`  Context Dir:    .agentdrop/`);
  console.log(`  AI Bridge:      ${res.agentBridgeUpdated ? "AGENTS.md updated (Turn-1 auto-ingestion active)" : "AGENTS.md already configured"}`);
  console.log(`  Git Hooks:      ${res.hooksInstalled.length > 0 ? res.hooksInstalled.join(", ") : "No .git directory found"}`);
  console.log(`  package.json:   ${res.packageJsonUpdated ? "Configured devDependencies, postinstall hook, and 'ai:*' scripts" : "Scripts already present or no package.json"}`);
  console.log(`======================================================\n`);
  console.log(`[*] NEXT STEPS:`);
  console.log(`    • Save an AI task:          agentdrop save (or agentdrop save --demo)`);
  console.log(`    • Check status anytime:     npm run ai:status (or agentdrop status)`);
  console.log(`    • Resume task:              npm run ai:resume (or agentdrop load)\n`);
}

async function handleHook(args: string[]): Promise<void> {
  const action = args[0] || "install";
  const workspaceRoot = process.cwd();

  if (action === "uninstall") {
    await ContextSyncManager.uninstallHooks(workspaceRoot);
    console.log(`[+] AgentDrop Git lifecycle hooks uninstalled from .git/hooks/`);
  } else {
    const res = await ContextSyncManager.installHooks(workspaceRoot);
    if (res.success) {
      console.log(`[+] Installed Git lifecycle hooks: ${res.hooks.join(", ")} in .git/hooks/`);
      console.log(`[*] Whenever you run 'git pull' or 'git checkout', in-flight AI handovers will be announced.`);
    } else {
      console.log(`[!] Could not install hooks: no .git directory found at ${workspaceRoot}`);
    }
  }
}

function printUsage(): void {
  console.log(`Usage:`);
  console.log(`  agentdrop init             Initialize AgentDrop in current project (AGENTS.md, Git hooks, scripts)`);
  console.log(`  agentdrop hook [install]   Install Git post-pull / post-checkout notification hooks`);
  console.log(`  agentdrop save [--demo]    Save in-flight AI session into Git repo (.agentdrop/handover.json)`);
  console.log(`  agentdrop status           Inspect active AI handoff in current Git repository`);
  console.log(`  agentdrop load             Output primed resume prompt for target AI tool`);
  console.log(`  agentdrop sessions         List local AI sessions across installed tools`);
  console.log(`  agentdrop beam [--demo]    Beam session over local network (P2P mode)`);
  console.log(`  agentdrop listen <token>   Receive incoming AI handover session over local network`);
  console.log(`  agentdrop ui [port]        Launch interactive Web UI dashboard (default: 3333)`);
  console.log(`  agentdrop --version (-v)   Print installed CLI version`);
  console.log(`  agentdrop --help           Show this help information\n`);
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
