/**
 * AgentDrop - Local Sender HTTP Streaming Server
 * Authoritative Implementation Plan: Sections 27, 28, 29, 32, 34, 35
 */

import http from "node:http";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { AddressInfo } from "node:net";
import { AgentDropCrypto, KeyPair, DerivedKeys } from "../security/crypto.js";
import { HandshakeRequest, HandshakeResponse, QRPairingPayload, TransferState } from "./protocol.js";

export interface SenderEvents {
  stateChange: (state: TransferState, details?: any) => void;
  peerConnected: (deviceName: string, sasCode: string) => void;
  transferComplete: (bytesSent: number) => void;
  error: (err: Error) => void;
}

export class AgentDropSender extends EventEmitter {
  private server: http.Server | null = null;
  private transferId: string;
  private keyPair: KeyPair;
  private pairingSecret: string | null;
  private capsuleData: string;
  private derivedKeys: DerivedKeys | null = null;
  private receiverPub: string | null = null;
  private currentState: TransferState = "IDLE";
  private deviceName: string;
  private port: number = 0;

  constructor(capsuleData: string, deviceName?: string) {
    super();
    this.capsuleData = capsuleData;
    this.transferId = crypto.randomUUID();
    this.keyPair = AgentDropCrypto.generateKeyPair();
    this.pairingSecret = AgentDropCrypto.generatePairingSecret();
    this.deviceName = deviceName || process.env.COMPUTERNAME || process.env.HOSTNAME || "AgentDrop-Sender";
  }

  public getTransferId(): string {
    return this.transferId;
  }

  public getState(): TransferState {
    return this.currentState;
  }

  private setState(newState: TransferState, details?: any): void {
    this.currentState = newState;
    this.emit("stateChange", newState, details);
  }

  /**
   * Starts the local HTTP sender on an ephemeral or specified port.
   */
  public async start(requestedPort: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on("error", err => {
        this.setState("FAILED", { error: err.message });
        this.emit("error", err);
        reject(err);
      });

      this.server.listen(requestedPort, "0.0.0.0", () => {
        const address = this.server?.address() as AddressInfo;
        this.port = address.port;
        this.setState("DISCOVERING", { port: this.port });
        resolve(this.port);
      });
    });
  }

  /**
   * Generates the QR pairing payload.
   */
  public getPairingPayload(hostIp: string = "127.0.0.1"): QRPairingPayload {
    if (!this.pairingSecret) {
      throw new Error("Pairing secret has already been consumed or invalidated");
    }

    return {
      v: 1,
      transferId: this.transferId,
      endpoint: `http://${hostIp}:${this.port}`,
      senderPub: this.keyPair.publicKey,
      pairingSecret: this.pairingSecret,
      deviceName: this.deviceName
    };
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Enable CORS for local VS Code webviews / clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/pair" && req.method === "POST") {
      this.handlePairing(req, res);
      return;
    }

    if (url.pathname === "/transfer" && req.method === "GET") {
      this.handleTransfer(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Endpoint not found" }));
  }

  private handlePairing(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      try {
        const data: HandshakeRequest = JSON.parse(body);

        // 1. Verify transfer ID (allow matching ID, empty, or cli-transfer)
        if (data.transferId && data.transferId !== "cli-transfer" && data.transferId !== this.transferId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid transfer ID" }));
          return;
        }

        // 2. Verify and invalidate single-use pairing secret
        if (!this.pairingSecret || data.pairingSecret !== this.pairingSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid or expired pairing secret" }));
          return;
        }

        // Single-use: immediately consume secret
        this.pairingSecret = null;
        this.receiverPub = data.receiverPub;

        // 3. Compute ECDH shared secret & HKDF key derivation
        const sharedSecret = AgentDropCrypto.computeSharedSecret(this.keyPair.privateKey, this.receiverPub);
        this.derivedKeys = AgentDropCrypto.deriveKeyMaterial(
          sharedSecret,
          this.transferId,
          this.keyPair.publicKey,
          this.receiverPub
        );

        this.setState("VERIFYING_SAS", { sasCode: this.derivedKeys.sasCode });
        this.emit("peerConnected", data.receiverDeviceName, this.derivedKeys.sasCode);

        const response: HandshakeResponse = {
          ok: true,
          senderPub: this.keyPair.publicKey,
          transferId: this.transferId
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err?.message }));
      }
    });
  }

  private handleTransfer(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.derivedKeys) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Handshake not completed" }));
      return;
    }

    try {
      this.setState("TRANSFERRING");

      // Encrypt capsule payload with derived AES-256-GCM key
      const encryptedPackage = AgentDropCrypto.encrypt(this.derivedKeys.aesKey, this.capsuleData);

      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": encryptedPackage.length,
        "X-Transfer-Id": this.transferId
      });

      res.end(encryptedPackage, () => {
        this.setState("COMPLETE", { bytesSent: encryptedPackage.length });
        this.emit("transferComplete", encryptedPackage.length);
      });
    } catch (err: any) {
      this.setState("FAILED", { error: err?.message });
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message }));
    }
  }

  /**
   * Shuts down the sender HTTP server cleanly.
   */
  public async close(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
