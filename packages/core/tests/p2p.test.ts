/**
 * AgentDrop - P2P Transport & Cryptographic Handshake Tests
 * Authoritative Plan: Section 46 (npm run test:p2p)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import { AgentDropCrypto } from "../src/security/crypto.js";
import { AgentDropSender } from "../src/network/sender.js";
import { AgentDropReceiver } from "../src/network/receiver.js";
import { CapsulePackager } from "../src/capsule/packager.js";
import { AiHandoverState, GitSnapshot } from "../src/capsule/schema.js";

describe("P2P Transport, Crypto & Handshake", () => {
  const stagingDir = path.resolve("./temp-p2p-staging");

  before(async () => {
    await fs.mkdir(stagingDir, { recursive: true });
  });

  after(async () => {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  });

  it("should derive matching AES key and SAS code on both ends using ECDH + HKDF", () => {
    const senderKeys = AgentDropCrypto.generateKeyPair();
    const receiverKeys = AgentDropCrypto.generateKeyPair();
    const transferId = "test-transfer-uuid-1234";

    // 1. Sender computes shared secret and derives key material
    const senderSecret = AgentDropCrypto.computeSharedSecret(senderKeys.privateKey, receiverKeys.publicKey);
    const senderDerived = AgentDropCrypto.deriveKeyMaterial(
      senderSecret,
      transferId,
      senderKeys.publicKey,
      receiverKeys.publicKey
    );

    // 2. Receiver computes shared secret and derives key material
    const receiverSecret = AgentDropCrypto.computeSharedSecret(receiverKeys.privateKey, senderKeys.publicKey);
    const receiverDerived = AgentDropCrypto.deriveKeyMaterial(
      receiverSecret,
      transferId,
      senderKeys.publicKey,
      receiverKeys.publicKey
    );

    // 3. Verify exact key match and SAS visual code match
    assert.deepStrictEqual(senderDerived.aesKey, receiverDerived.aesKey, "Derived AES keys do not match");
    assert.strictEqual(senderDerived.sasCode, receiverDerived.sasCode, "SAS confirmation codes do not match");
    assert.strictEqual(senderDerived.sasCode.length, 6, "SAS code must be 6 digits");
  });

  it("should encrypt and decrypt payloads with AES-256-GCM and detect tampering", () => {
    const key = Buffer.alloc(32, 0x42);
    const plaintext = "Top secret AI development context with uncommitted git diff";

    const encrypted = AgentDropCrypto.encrypt(key, plaintext);
    assert.ok(encrypted.length > plaintext.length);

    // Valid decryption
    const decrypted = AgentDropCrypto.decrypt(key, encrypted).toString("utf-8");
    assert.strictEqual(decrypted, plaintext);

    // Tamper detection
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0x01; // flip one bit in ciphertext
    assert.throws(() => AgentDropCrypto.decrypt(key, tampered), /Unsupported state or unable to authenticate data/);
  });

  it("should perform full P2P transfer over local HTTP stream with single-use pairing token", async () => {
    const mockHandover: AiHandoverState = {
      objective: "Fix concurrent token rotation race condition",
      completedMilestones: [],
      observedActivity: ["Modified 1 file"],
      failedAttempts: [],
      currentBlockerOrActiveState: "Testing token replay prevention",
      criticalFiles: ["src/TokenService.ts"],
      importantDecisions: ["Redis token lock"],
      environmentConstraints: ["Node 20+"],
      suggestedNextAction: "Run unit test suite",
      primedResumePrompt: "Please resume implementation."
    };

    const mockGit: GitSnapshot = {
      identity: {
        name: "cadence-api",
        branch: "feature/auth",
        headCommit: "abc12345",
        isClean: false,
        repositoryFingerprint: "repo-fp-12345678"
      },
      workingTreePatch: "diff --git a/src/Token.ts\n+ token rotation",
      stagedPatch: "",
      untrackedSourceFiles: []
    };

    const { serialized } = CapsulePackager.pack({
      sourceAgent: "antigravity",
      workspaceName: "cadence-api",
      handover: mockHandover,
      git: mockGit
    });

    // 1. Start Sender on random ephemeral port
    const sender = new AgentDropSender(serialized, "Sender-Machine-A");
    const port = await sender.start(0);
    assert.ok(port > 0, "Sender failed to bind to port");

    try {
      // 2. Generate Pairing Payload (representing QR code)
      const qrPayload = sender.getPairingPayload("127.0.0.1");
      assert.strictEqual(qrPayload.endpoint, `http://127.0.0.1:${port}`);

      // 3. Receiver connects using QR payload and initiates handshake
      const receiver = new AgentDropReceiver(stagingDir, "Receiver-Machine-B");
      const { sasCode, senderDevice } = await receiver.initiateHandshake(qrPayload);

      assert.strictEqual(senderDevice, "Sender-Machine-A");
      assert.strictEqual(sasCode.length, 6);

      // 4. Verify Single-Use Token: A second connection with the same pairingSecret must fail
      const attackerReceiver = new AgentDropReceiver(stagingDir, "Attacker-Machine-C");
      await assert.rejects(
        () => attackerReceiver.initiateHandshake(qrPayload),
        /Invalid or expired pairing secret/
      );

      // 5. User explicitly clicks "Accept Handover" on Receiver
      const result = await receiver.acceptHandover();

      assert.strictEqual(result.capsule.handover.objective, mockHandover.objective);
      assert.strictEqual(result.capsule.git.identity.name, "cadence-api");
      assert.strictEqual(receiver.getState(), "HANDOVER_READY");
      assert.strictEqual(sender.getState(), "COMPLETE");
    } finally {
      await sender.close();
    }
  });
});
