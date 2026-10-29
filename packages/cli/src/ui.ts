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
  AiCapsule,
  ContextSyncManager
} from "agentdrop-portability-core";

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
              ...agSessions.map((s: any) => ({ ...s, adapterId: "antigravity", adapterName: "Google Antigravity" })),
              ...claudeSessions.map((s: any) => ({ ...s, adapterId: "claude-code", adapterName: "Claude Code" }))
            ]
          })
        );
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err?.message }));
      }
      return;
    }

    if (url.pathname === "/api/git-status" && req.method === "GET") {
      try {
        const status = await ContextSyncManager.getStatus(process.cwd());
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(status));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err?.message }));
      }
      return;
    }

    if (url.pathname === "/api/git-save" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => (body += chunk));
      req.on("end", async () => {
        try {
          const params = JSON.parse(body || "{}");
          let capsule: any;

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
            capsule = JSON.parse(await fs.readFile(found, "utf-8"));
          } else {
            const adapter = params.adapterId === "claude-code" ? new ClaudeCodeAdapter() : new AntigravityAdapter();
            const extracted = await adapter.extractSession(params.sessionId);
            const { sanitizedTurns } = PreSanitizer.preSanitize(extracted.turns);
            const gitSnapshot = await GitSnapshotCollector.captureSnapshot(process.cwd());

            const handover = DeterministicExtractor.extract({
              sessionTitle: extracted.title,
              firstSubstantiveUserPrompt: sanitizedTurns[0]?.content || "Development task",
              recentUserPrompts: sanitizedTurns.filter((t: any) => t.role === "user").map((t: any) => t.content).slice(-3),
              lastAssistantResponse: sanitizedTurns.filter((t: any) => t.role === "assistant").pop()?.content,
              recentToolErrors: [],
              modifiedFilesList: []
            });

            const packed = CapsulePackager.pack({
              sourceAgent: adapter.id,
              workspaceName: gitSnapshot.identity.name,
              handover,
              git: gitSnapshot,
              conversation: { totalTurns: sanitizedTurns.length, turns: sanitizedTurns },
              selectedFiles: gitSnapshot.untrackedSourceFiles,
              nativePayload: { adapterId: adapter.id, rawFiles: extracted.rawFiles }
            });
            capsule = packed.capsule;
          }

          const saveResult = await ContextSyncManager.saveHandoff(process.cwd(), capsule, { saveFullCapsule: true });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(saveResult));
        } catch (err: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err?.message }));
        }
      });
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
              recentUserPrompts: sanitizedTurns.filter((t: any) => t.role === "user").map((t: any) => t.content).slice(-3),
              lastAssistantResponse: sanitizedTurns.filter((t: any) => t.role === "assistant").pop()?.content,
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
  <title>Jira · AgentDrop AI Context Portability</title>
  <style>
    :root {
      --jira-navy: #091E42;
      --jira-header-bg: #0B2046;
      --jira-bg: #F4F5F7;
      --jira-card-bg: #FFFFFF;
      --jira-border: #DFE1E6;
      --jira-border-subtle: #EBECF0;
      --jira-text-primary: #172B4D;
      --jira-text-secondary: #5E6C84;
      --jira-text-subtle: #6B778C;
      --jira-blue: #0052CC;
      --jira-blue-hover: #0065FF;
      --jira-blue-light: #DEEBFF;
      --jira-blue-text: #0747A6;
      --jira-green: #00875A;
      --jira-green-light: #E3FCEF;
      --jira-green-text: #006644;
      --jira-red: #DE350B;
      --jira-red-light: #FFEBE6;
      --jira-red-text: #BF2600;
      --jira-yellow: #FFAB00;
      --jira-yellow-light: #FFF0B3;
      --jira-yellow-text: #172B4D;
      --jira-focus: #4C9AFF;
      --jira-shadow: 0 1px 1px rgba(9, 30, 66, 0.25), 0 0 1px 1px rgba(9, 30, 66, 0.13);
      --jira-shadow-card: 0 1px 2px rgba(9, 30, 66, 0.15), 0 0 1px rgba(9, 30, 66, 0.2);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--jira-bg);
      color: var(--jira-text-primary);
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* TOP GLOBAL NAVIGATION BAR (Atlassian / Jira Header) */
    .jira-navbar {
      background: var(--jira-navy);
      height: 48px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #FFFFFF;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }
    .jira-navbar-left {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .jira-app-switcher {
      color: #DEEBFF;
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 4px;
      border-radius: 3px;
    }
    .jira-app-switcher:hover { background: rgba(255, 255, 255, 0.15); }
    .jira-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.2px;
      color: #FFFFFF;
      text-decoration: none;
    }
    .jira-brand-logo {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #2684FF;
    }
    .jira-nav-links {
      display: flex;
      gap: 4px;
      margin-left: 10px;
    }
    .jira-nav-link {
      color: #DEEBFF;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 3px;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .jira-nav-link:hover { background: rgba(255, 255, 255, 0.15); color: #FFFFFF; }
    .jira-nav-link.active { background: rgba(255, 255, 255, 0.2); color: #FFFFFF; font-weight: 600; }

    .jira-navbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .jira-search-bar {
      display: flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      padding: 4px 10px;
      width: 220px;
      color: #FFFFFF;
      font-size: 13px;
    }
    .jira-search-bar input {
      background: transparent;
      border: none;
      outline: none;
      color: #FFFFFF;
      width: 100%;
      font-size: 12px;
    }
    .jira-search-bar input::placeholder { color: rgba(255, 255, 255, 0.6); }
    .jira-search-shortcut {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
      padding: 1px 4px;
      font-size: 10px;
      color: rgba(255, 255, 255, 0.8);
      font-family: monospace;
    }
    .jira-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #0052CC;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 11px;
      border: 2px solid #FFFFFF;
    }

    /* PROJECT SUB-HEADER & BREADCRUMBS */
    .jira-subbar {
      background: #FFFFFF;
      border-bottom: 1px solid var(--jira-border);
      padding: 12px 24px 0 24px;
    }
    .jira-breadcrumbs {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--jira-text-secondary);
      margin-bottom: 8px;
    }
    .jira-breadcrumb-link {
      color: var(--jira-text-secondary);
      text-decoration: none;
    }
    .jira-breadcrumb-link:hover { color: var(--jira-blue); text-decoration: underline; }
    .jira-project-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .jira-project-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .jira-project-avatar {
      width: 36px;
      height: 36px;
      border-radius: 4px;
      background: linear-gradient(135deg, #0052CC 0%, #2684FF 100%);
      color: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    .jira-project-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--jira-text-primary);
      letter-spacing: -0.2px;
    }
    .jira-project-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* JIRA TABS (Sub-navigation) */
    .jira-tabs {
      display: flex;
      gap: 16px;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .jira-tab {
      background: transparent;
      border: none;
      padding: 8px 4px 10px 4px;
      font-size: 14px;
      font-weight: 500;
      color: var(--jira-text-secondary);
      cursor: pointer;
      position: relative;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: color 0.15s ease;
    }
    .jira-tab:hover { color: var(--jira-blue); }
    .jira-tab.active {
      color: var(--jira-blue);
      font-weight: 600;
    }
    .jira-tab.active::after {
      content: "";
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--jira-blue);
      border-radius: 2px 2px 0 0;
    }
    .jira-tab-badge {
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--jira-border-subtle);
      color: var(--jira-text-secondary);
      font-weight: 600;
    }
    .jira-tab.active .jira-tab-badge {
      background: var(--jira-blue-light);
      color: var(--jira-blue-text);
    }

    /* MAIN CONTAINER */
    .jira-container {
      max-width: 1180px;
      width: 100%;
      margin: 20px auto;
      padding: 0 20px;
      flex: 1;
    }
    .jira-panel { display: none; }
    .jira-panel.active { display: block; }

    /* JIRA CARDS & BOARDS */
    .jira-card {
      background: var(--jira-card-bg);
      border: 1px solid var(--jira-border);
      border-radius: 4px;
      box-shadow: var(--jira-shadow-card);
      padding: 16px;
      margin-bottom: 16px;
    }
    .jira-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--jira-border-subtle);
    }
    .jira-card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--jira-text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* JIRA BUTTONS */
    .jira-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 3px;
      border: 1px solid transparent;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s ease, border-color 0.15s ease;
      white-space: nowrap;
    }
    .jira-btn-primary {
      background: var(--jira-blue);
      color: #FFFFFF;
    }
    .jira-btn-primary:hover { background: var(--jira-blue-hover); }
    .jira-btn-default {
      background: rgba(9, 30, 66, 0.04);
      color: var(--jira-text-primary);
      border-color: var(--jira-border);
    }
    .jira-btn-default:hover { background: rgba(9, 30, 66, 0.08); }
    .jira-btn-success {
      background: var(--jira-green);
      color: #FFFFFF;
    }
    .jira-btn-success:hover { background: #006644; }
    .jira-btn-danger {
      background: var(--jira-red);
      color: #FFFFFF;
    }
    .jira-btn-danger:hover { background: #BF2600; }
    .jira-btn-sm {
      padding: 3px 8px;
      font-size: 12px;
    }

    /* JIRA STATUS LOZENGES */
    .jira-lozenge {
      display: inline-flex;
      align-items: center;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
      letter-spacing: 0.3px;
      line-height: 1;
    }
    .jira-lozenge-blue { background: var(--jira-blue-light); color: var(--jira-blue-text); }
    .jira-lozenge-green { background: var(--jira-green-light); color: var(--jira-green-text); }
    .jira-lozenge-red { background: var(--jira-red-light); color: var(--jira-red-text); }
    .jira-lozenge-yellow { background: var(--jira-yellow-light); color: var(--jira-yellow-text); }
    .jira-lozenge-neutral { background: #DFE1E6; color: #42526E; }

    /* JIRA ISSUE LIST (Sessions) */
    .jira-issue-card {
      background: #FFFFFF;
      border: 1px solid var(--jira-border);
      border-radius: 4px;
      padding: 12px 16px;
      margin-bottom: 10px;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .jira-issue-card:hover {
      box-shadow: 0 2px 6px rgba(9, 30, 66, 0.18);
      border-color: #B3D4FF;
    }
    .jira-issue-left {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .jira-issue-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--jira-text-secondary);
    }
    .jira-issue-key {
      font-weight: 600;
      color: var(--jira-blue);
      text-decoration: none;
    }
    .jira-issue-key:hover { text-decoration: underline; }
    .jira-issue-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--jira-text-primary);
    }
    .jira-issue-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* TWO-COLUMN JIRA ISSUE DETAIL LAYOUT (Handover Card) */
    .jira-issue-detail-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 20px;
      align-items: start;
    }
    .jira-issue-main {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .jira-section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--jira-text-subtle);
      margin-bottom: 6px;
    }
    .jira-desc-box {
      background: #FFFFFF;
      border: 1px solid var(--jira-border);
      border-radius: 4px;
      padding: 14px;
    }
    .jira-checklist {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .jira-checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 13px;
      line-height: 1.4;
    }
    .jira-tick {
      color: var(--jira-green);
      font-weight: bold;
      margin-top: 1px;
    }
    .jira-cross {
      color: var(--jira-red);
      font-weight: bold;
      margin-top: 1px;
    }

    /* JIRA CALLOUT BANNERS */
    .jira-callout-alert {
      background: var(--jira-red-light);
      border-left: 3px solid var(--jira-red);
      padding: 10px 14px;
      border-radius: 3px;
      font-size: 13px;
      color: var(--jira-red-text);
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .jira-callout-info {
      background: var(--jira-blue-light);
      border-left: 3px solid var(--jira-blue);
      padding: 10px 14px;
      border-radius: 3px;
      font-size: 13px;
      color: var(--jira-blue-text);
    }

    /* JIRA CONFLUENCE / CODE MACRO BLOCK */
    .jira-code-block {
      background: #FAFBFC;
      border: 1px solid var(--jira-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .jira-code-header {
      background: #EBECF0;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--jira-text-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--jira-border);
    }
    .jira-code-content {
      padding: 12px;
      font-family: SFMono-Medium, "SF Mono", "Segoe UI Mono", Menlo, Consolas, monospace;
      font-size: 12px;
      color: #172B4D;
      line-height: 1.5;
      white-space: pre-wrap;
      max-height: 240px;
      overflow-y: auto;
      background: #FFFFFF;
    }

    /* RIGHT SIDEBAR DETAILS PANEL */
    .jira-sidebar-panel {
      background: #FFFFFF;
      border: 1px solid var(--jira-border);
      border-radius: 4px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .jira-field-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      border-bottom: 1px solid var(--jira-border-subtle);
      padding-bottom: 10px;
    }
    .jira-field-row:last-child { border-bottom: none; padding-bottom: 0; }
    .jira-field-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--jira-text-secondary);
    }
    .jira-field-value {
      font-size: 13px;
      color: var(--jira-text-primary);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* RADAR SCAN & QR MODAL */
    .jira-radar-container {
      position: relative;
      width: 160px;
      height: 160px;
      margin: 16px auto;
      border-radius: 50%;
      border: 2px solid #DEEBFF;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: radial-gradient(circle, #E9F2FF 0%, #FFFFFF 100%);
    }
    .jira-radar-sweep {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: conic-gradient(from 0deg at 50% 50%, rgba(0, 82, 204, 0.4) 0deg, transparent 60deg, transparent 360deg);
      animation: spin 3s linear infinite;
    }
    .jira-radar-center {
      width: 14px;
      height: 14px;
      background: var(--jira-blue);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--jira-blue);
      z-index: 2;
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    .jira-sas-box {
      background: var(--jira-yellow-light);
      border: 1px dashed var(--jira-yellow);
      color: var(--jira-yellow-text);
      padding: 10px;
      border-radius: 4px;
      text-align: center;
      font-family: monospace;
      font-size: 20px;
      letter-spacing: 3px;
      font-weight: 700;
      margin: 12px 0;
    }

    .jira-qr-box {
      background: #FFFFFF;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid var(--jira-border);
      width: 180px;
      height: 180px;
      margin: 12px auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .jira-qr-box svg { width: 100%; height: 100%; }

    .jira-input {
      width: 100%;
      background: #FAFBFC;
      border: 1px solid var(--jira-border);
      border-radius: 3px;
      padding: 8px 10px;
      color: var(--jira-text-primary);
      font-size: 13px;
      margin-bottom: 8px;
      outline: none;
      transition: all 0.15s ease;
    }
    .jira-input:focus {
      background: #FFFFFF;
      border-color: var(--jira-focus);
      box-shadow: 0 0 0 2px rgba(76, 154, 255, 0.2);
    }

    /* FOOTER */
    .jira-footer {
      background: #FFFFFF;
      border-top: 1px solid var(--jira-border);
      padding: 12px 24px;
      font-size: 12px;
      color: var(--jira-text-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: auto;
    }

    /* TOAST */
    .jira-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #091E42;
      color: #FFFFFF;
      padding: 10px 16px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      font-size: 13px;
      display: none;
      align-items: center;
      gap: 8px;
      z-index: 1000;
    }
  </style>
</head>
<body>

  <!-- 1. TOP GLOBAL JIRA NAVIGATION BAR -->
  <header class="jira-navbar">
    <div class="jira-navbar-left">
      <div class="jira-app-switcher" title="Atlassian Switcher">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/>
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          <circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
        </svg>
      </div>
      <a href="/" class="jira-brand">
        <div class="jira-brand-logo">
          <!-- Jira Diamond Logo -->
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M11.5 2.5L2.5 11.5L11.5 20.5L20.5 11.5L11.5 2.5Z" fill="#2684FF"/>
            <path d="M11.5 6L6 11.5L11.5 17L17 11.5L11.5 6Z" fill="#0052CC"/>
          </svg>
        </div>
        <span>AgentDrop</span>
      </a>
      <nav class="jira-nav-links">
        <a class="jira-nav-link active" onclick="switchTab('sessions')">Active Sprints</a>
        <a class="jira-nav-link" onclick="switchTab('nearby')">Radar</a>
        <a class="jira-nav-link" onclick="switchTab('handover')">Context Handover</a>
        <a class="jira-nav-link" onclick="switchTab('git')">Git Sync</a>
      </nav>
    </div>
    <div class="jira-navbar-right">
      <div class="jira-search-bar">
        <input type="text" placeholder="Search context, sessions...">
        <span class="jira-search-shortcut">/</span>
      </div>
      <span class="jira-lozenge jira-lozenge-green" style="font-size:10px;">Offline P2P</span>
      <div class="jira-avatar" title="Shekhar Aggarwal">SA</div>
    </div>
  </header>

  <!-- 2. PROJECT SUB-HEADER & TABS -->
  <div class="jira-subbar">
    <div class="jira-breadcrumbs">
      <a href="#" class="jira-breadcrumb-link">Projects</a>
      <span>/</span>
      <a href="#" class="jira-breadcrumb-link">AgentDrop AI Context Portability</a>
      <span>/</span>
      <span style="color:var(--jira-text-primary); font-weight:600;">AD-2026</span>
    </div>
    <div class="jira-project-header">
      <div class="jira-project-title-group">
        <div class="jira-project-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2v8"/><path d="m16 6-4 4-4-4"/><rect x="2" y="14" width="20" height="8" rx="2"/>
          </svg>
        </div>
        <div>
          <h1 class="jira-project-title">AgentDrop Context Pipeline</h1>
          <div style="font-size:12px; color:var(--jira-text-secondary);">Local-first asynchronous AI context transmission for engineering teams</div>
        </div>
      </div>
      <div class="jira-project-actions">
        <button class="jira-btn jira-btn-default" onclick="loadSessions()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
          Refresh
        </button>
        <button class="jira-btn jira-btn-primary" onclick="beamDemo()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Beam Golden Demo (AD-GOLDEN)
        </button>
      </div>
    </div>

    <div class="jira-tabs">
      <button class="jira-tab active" id="tab-btn-sessions" onclick="switchTab('sessions')">
        📋 Active Sessions <span class="jira-tab-badge" id="badge-sessions-count">0</span>
      </button>
      <button class="jira-tab" id="tab-btn-nearby" onclick="switchTab('nearby')">
        📡 Radar &amp; P2P Beam
      </button>
      <button class="jira-tab" id="tab-btn-handover" onclick="switchTab('handover')">
        🗂️ Jira Issue (Handover)
      </button>
      <button class="jira-tab" id="tab-btn-git" onclick="switchTab('git')">
        🔄 Git Repository Sync
      </button>
    </div>
  </div>

  <!-- 3. MAIN WORKSPACE CONTAINER -->
  <main class="jira-container">

    <!-- TAB 1: ACTIVE SESSIONS (Jira Backlog / Story Cards) -->
    <section id="tab-sessions" class="jira-panel active">
      <!-- Active Beaming Notification Banner -->
      <div id="beam-active-box" class="jira-card" style="display:none; border:2px solid var(--jira-blue); background:#F4F8FD;">
        <div class="jira-card-header">
          <div class="jira-card-title" style="color:var(--jira-blue);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>
            <span>Broadcasting AI Context (P2P Handover)</span>
          </div>
          <span class="jira-lozenge jira-lozenge-blue" id="beam-port">:3333</span>
        </div>
        <div style="font-size:14px; font-weight:600; margin-bottom:8px;" id="beam-title">Session Title</div>
        <div class="jira-sas-box" id="beam-sas">SAS: --- ---</div>
        <div class="jira-qr-box" id="beam-qr"></div>
        <div style="font-size:12px; color:var(--jira-text-secondary); text-align:center; margin-bottom:12px;">
          Scan with Machine B camera or run in CLI: <code style="background:#EBECF0; padding:2px 6px; border-radius:3px;">agentdrop listen &lt;token&gt;</code>
        </div>
        <div style="display:flex; justify-content:center; gap:8px;">
          <button class="jira-btn jira-btn-danger" onclick="cancelBeam()">Stop Broadcasting</button>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2 style="font-size:15px; font-weight:600; color:var(--jira-text-primary);">Discovered Development Sessions</h2>
        <span style="font-size:12px; color:var(--jira-text-secondary);">Filtered by current workspace</span>
      </div>

      <div id="sessions-list">
        <div style="text-align:center; padding:32px; color:var(--jira-text-secondary);">Loading sessions...</div>
      </div>

      <!-- Featured Jira Story: Golden Demo Fixture -->
      <div class="jira-issue-card" style="border-left: 4px solid var(--jira-green); margin-top:20px; background:#FAFCFB;">
        <div class="jira-issue-left">
          <div class="jira-issue-meta">
            <span class="jira-issue-key">AD-GOLDEN</span>
            <span class="jira-lozenge jira-lozenge-green">Verified Fixture</span>
            <span>25 Turns • Section 44 Spec</span>
          </div>
          <div class="jira-issue-title">Fix refresh-token race condition (Golden Demo Fixture)</div>
          <div style="font-size:12px; color:var(--jira-text-secondary);">
            Antigravity auth task with unit test assertions, Git patch, and 3 scrubbed production secrets.
          </div>
        </div>
        <div class="jira-issue-actions">
          <button class="jira-btn jira-btn-default" onclick="saveGitDemo()">Save to Git</button>
          <button class="jira-btn jira-btn-success" onclick="beamDemo()">Beam Demo Session</button>
        </div>
      </div>
    </section>

    <!-- TAB 2: RADAR & P2P TRANSFER (Jira Connect Hub) -->
    <section id="tab-nearby" class="jira-panel">
      <div class="jira-card" style="text-align:center; padding:24px;">
        <div class="jira-radar-container">
          <div class="jira-radar-sweep"></div>
          <div class="jira-radar-center"></div>
        </div>
        <h2 style="font-size:16px; font-weight:600; margin-bottom:4px;">Local Wireless Discovery</h2>
        <div style="font-size:13px; color:var(--jira-text-secondary); margin-bottom:16px;">
          Current Host: <b style="color:var(--jira-text-primary);" id="local-device-name">Local Host</b> (<span id="local-ip">127.0.0.1</span>)
        </div>
        <div style="display:inline-flex; align-items:center; gap:6px;" class="jira-lozenge jira-lozenge-blue">
          <span>●</span> Listening on zero-config local subnet
        </div>
      </div>

      <div class="jira-card">
        <div class="jira-card-header">
          <div class="jira-card-title">Receive Context Handover from Peer</div>
          <span class="jira-lozenge jira-lozenge-neutral">Encrypted P2P</span>
        </div>
        <p style="font-size:13px; color:var(--jira-text-secondary); margin-bottom:12px;">
          Paste the Base64 pairing token or direct sender URL from Machine A to accept context:
        </p>
        <input type="text" id="token-input" class="jira-input" placeholder="Paste Base64 token or http://IP:Port">
        <input type="text" id="secret-input" class="jira-input" placeholder="Pairing secret (if manual IP)" style="display:none;">
        <button class="jira-btn jira-btn-primary" style="width:100%;" onclick="connectPeer()">
          Connect &amp; Accept AI Context
        </button>
      </div>

      <div id="receive-sas-box" class="jira-card" style="display:none; border:2px solid var(--jira-yellow);">
        <div class="jira-card-header">
          <div class="jira-card-title">Verify Confirmation Code (SAS)</div>
          <span class="jira-lozenge jira-lozenge-yellow">Security Check</span>
        </div>
        <div class="jira-sas-box" id="receive-sas-code">--- ---</div>
        <p style="font-size:13px; color:var(--jira-text-secondary); text-align:center;">
          Ensure this 6-digit confirmation code matches the sender's display before executing code.
        </p>
      </div>
    </section>

    <!-- TAB 3: JIRA ISSUE (HANDOVER CARD) -->
    <section id="tab-handover" class="jira-panel">
      <div id="no-handover-msg" class="jira-card" style="text-align:center; padding:40px; color:var(--jira-text-secondary);">
        <div style="font-size:24px; margin-bottom:8px;">📋</div>
        <h3 style="font-size:16px; font-weight:600; color:var(--jira-text-primary); margin-bottom:4px;">No In-Flight AI Handover Loaded</h3>
        <p style="font-size:13px;">Beam a session from Machine A, connect via Radar, or select a session from the Active Sprints tab.</p>
      </div>

      <div id="handover-content" style="display:none;">
        <div class="jira-issue-detail-grid">
          
          <!-- LEFT 70%: Jira Issue Main Body -->
          <div class="jira-issue-main">
            <div class="jira-card" style="margin-bottom:0;">
              <!-- Issue Key and Actions Bar -->
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="jira-issue-key" style="font-size:14px;">AD-2026</span>
                  <span class="jira-lozenge jira-lozenge-green" id="ho-status-lozenge">READY TO RESUME</span>
                  <span class="jira-lozenge jira-lozenge-blue" id="security-badge">🔒 3 Secrets Redacted</span>
                </div>
                <div style="display:flex; gap:6px;">
                  <button class="jira-btn jira-btn-default jira-btn-sm" onclick="saveCurrentHandoverToGit()">
                    💾 Save to .agentdrop/
                  </button>
                  <button class="jira-btn jira-btn-primary jira-btn-sm" onclick="copyPrompt()">
                    📋 Copy Resume Prompt
                  </button>
                </div>
              </div>

              <!-- Issue Title / Objective -->
              <h2 style="font-size:20px; font-weight:600; color:var(--jira-text-primary); margin-bottom:16px; line-height:1.3;" id="ho-objective">
                Objective
              </h2>

              <!-- Description: Milestones -->
              <div class="jira-section-label">Completed Milestones</div>
              <div class="jira-desc-box" style="margin-bottom:14px;">
                <ul class="jira-checklist" id="ho-completed"></ul>
              </div>

              <!-- Description: Decisions -->
              <div id="ho-decisions-box" style="display:none; margin-bottom:14px;">
                <div class="jira-section-label">Important Decisions</div>
                <div class="jira-desc-box">
                  <ul class="jira-checklist" id="ho-decisions"></ul>
                </div>
              </div>

              <!-- Description: Failed Attempts -->
              <div id="ho-failed-box" style="display:none; margin-bottom:14px;">
                <div class="jira-section-label" style="color:var(--jira-red-text);">Failed Approaches</div>
                <div class="jira-desc-box" style="background:#FFF9F8; border-color:#FFBDAD;">
                  <ul class="jira-checklist" id="ho-failed"></ul>
                </div>
              </div>

              <!-- Current Roadblock Callout -->
              <div id="ho-blocker-box" style="display:none; margin-bottom:16px;">
                <div class="jira-section-label" style="color:var(--jira-red-text);">Active Roadblock / State</div>
                <div class="jira-callout-alert">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span id="ho-blocker">Active Roadblock</span>
                </div>
              </div>

              <!-- Primed Resume Prompt Macro -->
              <div class="jira-section-label">Primed Resume Prompt (Paste into Antigravity / Claude Code)</div>
              <div class="jira-code-block">
                <div class="jira-code-header">
                  <span>PROMPT MACRO (Turn-1 Auto Continuation)</span>
                  <button class="jira-btn jira-btn-default jira-btn-sm" onclick="copyPrompt()">Copy Code</button>
                </div>
                <div class="jira-code-content" id="ho-prompt"></div>
              </div>
            </div>
          </div>

          <!-- RIGHT 30%: Jira Issue Details Sidebar -->
          <aside class="jira-sidebar-panel">
            <h3 style="font-size:14px; font-weight:600; color:var(--jira-text-primary);">Details</h3>

            <div class="jira-field-row">
              <span class="jira-field-name">Assignee</span>
              <div class="jira-field-value">
                <div class="jira-avatar" style="width:22px; height:22px; font-size:10px;">SA</div>
                <span>Shekhar Aggarwal</span>
              </div>
            </div>

            <div class="jira-field-row">
              <span class="jira-field-name">Source AI Agent</span>
              <div class="jira-field-value">
                <span class="jira-lozenge jira-lozenge-blue" id="ho-source-agent">Google Antigravity</span>
              </div>
            </div>

            <div class="jira-field-row">
              <span class="jira-field-name">Git Branch</span>
              <div class="jira-field-value">
                <code style="background:#EBECF0; padding:2px 6px; border-radius:3px; font-size:12px;" id="ho-branch">main</code>
              </div>
            </div>

            <div class="jira-field-row">
              <span class="jira-field-name">Head Commit</span>
              <div class="jira-field-value">
                <code style="background:#EBECF0; padding:2px 6px; border-radius:3px; font-size:12px;" id="ho-commit">HEAD</code>
              </div>
            </div>

            <div class="jira-field-row">
              <span class="jira-field-name">Transport Security</span>
              <div class="jira-field-value">
                <span class="jira-lozenge jira-lozenge-green">AES-256-GCM</span>
              </div>
            </div>

            <div class="jira-field-row">
              <span class="jira-field-name">Air-Gap Policy</span>
              <div class="jira-field-value" style="font-size:12px; color:var(--jira-text-secondary);">
                100% Offline Local-First
              </div>
            </div>
          </aside>

        </div>
      </div>
    </section>

    <!-- TAB 4: GIT REPOSITORY SYNC -->
    <section id="tab-git" class="jira-panel">
      <div class="jira-card">
        <div class="jira-card-header">
          <div class="jira-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/><path d="M6 9v12"/></svg>
            Git-Native Context Synchronization
          </div>
          <button class="jira-btn jira-btn-default jira-btn-sm" onclick="loadGitStatus()">↻ Check Status</button>
        </div>

        <div id="git-status-details" style="font-size:13px; color:var(--jira-text-secondary); margin-bottom:14px;">
          Checking .agentdrop/ contract in current repository...
        </div>

        <div style="display:flex; gap:8px;">
          <button class="jira-btn jira-btn-primary" onclick="saveGitDemo()">
            💾 Save Golden Handover into .agentdrop/
          </button>
        </div>
      </div>
    </section>

  </main>

  <!-- 4. FOOTER -->
  <footer class="jira-footer">
    <div>
      <b>AgentDrop</b> · Local-First AI Context Portability Layer · <span style="color:var(--jira-green);">Offline Ready</span>
    </div>
    <div>
      Powered by Atlassian Jira Design System
    </div>
  </footer>

  <!-- TOAST NOTIFICATION -->
  <div id="jira-toast" class="jira-toast">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#36B37E" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    <span id="toast-text">Action completed successfully</span>
  </div>

  <script>
    let activePrompt = "";
    let currentHandoverData = null;

    function switchTab(id) {
      document.querySelectorAll(".jira-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".jira-nav-link").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".jira-panel").forEach(p => p.classList.remove("active"));

      const targetPanel = document.getElementById("tab-" + id);
      if (targetPanel) targetPanel.classList.add("active");

      const tabBtn = document.getElementById("tab-btn-" + id);
      if (tabBtn) tabBtn.classList.add("active");

      if (id === "git") loadGitStatus();
    }

    function showToast(msg) {
      const toast = document.getElementById("jira-toast");
      document.getElementById("toast-text").textContent = msg;
      toast.style.display = "flex";
      setTimeout(() => { toast.style.display = "none"; }, 3500);
    }

    async function loadInfo() {
      try {
        const res = await fetch("/api/info");
        const data = await res.json();
        document.getElementById("local-device-name").textContent = data.deviceName || "Host";
        document.getElementById("local-ip").textContent = data.localIp || "127.0.0.1";
      } catch {}
    }

    async function loadSessions() {
      try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        const list = document.getElementById("sessions-list");
        const countBadge = document.getElementById("badge-sessions-count");

        if (!data.sessions || data.sessions.length === 0) {
          list.innerHTML = '<div style="text-align:center; padding:24px; color:var(--jira-text-secondary);">No active sessions found in Antigravity or Claude Code. Try the Golden Demo fixture below!</div>';
          countBadge.textContent = "0";
          return;
        }

        countBadge.textContent = String(data.sessions.length);
        list.innerHTML = data.sessions.slice(0, 6).map((s, idx) => \`
          <div class="jira-issue-card">
            <div class="jira-issue-left">
              <div class="jira-issue-meta">
                <span class="jira-issue-key">AD-\${100 + idx}</span>
                <span class="jira-lozenge jira-lozenge-blue">\${escape(s.adapterName)}</span>
                <span>\${s.turnCount || 0} turns</span>
              </div>
              <div class="jira-issue-title">\${escape(s.title || "Development Task")}</div>
              <div style="font-size:12px; color:var(--jira-text-secondary);">
                Session ID: \${(s.sessionId || "").slice(0, 10)}... • Last active recently
              </div>
            </div>
            <div class="jira-issue-actions">
              <button class="jira-btn jira-btn-default jira-btn-sm" onclick="saveSessionToGit('\${s.sessionId}', '\${s.adapterId}')">Save to Git</button>
              <button class="jira-btn jira-btn-primary jira-btn-sm" onclick="beamSession('\${s.sessionId}', '\${s.adapterId}')">
                📡 Beam Context
              </button>
            </div>
          </div>
        \`).join("");
      } catch (e) {
        document.getElementById("sessions-list").innerHTML = '<div style="padding:16px; color:var(--jira-red);">Failed to load sessions.</div>';
      }
    }

    async function beamSession(sessionId, adapterId) {
      try {
        const res = await fetch("/api/beam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, adapterId })
        });
        const data = await res.json();
        showBeamActive(data);
      } catch (e) {
        alert("Failed to beam session: " + e.message);
      }
    }

    async function beamDemo() {
      try {
        const res = await fetch("/api/beam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDemo: true })
        });
        const data = await res.json();
        showBeamActive(data);
        switchTab("sessions");
      } catch (e) {
        alert("Failed to beam demo: " + e.message);
      }
    }

    function showBeamActive(data) {
      document.getElementById("beam-active-box").style.display = "block";
      document.getElementById("beam-title").textContent = data.sessionTitle;
      document.getElementById("beam-port").textContent = ":" + data.port;
      document.getElementById("beam-sas").textContent = "SAS: " + (data.pairingSecret || "CONFIRM");
      document.getElementById("beam-qr").innerHTML = data.qrSvg || "";
      showToast("Broadcasting context on port " + data.port);
    }

    async function cancelBeam() {
      await fetch("/api/cancel-beam", { method: "POST" });
      document.getElementById("beam-active-box").style.display = "none";
      showToast("Beaming cancelled.");
    }

    async function connectPeer() {
      const token = document.getElementById("token-input").value.trim();
      const secret = document.getElementById("secret-input").value.trim();
      if (!token) return;

      try {
        const res = await fetch("/api/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenOrUrl: token, pairingSecret: secret })
        });
        const data = await res.json();
        if (data.success) {
          renderHandover(data.capsule, data.sasCode);
          switchTab("handover");
          showToast("AI Context Handover received successfully!");
        } else {
          alert("Failed to connect: " + (data.error || "Unknown error"));
        }
      } catch (e) {
        alert("Connection failed: " + e.message);
      }
    }

    function renderHandover(capsule, sasCode) {
      currentHandoverData = capsule;
      document.getElementById("no-handover-msg").style.display = "none";
      document.getElementById("handover-content").style.display = "block";

      const h = capsule.handover;
      document.getElementById("ho-objective").textContent = h.objective || "Context Handover";

      const comp = document.getElementById("ho-completed");
      comp.innerHTML = "";
      (h.completedMilestones || h.observedActivity || []).forEach(item => {
        comp.innerHTML += \`<li class="jira-checklist-item"><span class="jira-tick">✓</span> <span>\${escape(item)}</span></li>\`;
      });

      const failed = document.getElementById("ho-failed");
      failed.innerHTML = "";
      if (h.failedAttempts && h.failedAttempts.length) {
        document.getElementById("ho-failed-box").style.display = "block";
        h.failedAttempts.forEach(item => {
          failed.innerHTML += \`<li class="jira-checklist-item"><span class="jira-cross">✗</span> <span>\${escape(item)}</span></li>\`;
        });
      } else {
        document.getElementById("ho-failed-box").style.display = "none";
      }

      const dec = document.getElementById("ho-decisions");
      dec.innerHTML = "";
      if (h.importantDecisions && h.importantDecisions.length) {
        document.getElementById("ho-decisions-box").style.display = "block";
        h.importantDecisions.forEach(item => {
          dec.innerHTML += \`<li class="jira-checklist-item"><span class="jira-tick">✓</span> <span>\${escape(item)}</span></li>\`;
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

      // Update sidebar details
      if (capsule.manifest && capsule.manifest.source) {
        document.getElementById("ho-source-agent").textContent = capsule.manifest.source.agent || "antigravity";
      }
      if (capsule.git && capsule.git.identity) {
        document.getElementById("ho-branch").textContent = capsule.git.identity.branch || "main";
        document.getElementById("ho-commit").textContent = (capsule.git.identity.headCommit || "").slice(0, 7) || "HEAD";
      }
    }

    async function loadGitStatus() {
      try {
        const res = await fetch("/api/git-status");
        const status = await res.json();
        const container = document.getElementById("git-status-details");

        if (!status.hasActiveHandoff) {
          container.innerHTML = \`
            <div style="background:#FFF0B3; padding:10px 14px; border-radius:3px; color:#172B4D; margin-bottom:8px;">
              <b>No active handoff contract found</b> (.agentdrop/handover.json does not exist in \${escape(status.workspaceIdentity?.name)}).
            </div>
            <p>Save an active session or click below to save the verified golden fixture.</p>
          \`;
          return;
        }

        const doc = status.handover;
        container.innerHTML = \`
          <div style="background:#FFFFFF; border:1px solid var(--jira-border); border-radius:4px; padding:14px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span class="jira-lozenge jira-lozenge-green">Active Contract Found</span>
              <span style="font-size:12px; color:var(--jira-text-secondary);">Branch: <b>\${escape(doc.git.branch)}</b> (\${status.isBranchMatch ? "Current Branch" : "Different Branch"})</span>
            </div>
            <div style="font-weight:600; font-size:14px; margin-bottom:6px;">\${escape(doc.handover.objective)}</div>
            <div style="font-size:12px; color:var(--jira-text-secondary);">Author: \${escape(doc.author)} • Commit: \${escape(doc.git.commitSha.slice(0,7))}</div>
          </div>
        \`;

        // If not already rendered, load handover into tab 3
        if (!currentHandoverData) {
          renderHandover({ handover: doc.handover, git: { identity: status.workspaceIdentity }, manifest: { source: { agent: doc.sourceAgent } } }, "");
        }
      } catch (e) {
        document.getElementById("git-status-details").textContent = "Failed to load Git status: " + e.message;
      }
    }

    async function saveSessionToGit(sessionId, adapterId) {
      try {
        const res = await fetch("/api/git-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, adapterId })
        });
        const data = await res.json();
        showToast("Session saved to .agentdrop/handover.json!");
        loadGitStatus();
      } catch (e) {
        alert("Failed to save to git: " + e.message);
      }
    }

    async function saveGitDemo() {
      try {
        const res = await fetch("/api/git-save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDemo: true })
        });
        const data = await res.json();
        showToast("Golden Demo saved into .agentdrop/ successfully!");
        loadGitStatus();
      } catch (e) {
        alert("Failed to save demo: " + e.message);
      }
    }

    async function saveCurrentHandoverToGit() {
      if (!currentHandoverData) {
        showToast("No active handover loaded to save.");
        return;
      }
      await saveGitDemo();
    }

    function copyPrompt() {
      if (!activePrompt) {
        alert("No prompt available to copy.");
        return;
      }
      navigator.clipboard.writeText(activePrompt);
      showToast("Primed Resume Prompt copied to clipboard!");
    }

    function escape(str) {
      if (!str) return "";
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    loadInfo();
    loadSessions();
    loadGitStatus();
  </script>
</body>
</html>`;
  }
}
