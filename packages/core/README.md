# agentdrop-portability-core

> Headless engine for AgentDrop — Local-First AI Context Portability & Transmission Layer

[![npm version](https://img.shields.io/npm/v/agentdrop-portability-core.svg?color=blue)](https://www.npmjs.com/package/agentdrop-portability-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`agentdrop-portability-core` is the core TypeScript library powering AgentDrop. It provides schema definitions, agent adapters, security scanners, Git identity collectors, and P2P transport protocols.

---

## 📦 Installation

```bash
npm install agentdrop-portability-core
```

---

## 🔑 Key Modules

- `AntigravityAdapter` & `ClaudeCodeAdapter`: Discover and extract sessions from local IDE brain directories.
- `DeterministicExtractor`: Synthesizes handover objectives, roadblocks, decisions, and resume prompts without external LLM calls.
- `PreSanitizer` & `SecurityScanner`: Pattern-based redaction of API keys (`sk-`, `ghp_`, tokens) and sensitive files.
- `CapsulePackager` & `CapsuleUnpacker`: Versioned capsule packing (`.aicapsule`), verification, and boundary validation.
- `AgentDropSender` & `AgentDropReceiver`: Offline P2P transfer over HTTP streams using ECDH + HKDF + AES-256-GCM encryption.

---

## 📄 License

MIT © [Anshul Vats](https://github.com/AnshulVatsOfficial)
