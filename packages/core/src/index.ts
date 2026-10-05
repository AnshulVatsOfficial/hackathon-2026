/**
 * @agentdrop/core - Public API Exports
 */

// Capsule
export * from "./capsule/schema.js";
export * from "./capsule/version.js";
export * from "./capsule/validator.js";
export * from "./capsule/packager.js";
export * from "./capsule/unpacker.js";

// Security & Crypto
export * from "./security/filePolicy.js";
export * from "./security/scanner.js";
export * from "./security/preSanitizer.js";
export * from "./security/crypto.js";

// Git
export * from "./git/identity.js";
export * from "./git/snapshot.js";
export * from "./git/safety.js";

// Context
export * from "./context/deterministicExtractor.js";

// Network & Protocol
export * from "./network/protocol.js";
export * from "./network/sender.js";
export * from "./network/receiver.js";
export * from "./network/discovery.js";

// Adapters
export * from "./adapters/AgentAdapter.js";
export * from "./adapters/antigravity/AntigravityAdapter.js";
export * from "./adapters/claude/ClaudeCodeAdapter.js";

// Git & Remote Asynchronous Sync
export * from "./sync/SyncTypes.js";
export * from "./sync/GitRepoProvider.js";
export * from "./sync/RemoteSyncProvider.js";
export * from "./sync/ContextSyncManager.js";
