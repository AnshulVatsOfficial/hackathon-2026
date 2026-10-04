/**
 * AgentDrop - Cryptographic Handshake & Authenticated Cipher
 * Authoritative Implementation Plan: Sections 29, 30, 31, 32, 33
 */

import crypto from "node:crypto";

export interface KeyPair {
  publicKey: string;  // Base64
  privateKey: string; // Base64
}

export interface DerivedKeys {
  aesKey: Buffer;
  sasCode: string; // 6-digit zero-padded confirmation string
}

export class AgentDropCrypto {
  /**
   * Generates an ephemeral ECDH keypair using prime256v1 (NIST P-256).
   */
  static generateKeyPair(): KeyPair {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    return {
      publicKey: ecdh.getPublicKey("base64"),
      privateKey: ecdh.getPrivateKey("base64")
    };
  }

  /**
   * Computes the raw ECDH shared secret from local private key and remote public key.
   */
  static computeSharedSecret(localPrivateKeyBase64: string, remotePublicKeyBase64: string): Buffer {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(localPrivateKeyBase64, "base64"));
    return ecdh.computeSecret(Buffer.from(remotePublicKeyBase64, "base64"));
  }

  /**
   * Derives symmetric AES-256-GCM key and 6-digit Short Authentication String (SAS)
   * using HKDF-SHA256 bound to handshake metadata.
   */
  static deriveKeyMaterial(
    sharedSecret: Buffer,
    transferId: string,
    senderPublicKey: string,
    receiverPublicKey: string
  ): DerivedKeys {
    // Deterministic handshake salt binding protocol version, transferId, and both keys
    const handshakeSalt = crypto
      .createHash("sha256")
      .update(`v1:${transferId}:${senderPublicKey}:${receiverPublicKey}`, "utf-8")
      .digest();

    // 1. Derive 32-byte AES-256-GCM symmetric key
    const aesKey = Buffer.from(
      crypto.hkdfSync("sha256", sharedSecret, handshakeSalt, Buffer.from("agentdrop-aes-key", "utf-8"), 32)
    );

    // 2. Derive 4 bytes for Short Authentication String (SAS)
    const sasBytes = Buffer.from(
      crypto.hkdfSync("sha256", sharedSecret, handshakeSalt, Buffer.from("agentdrop-sas", "utf-8"), 4)
    );

    // Deterministic fixed mapping to 6-digit decimal string
    const sasInt = sasBytes.readUInt32BE(0);
    const sasCode = (sasInt % 1_000_000).toString().padStart(6, "0");

    return {
      aesKey,
      sasCode
    };
  }

  /**
   * Encrypts a payload with AES-256-GCM.
   * Format: [12-byte IV] + [16-byte GCM Tag] + [Ciphertext]
   */
  static encrypt(aesKey: Buffer, plaintext: string | Buffer): Buffer {
    const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf-8") : plaintext;
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, ciphertext]);
  }

  /**
   * Decrypts and authenticates an AES-256-GCM encrypted package.
   * Throws an error if ciphertext or tag was tampered with.
   */
  static decrypt(aesKey: Buffer, encryptedPackage: Buffer): Buffer {
    if (encryptedPackage.length < 28) {
      throw new Error("Decryption Error: Encrypted package too short to contain IV and Tag");
    }

    const iv = encryptedPackage.subarray(0, 12);
    const tag = encryptedPackage.subarray(12, 28);
    const ciphertext = encryptedPackage.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Generates a high-entropy single-use pairing secret.
   */
  static generatePairingSecret(): string {
    return crypto.randomBytes(16).toString("base64url");
  }
}
