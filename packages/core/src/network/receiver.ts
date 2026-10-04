/**
 * AgentDrop - Local Receiver Client & Staging Manager
 * Authoritative Implementation Plan: Sections 27, 28, 29, 32, 34, 35, 36
 */

import http from "node:http";
import { EventEmitter } from "node:events";
import { AgentDropCrypto, KeyPair, DerivedKeys } from "../security/crypto.js";
import { HandshakeRequest, HandshakeResponse, QRPairingPayload, TransferState } from "./protocol.js";
import { CapsuleUnpacker, UnpackResult } from "../capsule/unpacker.js";

export class AgentDropReceiver extends EventEmitter {
  private keyPair: KeyPair;
  private pairingPayload: QRPairingPayload | null = null;
  private derivedKeys: DerivedKeys | null = null;
  private currentState: TransferState = "IDLE";
  private deviceName: string;
  private stagingDirectory: string;

  constructor(stagingDirectory: string, deviceName?: string) {
    super();
    this.keyPair = AgentDropCrypto.generateKeyPair();
    this.stagingDirectory = stagingDirectory;
    this.deviceName = deviceName || process.env.COMPUTERNAME || process.env.HOSTNAME || "AgentDrop-Receiver";
  }

  public getState(): TransferState {
    return this.currentState;
  }

  private setState(newState: TransferState, details?: any): void {
    this.currentState = newState;
    this.emit("stateChange", newState, details);
  }

  /**
   * Step 1: Connects to Sender using QR/mDNS pairing payload and performs ECDH handshake.
   * Derives matching SAS code for visual verification.
   */
  public async initiateHandshake(payload: QRPairingPayload): Promise<{ sasCode: string; senderDevice: string }> {
    this.pairingPayload = payload;
    this.setState("PAIRING", { transferId: payload.transferId });

    const requestBody: HandshakeRequest = {
      transferId: payload.transferId,
      pairingSecret: payload.pairingSecret,
      receiverPub: this.keyPair.publicKey,
      receiverDeviceName: this.deviceName
    };

    const handshakeUrl = new URL("/pair", payload.endpoint);

    const response = await this.postJson<HandshakeResponse>(handshakeUrl, requestBody);

    if (!response.ok || !response.senderPub) {
      this.setState("FAILED", { error: response.error || "Handshake rejected by sender" });
      throw new Error(`Pairing Error: ${response.error || "Handshake rejected by sender"}`);
    }

    // Compute shared secret and derive keys & SAS code
    const actualTransferId = response.transferId || payload.transferId;
    const sharedSecret = AgentDropCrypto.computeSharedSecret(this.keyPair.privateKey, response.senderPub);
    this.derivedKeys = AgentDropCrypto.deriveKeyMaterial(
      sharedSecret,
      actualTransferId,
      response.senderPub,
      this.keyPair.publicKey
    );

    this.setState("VERIFYING_SAS", { sasCode: this.derivedKeys.sasCode });

    return {
      sasCode: this.derivedKeys.sasCode,
      senderDevice: payload.deviceName
    };
  }

  /**
   * Step 2: Enforces Invariant: Receiver Approval (Section 35).
   * User explicitly confirms SAS match and accepts the incoming handover.
   * Downloads, decrypts, validates, and unpacks the capsule into the staging area.
   */
  public async acceptHandover(): Promise<UnpackResult> {
    if (!this.pairingPayload || !this.derivedKeys) {
      throw new Error("Cannot accept handover before completing cryptographic handshake");
    }

    this.setState("TRANSFERRING");

    const transferUrl = new URL("/transfer", this.pairingPayload.endpoint);

    // 1. Download encrypted package
    const encryptedBuffer = await this.getBytes(transferUrl);

    this.setState("VERIFYING");

    // 2. Decrypt with derived AES-256-GCM key (throws if tampered)
    const decryptedBuffer = AgentDropCrypto.decrypt(this.derivedKeys.aesKey, encryptedBuffer);
    const serializedCapsule = decryptedBuffer.toString("utf-8");

    this.setState("UNPACKING");

    // 3. Bounds-check, validate schema, and unpack to staging directory
    const unpackResult = CapsuleUnpacker.unpack(serializedCapsule, this.stagingDirectory);

    this.setState("HANDOVER_READY", {
      objective: unpackResult.capsule.handover.objective,
      totalBytes: unpackResult.totalBytes
    });

    return unpackResult;
  }

  private postJson<T>(url: URL, body: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
          }
        },
        res => {
          let responseData = "";
          res.on("data", chunk => (responseData += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(responseData);
              resolve(parsed as T);
            } catch (err) {
              reject(new Error(`Invalid JSON response: ${responseData}`));
            }
          });
        }
      );

      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  private getBytes(url: URL): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const req = http.get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`Transfer failed with HTTP status ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      });

      req.on("error", reject);
    });
  }
}
