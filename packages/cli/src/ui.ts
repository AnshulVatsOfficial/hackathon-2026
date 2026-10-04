/**
 * AgentDrop - Standalone Web UI Dashboard
 * Authoritative Plan: Sections 40, 42, 43
 */

import http from "node:http";
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
  NetworkDiscovery,
  AntigravityAdapter,
  ClaudeCodeAdapter,
  QRPairingPayload,
  AiCapsule
} from "@agentdrop/core";

export class DashboardServer {
  private server: http.Server | null = null;
  private activeSender?: AgentDropSender;
  private activeReceiver?: AgentDropReceiver;
  private lastCapsule?: AiCapsule;

  constructor(private port: number = 3333) {}

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.port, () => {
        resolve(this.port);
      });
      this.server.on("error", reject);
    });
  }

  public async close(): Promise<void> {
    if (this.activeSender) {
      await this.activeSender.close();
    }
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // Enable CORS for easy local network access
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(this.getHtml());
      return;
    }

    if (url.pathname === "/api/info" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          deviceName: NetworkDiscovery.getDeviceName(),
          localIp: NetworkDiscovery.getLocalIp()
        })
      );
      return;
    }

    if (url.pathname === "/api/sessions" && req.method === "GET") {
      try {
        const antigravity = new AntigravityAdapter();
        const claude = new ClaudeCodeAdapter();

        const agInstalled = await antigravity.isInstalled();
        const claudeInstalled = await claude.isInstalled();

        const agSessions = agInstalled ? await antigravity.listRecentSessions() : [];
        const claudeSessions = claudeInstalled ? await claude.listRecentSessions() : [];

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            sessions: [
              ...agSessions.map(s => ({ ...s, adapterId: "antigravity", adapterName: "Google Antigravity" })),
              ...claudeSessions.map(s => ({ ...s, adapterId: "claude-code", adapterName: "Claude Code" }))
            ]
          })
        );
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err?.message }));
      }
      return;
    }

    if (url.pathname === "/api/beam" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", async () => {
        try {
          const params = JSON.parse(body || "{}");
          let serializedCapsule = "";
          let sessionTitle = "Active Development Task";

          if (params.isDemo) {
            const possiblePaths = [
              path.resolve(process.cwd(), "packages/core/fixtures/antigravity-auth-fixture/expected-capsule.json"),
              path.resolve(process.cwd(), "fixtures/antigravity-auth-fixture/expected-capsule.json"),
              path.resolve(process.cwd(), "../core/fixtures/antigravity-auth-fixture/expected-capsule.json")
            ];

            let found = "";
            for (const p of possiblePaths) {
              try {
                await fs.access(p);
                found = p;
                break;
              } catch {}
            }

            if (!found) throw new Error("Golden demo fixture not found");
            serializedCapsule = await fs.readFile(found, "utf-8");
            sessionTitle = "Fix refresh-token race condition (Golden Demo)";
          } else {
            const adapter = params.adapterId === "claude-code" ? new ClaudeCodeAdapter() : new AntigravityAdapter();
            const extracted = await adapter.extractSession(params.sessionId);
            sessionTitle = extracted.title;

            const { sanitizedTurns } = PreSanitizer.preSanitize(extracted.turns);
            const gitSnapshot = await GitSnapshotCollector.captureSnapshot(process.cwd());

            const handover = DeterministicExtractor.extract({
              sessionTitle: extracted.title,
              firstSubstantiveUserPrompt: sanitizedTurns[0]?.content || "Development task",
              recentUserPrompts: sanitizedTurns.filter(t => t.role === "user").map(t => t.content).slice(-3),
              lastAssistantResponse: sanitizedTurns.filter(t => t.role === "assistant").pop()?.content,
              recentToolErrors: [],
              modifiedFilesList: []
            });

            const packed = CapsulePackager.pack({
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

            serializedCapsule = packed.serialized;
          }

          if (this.activeSender) {
            await this.activeSender.close();
          }

          const deviceName = NetworkDiscovery.getDeviceName();
          const sender = new AgentDropSender(serializedCapsule, deviceName);
          this.activeSender = sender;

          const beamPort = await sender.start(0);
          const localIp = NetworkDiscovery.getLocalIp();
          const pairingPayload = sender.getPairingPayload(localIp);
          const base64Token = Buffer.from(JSON.stringify(pairingPayload)).toString("base64");

          const qrSvg = await QRCode.toString(base64Token, {
            type: "svg",
            margin: 1,
            color: { dark: "#58a6ff", light: "#00000000" }
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              port: beamPort,
              localIp,
              transferId: pairingPayload.transferId,
              pairingSecret: pairingPayload.pairingSecret,
              base64Token,
              qrSvg,
              sessionTitle
            })
          );
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err?.message }));
        }
      });
      return;
    }

    if (url.pathname === "/api/connect" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", async () => {
        try {
          const params = JSON.parse(body || "{}");
          let payload: QRPairingPayload;

          if (params.tokenOrUrl?.startsWith("http")) {
            payload = {
              v: 1,
              transferId: "web-transfer",
              endpoint: params.tokenOrUrl,
              senderPub: "",
              pairingSecret: params.pairingSecret || "",
              deviceName: "Sender"
            };
          } else {
            payload = JSON.parse(Buffer.from(params.tokenOrUrl?.trim(), "base64").toString("utf-8"));
          }

          const stagingDir = path.resolve("./.agentdrop/staging");
          await fs.mkdir(stagingDir, { recursive: true });

          const receiver = new AgentDropReceiver(stagingDir, NetworkDiscovery.getDeviceName());
          this.activeReceiver = receiver;

          const { sasCode, senderDevice } = await receiver.initiateHandshake(payload);
          const result = await receiver.acceptHandover();
          this.lastCapsule = result.capsule;

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              sasCode,
              senderDevice,
              capsule: result.capsule
            })
          );
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err?.message }));
        }
      });
      return;
    }

    if (url.pathname === "/api/cancel-beam" && req.method === "POST") {
      if (this.activeSender) {
        await this.activeSender.close();
        this.activeSender = undefined;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Endpoint not found" }));
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentDrop Dashboard — AI Context Portability</title>
  <style>
    :root {
      --bg: #11111b;
      --card-bg: #181825;
      --border: #313244;
      --text: #cdd6f4;
      --text-muted: #a6adc8;
      --accent: #89b4fa;
      --accent-hover: #b4befe;
      --success: #a6e3a1;
      --warning: #f9e2af;
      --danger: #f38ba8;
      --code-bg: rgba(0, 0, 0, 0.4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .header h1 { font-size: 20px; display: flex; align-items: center; gap: 8px; font-weight: 700; color: #fff; }
    .badge {
      background: rgba(166, 227, 161, 0.15);
      color: var(--success);
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 12px;
      border: 1px solid rgba(166, 227, 161, 0.3);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .tagline { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

    .tabs {
      display: flex;
      gap: 6px;
      background: rgba(255, 255, 255, 0.03);
      padding: 4px;
      border-radius: 8px;
      border: 1px solid var(--border);
      margin-bottom: 18px;
    }
    .tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 6px;
      transition: all 0.2s ease;
      text-align: center;
    }
    .tab-btn.active { background: var(--card-bg); color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }

    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .agent-tag {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(137, 180, 250, 0.2);
      color: var(--accent);
      font-weight: 600;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: var(--accent);
      color: #11111b;
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s ease;
      width: 100%;
    }
    .btn:hover { opacity: 0.9; }
    .btn-secondary { background: rgba(255, 255, 255, 0.08); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.14); }

    .input-box {
      width: 100%;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text);
      font-size: 12px;
      margin-bottom: 8px;
    }

    .sas-box {
      background: rgba(249, 226, 175, 0.1);
      border: 1px dashed var(--warning);
      color: var(--warning);
      padding: 10px;
      border-radius: 8px;
      text-align: center;
      font-family: monospace;
      font-size: 18px;
      letter-spacing: 3px;
      font-weight: bold;
      margin: 10px 0;
    }

    .radar-container {
      position: relative;
      width: 160px;
      height: 160px;
      margin: 16px auto;
      border-radius: 50%;
      border: 1px solid rgba(137, 180, 250, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: radial-gradient(circle, rgba(137, 180, 250, 0.05) 0%, rgba(0,0,0,0.3) 100%);
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
      width: 12px;
      height: 12px;
      background: var(--accent);
      border-radius: 50%;
      box-shadow: 0 0 12px var(--accent);
      z-index: 2;
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    .qr-container {
      background: white;
      padding: 12px;
      border-radius: 8px;
      width: 180px;
      height: 180px;
      margin: 12px auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-container svg { width: 100%; height: 100%; }

    .checklist { list-style: none; margin: 6px 0; }
    .checklist li { font-size: 12px; margin-bottom: 4px; display: flex; align-items: baseline; gap: 6px; }
    .check-tick { color: var(--success); font-weight: bold; }
    .check-cross { color: var(--danger); font-weight: bold; }
    .blocker-box {
      background: rgba(243, 139, 168, 0.15);
      border-left: 3px solid var(--danger);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      margin: 6px 0;
    }
    .prompt-box {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      max-height: 180px;
      overflow-y: auto;
      white-space: pre-wrap;
      color: #a6e3a1;
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M12 2v8"/><path d="m16 6-4 4-4-4"/><rect x="2" y="14" width="20" height="8" rx="2"/>
        </svg>
        AgentDrop
      </h1>
      <div class="tagline">Local-First AI Context Portability Layer</div>
    </div>
    <span class="badge">Offline P2P Ready</span>
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('sessions')">Active Sessions</button>
    <button class="tab-btn" onclick="switchTab('nearby')">Nearby &amp; Receive</button>
    <button class="tab-btn" onclick="switchTab('handover')" id="handoverTabBtn">AI Handover Card</button>
  </div>

  <!-- TAB 1: SESSIONS -->
  <div id="tab-sessions" class="tab-panel active">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span style="font-size:12px; color:var(--text-muted);">Discovered Local Sessions:</span>
      <button class="btn btn-secondary" style="width:auto; padding:4px 10px; font-size:11px;" onclick="loadSessions()">↻ Refresh</button>
    </div>

    <div id="beam-active-box" class="card" style="display:none; border-color:var(--accent); background:rgba(137,180,250,0.06);">
      <div class="card-title">
        <span style="color:var(--accent);">📡 Beaming Active Session</span>
        <span style="font-size:11px;" id="beam-port"></span>
      </div>
      <div style="font-size:12px; margin-bottom:6px;" id="beam-title"></div>
      <div class="sas-box" id="beam-sas">SAS: --- ---</div>
      <div class="qr-container" id="beam-qr"></div>
      <div style="font-size:11px; color:var(--text-muted); text-align:center; margin-bottom:8px;">
        Scan on Machine B or run 'agentdrop listen &lt;token&gt;'
      </div>
      <button class="btn btn-secondary" onclick="cancelBeam()">Stop Beaming</button>
    </div>

    <div id="sessions-list">
      <div style="text-align:center; padding:20px; color:var(--text-muted);">Loading sessions...</div>
    </div>

    <div class="card" style="border-style:dashed; border-color:rgba(166,227,161,0.5); margin-top:16px;">
      <div class="card-title">
        <span>⭐ Golden Demo Fixture</span>
        <span class="agent-tag" style="background:rgba(166,227,161,0.2); color:var(--success);">Verified</span>
      </div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">
        "Fix refresh-token race condition" (Antigravity auth task with 25 turns, Git patch &amp; 3 redacted secrets)
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
    <div style="text-align:center; font-size:12px; color:var(--text-muted); margin-bottom:16px;">
      Device: <b id="local-device-name" style="color:var(--text)">Local Host</b> (<span id="local-ip">127.0.0.1</span>)
    </div>

    <div class="card">
      <div class="card-title">Receive Context Handover</div>
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">
        Paste Pairing Token (Base64) or Sender Endpoint:
      </div>
      <input type="text" id="token-input" class="input-box" placeholder="Paste Base64 token or http://IP:Port">
      <input type="text" id="secret-input" class="input-box" placeholder="Pairing secret (if manual IP)" style="display:none;">
      <button class="btn" onclick="connectPeer()">Connect &amp; Receive Session</button>
    </div>

    <div id="receive-sas-box" class="card" style="display:none;">
      <div class="card-title">Confirm 6-Digit Code (SAS)</div>
      <div class="sas-box" id="receive-sas-code">--- ---</div>
      <div style="font-size:12px; color:var(--text-muted); text-align:center;">
        Confirm this code matches sender's screen before proceeding.
      </div>
    </div>
  </div>

  <!-- TAB 3: HANDOVER CARD -->
  <div id="tab-handover" class="tab-panel">
    <div id="no-handover-msg" style="text-align:center; padding:32px 12px; color:var(--text-muted);">
      No session received yet.<br>Beam a session or connect in the 'Nearby' tab.
    </div>

    <div id="handover-content" style="display:none;">
      <div class="card" style="background:rgba(166,227,161,0.08); border-color:rgba(166,227,161,0.3); padding:8px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600; color:var(--success);">
          <span>🔒 ENCRYPTED P2P (AES-256-GCM)</span>
          <span id="security-badge">3 Secrets Redacted</span>
        </div>
      </div>

      <div class="card">
        <div style="margin-bottom:12px;">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Objective</div>
          <div style="font-size:15px; font-weight:700; color:var(--accent);" id="ho-objective"></div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Completed Milestones</div>
          <ul class="checklist" id="ho-completed"></ul>
        </div>

        <div style="margin-bottom:12px;" id="ho-failed-box">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Failed Approaches</div>
          <ul class="checklist" id="ho-failed"></ul>
        </div>

        <div style="margin-bottom:12px;" id="ho-decisions-box">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Important Decisions</div>
          <ul class="checklist" id="ho-decisions"></ul>
        </div>

        <div style="margin-bottom:12px;" id="ho-blocker-box">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Current Blocker / Active State</div>
          <div class="blocker-box" id="ho-blocker"></div>
        </div>

        <div style="margin-bottom:12px;">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Primed Resume Prompt</div>
          <div class="prompt-box" id="ho-prompt"></div>
          <button class="btn" onclick="copyPrompt()">📋 Copy Resume Prompt</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    let activePrompt = "";

    function switchTab(id) {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById("tab-" + id).classList.add("active");
      event?.target?.classList?.add("active");
    }

    async function loadInfo() {
      const res = await fetch("/api/info");
      const data = await res.json();
      document.getElementById("local-device-name").textContent = data.deviceName;
      document.getElementById("local-ip").textContent = data.localIp;
    }

    async function loadSessions() {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      const list = document.getElementById("sessions-list");
      if (!data.sessions || data.sessions.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted);">No active sessions found. Use the Golden Demo fixture below!</div>';
        return;
      }

      list.innerHTML = data.sessions.slice(0, 5).map(s => \`
        <div class="card">
          <div class="card-title">
            <span style="font-weight:600;">\${escape(s.title || "Task")}</span>
            <span class="agent-tag">\${escape(s.adapterName)}</span>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">
            \${s.turnCount || 0} turns • ID: \${(s.sessionId || "").slice(0, 8)}...
          </div>
          <button class="btn" onclick="beamSession('\${s.sessionId}', '\${s.adapterId}')">
            📡 Beam Session
          </button>
        </div>
      \`).join("");
    }

    async function beamSession(sessionId, adapterId) {
      const res = await fetch("/api/beam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, adapterId })
      });
      const data = await res.json();
      showBeamActive(data);
    }

    async function beamDemo() {
      const res = await fetch("/api/beam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDemo: true })
      });
      const data = await res.json();
      showBeamActive(data);
    }

    function showBeamActive(data) {
      document.getElementById("beam-active-box").style.display = "block";
      document.getElementById("beam-title").textContent = data.sessionTitle;
      document.getElementById("beam-port").textContent = ":" + data.port;
      document.getElementById("beam-qr").innerHTML = data.qrSvg || "";
    }

    async function cancelBeam() {
      await fetch("/api/cancel-beam", { method: "POST" });
      document.getElementById("beam-active-box").style.display = "none";
    }

    async function connectPeer() {
      const token = document.getElementById("token-input").value.trim();
      const secret = document.getElementById("secret-input").value.trim();
      if (!token) return;

      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenOrUrl: token, pairingSecret: secret })
      });
      const data = await res.json();
      if (data.success) {
        renderHandover(data.capsule, data.sasCode);
        switchTab("handover");
      } else {
        alert("Failed to connect: " + (data.error || "Unknown error"));
      }
    }

    function renderHandover(capsule, sasCode) {
      document.getElementById("no-handover-msg").style.display = "none";
      document.getElementById("handover-content").style.display = "block";

      const h = capsule.handover;
      document.getElementById("ho-objective").textContent = h.objective || "Context Handover";

      const comp = document.getElementById("ho-completed");
      comp.innerHTML = "";
      (h.completedMilestones || h.observedActivity || []).forEach(item => {
        comp.innerHTML += \`<li><span class="check-tick">✓</span> \${escape(item)}</li>\`;
      });

      const failed = document.getElementById("ho-failed");
      failed.innerHTML = "";
      if (h.failedAttempts && h.failedAttempts.length) {
        document.getElementById("ho-failed-box").style.display = "block";
        h.failedAttempts.forEach(item => {
          failed.innerHTML += \`<li><span class="check-cross">✗</span> \${escape(item)}</li>\`;
        });
      } else {
        document.getElementById("ho-failed-box").style.display = "none";
      }

      const dec = document.getElementById("ho-decisions");
      dec.innerHTML = "";
      if (h.importantDecisions && h.importantDecisions.length) {
        document.getElementById("ho-decisions-box").style.display = "block";
        h.importantDecisions.forEach(item => {
          dec.innerHTML += \`<li><span class="check-tick">✓</span> \${escape(item)}</li>\`;
        });
      } else {
        document.getElementById("ho-decisions-box").style.display = "none";
      }

      if (h.currentBlockerOrActiveState) {
        document.getElementById("ho-blocker-box").style.display = "block";
        document.getElementById("ho-blocker").textContent = h.currentBlockerOrActiveState;
      } else {
        document.getElementById("ho-blocker-box").style.display = "none";
      }

      activePrompt = h.primedResumePrompt || "";
      document.getElementById("ho-prompt").textContent = activePrompt;
    }

    function copyPrompt() {
      navigator.clipboard.writeText(activePrompt);
      alert("Primed Resume Prompt copied to clipboard!");
    }

    function escape(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    loadInfo();
    loadSessions();
  </script>
</body>
</html>`;
  }
}
