/**
 * AgentDrop - Transfer Protocol & State Machine Definitions
 * Authoritative Implementation Plan: Sections 28, 29, 34
 */

export type TransferState =
  | "IDLE"
  | "DISCOVERING"
  | "PAIRING"
  | "VERIFYING_SAS"
  | "WAITING_ACCEPT"
  | "TRANSFERRING"
  | "VERIFYING"
  | "UNPACKING"
  | "WORKSPACE_CHECK"
  | "HANDOVER_READY"
  | "NATIVE_RESTORE_ATTEMPT"
  | "COMPLETE"
  | "FAILED";

export interface QRPairingPayload {
  v: 1;
  transferId: string;
  endpoint: string; // http://<ip>:<port>
  senderPub: string;
  pairingSecret: string;
  deviceName: string;
}

export interface HandshakeRequest {
  transferId: string;
  pairingSecret: string;
  receiverPub: string;
  receiverDeviceName: string;
}

export interface HandshakeResponse {
  ok: boolean;
  error?: string;
  senderPub?: string;
  transferId?: string;
}

export interface TransferHeader {
  transferId: string;
  payloadBytes: number;
}
