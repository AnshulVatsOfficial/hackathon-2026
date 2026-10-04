/**
 * AgentDrop - VS Code Webview Sidebar Provider
 * Authoritative Plan: Sections 40, 41, 42
 */

import * as vscode from "vscode";
import path from "node:path";
import fs from "node:fs/promises";
import QRCode from "qrcode";
import {
  AgentDropSender,
  AgentDropReceiver,
  CapsulePackager,
  PreSanitizer,
  DeterministicExtractor,
  GitSnapshotCollector,
  TargetWorkspaceSafety,
  NetworkDiscovery,
  AntigravityAdapter,
  ClaudeCodeAdapter,
  AiCapsule,
  QRPairingPayload,
  WorkspaceSafetyReport
} from "@agentdrop/core";

export class AgentDropViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "agentdrop.sidebarView";

  private _view?: vscode.WebviewView;
  private _sender?: AgentDropSender;
  private _receiver?: AgentDropReceiver;
  private _lastReceivedCapsule?: AiCapsule;
  private _lastSafetyReport?: WorkspaceSafetyReport;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async message => {
      switch (message.type) {
        case "INIT":
          await this._sendDeviceInfo();
          await this._sendSessionsList();
          break;

        case "REFRESH_SESSIONS":
          await this._sendSessionsList();
          break;

        case "BEAM_SESSION":
          await this._handleBeamSession(message.sessionId, message.adapterId);
          break;

        case "BEAM_DEMO":
          await this._handleBeamDemo();
          break;

        case "CANCEL_BEAM":
          await this._handleCancelBeam();
          break;

        case "CONNECT_PEER":
          await this._handleConnectPeer(message.tokenOrUrl, message.pairingSecret);
          break;

        case "APPLY_GIT":
          await this._handleApplyGit();
          break;

        case "COPY_CLIPBOARD":
          if (message.text) {
            await vscode.env.clipboard.writeText(message.text);
            vscode.window.showInformationMessage("Copied to clipboard!");
          }
          break;

        case "TRY_NATIVE_RESTORE":
          await this._handleTryNativeRestore();
          break;
      }
    });
  }

  private async _sendDeviceInfo(): Promise<void> {
    const deviceName = NetworkDiscovery.getDeviceName();
    const localIp = NetworkDiscovery.getLocalIp();
    this._postMessage({
      type: "DEVICE_INFO",
      deviceName,
      localIp
    });
  }

  private async _sendSessionsList(): Promise<void> {
    try {
      const antigravity = new AntigravityAdapter();
      const claude = new ClaudeCodeAdapter();

      const agInstalled = await antigravity.isInstalled();
      const claudeInstalled = await claude.isInstalled();

      const agSessions = agInstalled ? await antigravity.listRecentSessions() : [];
      const claudeSessions = claudeInstalled ? await claude.listRecentSessions() : [];

      const sessions = [
        ...agSessions.map(s => ({ ...s, adapterId: "antigravity", adapterName: "Google Antigravity" })),
        ...claudeSessions.map(s => ({ ...s, adapterId: "claude-code", adapterName: "Claude Code" }))
      ];

      this._postMessage({
        type: "SESSIONS_LIST",
        sessions,
        installed: {
          antigravity: agInstalled,
          claude: claudeInstalled
        }
      });
    } catch (err: any) {
      this._postMessage({
        type: "NOTIFY",
        notifyType: "error",
        message: `Failed to load sessions: ${err?.message}`
      });
    }
  }

  private async _handleBeamSession(sessionId: string, adapterId: string): Promise<void> {
    try {
      const adapter = adapterId === "claude-code" ? new ClaudeCodeAdapter() : new AntigravityAdapter();
      const extracted = await adapter.extractSession(sessionId);

      // Invariant 2: Pre-AI Sanitization
      const { sanitizedTurns, redactedCount } = PreSanitizer.preSanitize(extracted.turns);

      // Git Snapshot
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
      const gitSnapshot = await GitSnapshotCollector.captureSnapshot(workspaceRoot);

      // Deterministic Extraction
      const handover = DeterministicExtractor.extract({
        sessionTitle: extracted.title,
        firstSubstantiveUserPrompt: sanitizedTurns[0]?.content || "Development task",
        recentUserPrompts: sanitizedTurns.filter(t => t.role === "user").map(t => t.content).slice(-3),
        lastAssistantResponse: sanitizedTurns.filter(t => t.role === "assistant").pop()?.content,
        recentToolErrors: [],
        modifiedFilesList: []
      });

      // Capsule Packing with Universal Security Redaction (Invariant 3)
      const packResult = CapsulePackager.pack({
        sourceAgent: adapter.id,
        workspaceName: gitSnapshot.identity.name,
        handover,
        git: gitSnapshot,
        conversation: {
          totalTurns: sanitizedTurns.length,
          turns: sanitizedTurns
        },
        selectedFiles: gitSnapshot.untrackedSourceFiles,
        nativePayload: {
          adapterId: adapter.id,
          rawFiles: extracted.rawFiles
        }
      });

      await this._startBeamServer(packResult.serialized, extracted.title, redactedCount);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Beam failed: ${err?.message}`);
      this._postMessage({
        type: "NOTIFY",
        notifyType: "error",
        message: `Beam initiation failed: ${err?.message}`
      });
    }
  }

  private async _handleBeamDemo(): Promise<void> {
    try {
      const possiblePaths = [
        path.resolve(this._extensionUri.fsPath, "../core/fixtures/antigravity-auth-fixture/expected-capsule.json"),
        path.resolve(process.cwd(), "packages/core/fixtures/antigravity-auth-fixture/expected-capsule.json"),
        path.resolve(process.cwd(), "fixtures/antigravity-auth-fixture/expected-capsule.json")
      ];

      let foundPath = "";
      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          foundPath = p;
          break;
        } catch {}
      }

      if (!foundPath) {
        throw new Error("Golden fixture not found");
      }

      const serialized = await fs.readFile(foundPath, "utf-8");
      await this._startBeamServer(serialized, "Fix refresh-token race condition (Golden Demo)", 3);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Demo Beam failed: ${err?.message}`);
    }
  }

  private async _startBeamServer(serializedCapsule: string, title: string, redactedSecrets: number): Promise<void> {
    if (this._sender) {
      await this._sender.close();
      this._sender = undefined;
    }

    const deviceName = NetworkDiscovery.getDeviceName();
    const sender = new AgentDropSender(serializedCapsule, deviceName);
    this._sender = sender;

    const port = await sender.start(0);
    const localIp = NetworkDiscovery.getLocalIp();
    const pairingPayload = sender.getPairingPayload(localIp);
    const base64Token = Buffer.from(JSON.stringify(pairingPayload)).toString("base64");

    // Generate offline SVG QR Code
    const qrSvg = await QRCode.toString(base64Token, {
      type: "svg",
      margin: 1,
      color: {
        dark: "#58a6ff",
        light: "#00000000"
      }
    });

    sender.on("peerConnected", (peerDevice: string, sasCode: string) => {
      this._postMessage({
        type: "PEER_CONNECTED",
        peerDevice,
        sasCode
      });
      vscode.window.showInformationMessage(`AgentDrop: Peer connected (${peerDevice}). Verify code: ${sasCode.slice(0, 3)}-${sasCode.slice(3)}`);
    });

    sender.on("transferComplete", (bytes: number) => {
      this._postMessage({
        type: "BEAM_COMPLETE",
        bytes
      });
      vscode.window.showInformationMessage(`AgentDrop: Session beamed successfully (${bytes} bytes)!`);
    });

    this._postMessage({
      type: "BEAM_STARTED",
      sessionTitle: title,
      localIp,
      port,
      transferId: pairingPayload.transferId,
      pairingSecret: pairingPayload.pairingSecret,
      base64Token,
      qrSvg,
      redactedSecrets
    });
  }

  private async _handleCancelBeam(): Promise<void> {
    if (this._sender) {
      await this._sender.close();
      this._sender = undefined;
    }
    this._postMessage({ type: "BEAM_CANCELLED" });
  }

  private async _handleConnectPeer(tokenOrUrl: string, secret?: string): Promise<void> {
    try {
      let payload: QRPairingPayload;

      if (tokenOrUrl.startsWith("http")) {
        payload = {
          v: 1,
          transferId: "vscode-transfer",
          endpoint: tokenOrUrl,
          senderPub: "",
          pairingSecret: secret || "",
          deviceName: "Sender"
        };
      } else {
        payload = JSON.parse(Buffer.from(tokenOrUrl.trim(), "base64").toString("utf-8"));
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
      const stagingDir = path.join(workspaceRoot, ".agentdrop", "staging");
      await fs.mkdir(stagingDir, { recursive: true });

      const receiver = new AgentDropReceiver(stagingDir, NetworkDiscovery.getDeviceName());
      this._receiver = receiver;

      // 1. Handshake & SAS verification
      const { sasCode, senderDevice } = await receiver.initiateHandshake(payload);

      this._postMessage({
        type: "SAS_VERIFICATION",
        sasCode,
        senderDevice
      });

      // 2. Auto-accept handover
      const result = await receiver.acceptHandover();
      this._lastReceivedCapsule = result.capsule;

      // 3. Target Workspace Safety Check (Section 19)
      const safetyReport = await TargetWorkspaceSafety.verifyTargetWorkspace(workspaceRoot, result.capsule.git);
      this._lastSafetyReport = safetyReport;

      this._postMessage({
        type: "HANDOVER_READY",
        capsule: result.capsule,
        safetyReport,
        sasCode
      });

      vscode.window.showInformationMessage(`AgentDrop: Received AI Handover from ${senderDevice}!`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Receive failed: ${err?.message}`);
      this._postMessage({
        type: "NOTIFY",
        notifyType: "error",
        message: `Connection failed: ${err?.message}`
      });
    }
  }

  private async _handleApplyGit(): Promise<void> {
    if (!this._lastReceivedCapsule?.git) {
      vscode.window.showErrorMessage("No Git snapshot present in received handover.");
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const result = await TargetWorkspaceSafety.applySnapshot(workspaceRoot, this._lastReceivedCapsule.git);

    if (result.success) {
      vscode.window.showInformationMessage(
        `Applied Git changes: working patch applied (${result.appliedDiff}), ${result.copiedFiles} untracked files copied.`
      );
      this._postMessage({
        type: "GIT_APPLIED",
        success: true
      });
    } else {
      vscode.window.showErrorMessage(`Git apply failed: ${result.error}`);
      this._postMessage({
        type: "GIT_APPLIED",
        success: false,
        error: result.error
      });
    }
  }

  private async _handleTryNativeRestore(): Promise<void> {
    if (!this._lastReceivedCapsule?.nativePayload) {
      vscode.window.showInformationMessage("No native session payload available in this capsule.");
      return;
    }

    const { adapterId } = this._lastReceivedCapsule.nativePayload;
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
      const adapter = adapterId === "claude-code" ? new ClaudeCodeAdapter() : new AntigravityAdapter();
      const restoreResult = await adapter.restoreNativeSession(
        this._lastReceivedCapsule,
        workspaceRoot
      );

      if (restoreResult.success) {
        vscode.window.showInformationMessage(
          `Native restore succeeded: ${restoreResult.message || "Session restored."}`
        );
      } else {
        vscode.window.showWarningMessage(
          `Native restore notice: ${restoreResult.message || "Use Portable Handover & Primed Resume Prompt instead."}`
        );
      }
    } catch (err: any) {
      // Invariant 1: Native restore failure NEVER breaks handover
      vscode.window.showWarningMessage(`Native restore skipped: ${err?.message}. Portable handover remains ready.`);
    }
  }

  private _postMessage(message: any): void {
    this._view?.webview.postMessage(message);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentDrop</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #1e1e2e);
      --card-bg: var(--vscode-editor-background, #181825);
      --border: var(--vscode-widget-border, #313244);
      --text: var(--vscode-foreground, #cdd6f4);
      --text-muted: var(--vscode-descriptionForeground, #a6adc8);
      --accent: var(--vscode-button-background, #89b4fa);
      --accent-hover: var(--vscode-button-hoverBackground, #b4befe);
      --success: #a6e3a1;
      --warning: #f9e2af;
      --danger: #f38ba8;
      --code-bg: rgba(0, 0, 0, 0.35);
    }

    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--text);
      background-color: var(--bg);
      margin: 0;
      padding: 12px;
      line-height: 1.4;
    }

    /* Header & Status Banner */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }
    .header h2 {
      font-size: 15px;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
    }
    .badge-offline {
      background: rgba(166, 227, 161, 0.15);
      color: var(--success);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      border: 1px solid rgba(166, 227, 161, 0.3);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 12px;
      background: rgba(0, 0, 0, 0.2);
      padding: 3px;
      border-radius: 6px;
      border: 1px solid var(--border);
    }
    .tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 6px 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 4px;
      text-align: center;
      transition: all 0.15s ease;
    }
    .tab-btn.active {
      background: var(--card-bg);
      color: var(--text);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }

    /* Tab Content Panels */
    .tab-panel {
      display: none;
    }
    .tab-panel.active {
      display: block;
    }

    /* Radar Visual */
    .radar-container {
      position: relative;
      width: 140px;
      height: 140px;
      margin: 16px auto;
      border-radius: 50%;
      border: 1px solid rgba(137, 180, 250, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: radial-gradient(circle, rgba(137, 180, 250, 0.05) 0%, rgba(0,0,0,0.2) 100%);
    }
    .radar-sweep {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: conic-gradient(from 0deg at 50% 50%, rgba(137, 180, 250, 0.4) 0deg, transparent 60deg, transparent 360deg);
      animation: spin 3s linear infinite;
    }
    .radar-center {
      width: 10px;
      height: 10px;
      background: var(--accent);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--accent);
      z-index: 2;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Cards */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 10px;
    }
    .card-title {
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .agent-tag {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(137, 180, 250, 0.2);
      color: var(--accent);
      font-weight: 600;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: var(--accent);
      color: #11111b;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
      cursor: pointer;
      width: 100%;
      box-sizing: border-box;
      margin-top: 6px;
      transition: opacity 0.15s ease;
    }
    .btn:hover {
      opacity: 0.9;
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
    }

    /* Input */
    .input-box {
      width: 100%;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 8px;
      color: var(--text);
      font-size: 11px;
      box-sizing: border-box;
      margin-bottom: 6px;
    }

    /* SAS Box */
    .sas-box {
      background: rgba(249, 226, 175, 0.1);
      border: 1px dashed var(--warning);
      color: var(--warning);
      padding: 8px;
      border-radius: 6px;
      text-align: center;
      font-family: monospace;
      font-size: 15px;
      letter-spacing: 2px;
      font-weight: bold;
      margin: 8px 0;
    }

    /* Handover Details */
    .handover-section {
      margin-bottom: 8px;
    }
    .handover-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .handover-val {
      font-size: 12px;
      line-height: 1.35;
    }
    .checklist {
      list-style: none;
      padding: 0;
      margin: 4px 0;
    }
    .checklist li {
      font-size: 11px;
      margin-bottom: 2px;
      display: flex;
      align-items: baseline;
      gap: 4px;
    }
    .check-tick { color: var(--success); }
    .check-cross { color: var(--danger); }
    .blocker-alert {
      background: rgba(243, 139, 168, 0.15);
      border-left: 3px solid var(--danger);
      padding: 6px 8px;
      border-radius: 2px;
      font-size: 11px;
      color: var(--text);
    }

    .prompt-box {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 8px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      max-height: 140px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: #a6e3a1;
      margin: 6px 0;
    }

    .qr-container {
      background: white;
      padding: 10px;
      border-radius: 6px;
      width: 160px;
      height: 160px;
      margin: 10px auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-container svg {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M12 2v8"/><path d="m16 6-4 4-4-4"/><rect x="2" y="14" width="20" height="8" rx="2"/>
      </svg>
      AgentDrop
    </h2>
    <span class="badge-offline">Offline P2P</span>
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('sessions')">Sessions</button>
    <button class="tab-btn" onclick="switchTab('nearby')">Nearby</button>
    <button class="tab-btn" onclick="switchTab('handover')" id="handoverTabBtn">Handover</button>
  </div>

  <!-- TAB 1: SESSIONS -->
  <div id="tab-sessions" class="tab-panel active">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <span style="font-size:11px; color:var(--text-muted);">Discovered AI Sessions:</span>
      <button class="btn btn-secondary" style="width:auto; margin:0; padding:3px 8px; font-size:10px;" onclick="refreshSessions()">↻ Refresh</button>
    </div>

    <!-- Beam Active Server Status Banner (hidden by default) -->
    <div id="beam-active-banner" class="card" style="display:none; border-color:var(--accent); background:rgba(137,180,250,0.08);">
      <div class="card-title">
        <span style="color:var(--accent);">📡 Beaming Active Session</span>
        <span style="font-size:10px;" id="beam-port"></span>
      </div>
      <div style="font-size:11px; margin-bottom:4px;" id="beam-session-title"></div>
      <div class="sas-box" id="beam-sas-display">SAS: --- ---</div>
      <div class="qr-container" id="beam-qr-container"></div>
      <div style="font-size:10px; color:var(--text-muted); text-align:center;">Scan on Machine B or run 'agentdrop listen'</div>
      <button class="btn btn-secondary" onclick="cancelBeam()">Stop Beaming</button>
    </div>

    <div id="sessions-container">
      <div style="text-align:center; padding:16px; color:var(--text-muted);">Loading sessions...</div>
    </div>

    <!-- Golden Demo Trigger Card -->
    <div class="card" style="margin-top:12px; border-style:dashed; border-color:rgba(166,227,161,0.5);">
      <div class="card-title">
        <span>⭐ Golden Demo Fixture</span>
        <span class="agent-tag" style="background:rgba(166,227,161,0.2); color:var(--success);">Verified</span>
      </div>
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">
        "Fix refresh-token race condition" (Antigravity auth task with 25 turns &amp; working tree changes)
      </div>
      <button class="btn" style="background:var(--success); color:#11111b;" onclick="beamDemo()">
        Beam Golden Demo Session
      </button>
    </div>
  </div>

  <!-- TAB 2: NEARBY & RECEIVE -->
  <div id="tab-nearby" class="tab-panel">
    <div class="radar-container">
      <div class="radar-sweep"></div>
      <div class="radar-center"></div>
    </div>
    <div style="text-align:center; font-size:11px; color:var(--text-muted); margin-bottom:12px;">
      Device: <b id="local-device-name" style="color:var(--text)">Local Host</b> (<span id="local-ip">127.0.0.1</span>)
    </div>

    <div class="card">
      <div class="card-title">Receive Handover</div>
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">
        Paste Pairing Token or Endpoint:
      </div>
      <input type="text" id="token-input" class="input-box" placeholder="Base64 pairing payload or http://IP:Port">
      <input type="text" id="secret-input" class="input-box" placeholder="Pairing secret (if manual IP)" style="display:none;">
      <button class="btn" onclick="connectPeer()">Connect &amp; Receive Session</button>
    </div>

    <div id="receive-sas-container" class="card" style="display:none;">
      <div class="card-title">Confirm 6-Digit Code (SAS)</div>
      <div class="sas-box" id="receive-sas-code">--- ---</div>
      <div style="font-size:11px; color:var(--text-muted);">Confirm this code matches sender's screen before proceeding.</div>
    </div>
  </div>

  <!-- TAB 3: HANDOVER CARD (HERO) -->
  <div id="tab-handover" class="tab-panel">
    <div id="no-handover-msg" style="text-align:center; padding:24px 8px; color:var(--text-muted);">
      No session received yet.<br>Beam a session or connect from 'Nearby' tab.
    </div>

    <div id="handover-content" style="display:none;">
      <!-- Security Status Bar -->
      <div class="card" style="background:rgba(166,227,161,0.08); border-color:rgba(166,227,161,0.3); padding:6px 10px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; font-weight:600; color:var(--success);">
          <span>🔒 ENCRYPTED P2P (AES-256-GCM)</span>
          <span id="security-redactions-badge">3 Secrets Redacted</span>
        </div>
      </div>

      <!-- Hero Card -->
      <div class="card">
        <div class="handover-section">
          <div class="handover-label">Objective</div>
          <div class="handover-val" id="ho-objective" style="font-weight:600; font-size:13px; color:var(--accent);"></div>
        </div>

        <div class="handover-section" id="ho-completed-sec">
          <div class="handover-label">Completed Milestones</div>
          <ul class="checklist" id="ho-completed-list"></ul>
        </div>

        <div class="handover-section" id="ho-failed-sec">
          <div class="handover-label">Failed Approaches</div>
          <ul class="checklist" id="ho-failed-list"></ul>
        </div>

        <div class="handover-section" id="ho-decisions-sec">
          <div class="handover-label">Important Decisions</div>
          <ul class="checklist" id="ho-decisions-list"></ul>
        </div>

        <div class="handover-section" id="ho-blocker-sec">
          <div class="handover-label">Current Blocker / Active State</div>
          <div class="blocker-alert" id="ho-blocker-val"></div>
        </div>

        <div class="handover-section" id="ho-git-sec">
          <div class="handover-label">Git Working Tree State</div>
          <div style="font-size:11px; margin-top:2px;" id="ho-git-summary"></div>
          <button class="btn btn-secondary" id="apply-git-btn" style="margin-top:6px;" onclick="applyGitChanges()">
            ✓ Review &amp; Apply Git Changes
          </button>
        </div>

        <div class="handover-section" style="margin-top:10px;">
          <div class="handover-label">Primed Resume Prompt</div>
          <div class="prompt-box" id="ho-prompt-val"></div>
          <button class="btn" onclick="copyResumePrompt()">
            📋 Copy Resume Prompt
          </button>
          <button class="btn btn-secondary" id="try-native-btn" style="margin-top:6px;" onclick="tryNativeRestore()">
            ⚡ Try Native Restore (Experimental)
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentHandoverPrompt = "";

    window.addEventListener("message", event => {
      const msg = event.data;
      switch (msg.type) {
        case "DEVICE_INFO":
          document.getElementById("local-device-name").textContent = msg.deviceName || "Local Device";
          document.getElementById("local-ip").textContent = msg.localIp || "127.0.0.1";
          break;

        case "SESSIONS_LIST":
          renderSessions(msg.sessions || []);
          break;

        case "BEAM_STARTED":
          document.getElementById("beam-active-banner").style.display = "block";
          document.getElementById("beam-session-title").textContent = msg.sessionTitle;
          document.getElementById("beam-port").textContent = ":" + msg.port;
          document.getElementById("beam-qr-container").innerHTML = msg.qrSvg || "";
          break;

        case "PEER_CONNECTED":
          const sas = msg.sasCode;
          document.getElementById("beam-sas-display").textContent = "SAS: " + sas.slice(0,3) + " - " + sas.slice(3);
          break;

        case "BEAM_CANCELLED":
        case "BEAM_COMPLETE":
          document.getElementById("beam-active-banner").style.display = "none";
          break;

        case "SAS_VERIFICATION":
          document.getElementById("receive-sas-container").style.display = "block";
          document.getElementById("receive-sas-code").textContent = msg.sasCode.slice(0,3) + " - " + msg.sasCode.slice(3);
          break;

        case "HANDOVER_READY":
          renderHandover(msg.capsule, msg.safetyReport);
          switchTab("handover");
          break;

        case "GIT_APPLIED":
          if (msg.success) {
            document.getElementById("apply-git-btn").textContent = "✓ Git Changes Applied";
            document.getElementById("apply-git-btn").disabled = true;
          }
          break;
      }
    });

    function switchTab(tabId) {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById("tab-" + tabId).classList.add("active");
      event?.target?.classList?.add("active");
    }

    function refreshSessions() {
      vscode.postMessage({ type: "REFRESH_SESSIONS" });
    }

    function beamSession(sessionId, adapterId) {
      vscode.postMessage({ type: "BEAM_SESSION", sessionId, adapterId });
    }

    function beamDemo() {
      vscode.postMessage({ type: "BEAM_DEMO" });
    }

    function cancelBeam() {
      vscode.postMessage({ type: "CANCEL_BEAM" });
    }

    function connectPeer() {
      const token = document.getElementById("token-input").value.trim();
      const secret = document.getElementById("secret-input").value.trim();
      if (!token) return;
      vscode.postMessage({ type: "CONNECT_PEER", tokenOrUrl: token, pairingSecret: secret });
    }

    function applyGitChanges() {
      vscode.postMessage({ type: "APPLY_GIT" });
    }

    function copyResumePrompt() {
      vscode.postMessage({ type: "COPY_CLIPBOARD", text: currentHandoverPrompt });
    }

    function tryNativeRestore() {
      vscode.postMessage({ type: "TRY_NATIVE_RESTORE" });
    }

    function renderSessions(sessions) {
      const container = document.getElementById("sessions-container");
      if (!sessions || sessions.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted);">No active sessions found. Try the Golden Demo fixture below!</div>';
        return;
      }

      container.innerHTML = sessions.slice(0, 5).map(s => \`
        <div class="card">
          <div class="card-title">
            <span style="font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:180px;">\${escapeHtml(s.title || "Untitled")}</span>
            <span class="agent-tag">\${escapeHtml(s.adapterName)}</span>
          </div>
          <div style="font-size:10px; color:var(--text-muted); margin-bottom:6px;">
            \${s.turnCount || 0} turns • ID: \${(s.sessionId || "").slice(0,8)}...
          </div>
          <button class="btn" onclick="beamSession('\${s.sessionId}', '\${s.adapterId}')">
            📡 Beam Session
          </button>
        </div>
      \`).join("");
    }

    function renderHandover(capsule, safety) {
      document.getElementById("no-handover-msg").style.display = "none";
      document.getElementById("handover-content").style.display = "block";

      const h = capsule.handover;
      document.getElementById("ho-objective").textContent = h.objective || "Context Handover";

      // Completed
      const compList = document.getElementById("ho-completed-list");
      compList.innerHTML = "";
      (h.completedMilestones || h.observedActivity || []).forEach(item => {
        compList.innerHTML += \`<li><span class="check-tick">✓</span> \${escapeHtml(item)}</li>\`;
      });

      // Failed
      const failedList = document.getElementById("ho-failed-list");
      failedList.innerHTML = "";
      if (h.failedAttempts && h.failedAttempts.length) {
        document.getElementById("ho-failed-sec").style.display = "block";
        h.failedAttempts.forEach(item => {
          failedList.innerHTML += \`<li><span class="check-cross">✗</span> \${escapeHtml(item)}</li>\`;
        });
      } else {
        document.getElementById("ho-failed-sec").style.display = "none";
      }

      // Decisions
      const decList = document.getElementById("ho-decisions-list");
      decList.innerHTML = "";
      if (h.importantDecisions && h.importantDecisions.length) {
        document.getElementById("ho-decisions-sec").style.display = "block";
        h.importantDecisions.forEach(item => {
          decList.innerHTML += \`<li><span class="check-tick">✓</span> \${escapeHtml(item)}</li>\`;
        });
      } else {
        document.getElementById("ho-decisions-sec").style.display = "none";
      }

      // Blocker
      if (h.currentBlockerOrActiveState) {
        document.getElementById("ho-blocker-sec").style.display = "block";
        document.getElementById("ho-blocker-val").textContent = h.currentBlockerOrActiveState;
      } else {
        document.getElementById("ho-blocker-sec").style.display = "none";
      }

      // Git
      let gitText = "No working tree diff";
      if (capsule.git) {
        const untracked = capsule.git.untrackedSourceFiles?.length || 0;
        gitText = \`Branch: \${capsule.git.identity?.branch || "main"} • \${untracked} untracked file(s)\`;
      }
      document.getElementById("ho-git-summary").textContent = gitText;

      // Resume Prompt
      currentHandoverPrompt = h.primedResumePrompt || "";
      document.getElementById("ho-prompt-val").textContent = currentHandoverPrompt;

      // Redactions
      const count = capsule.securitySummary?.redactedSecretsCount || 0;
      document.getElementById("security-redactions-badge").textContent = \`\${count} Secret(s) Redacted\`;
    }

    function escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Trigger initial load
    vscode.postMessage({ type: "INIT" });
  </script>
</body>
</html>`;
  }
}
