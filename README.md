# AgentDrop — AI Context Portability Layer

> **"It doesn't move a chat window. It moves the AI's working context."**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests: 27 Passing](https://img.shields.io/badge/Tests-27%20Passing-brightgreen.svg)]()
[![Local-First](https://img.shields.io/badge/Architecture-Local--First%20%7C%20Git--Native-blue.svg)]()
[![Zero Cloud Leak](https://img.shields.io/badge/Privacy-Zero%20Cloud%20Leak-success.svg)]()

AgentDrop is a **local-first, vendor-neutral AI coding context portability layer** designed for developer teams and multi-device workflows.

---

## The Real-World Problem

When **Developer D1** on **Machine M1** works on a feature using an AI coding agent (like Google Antigravity or Claude Code):
- D1 provides detailed requirements, refines approaches, and rejects bad alternatives.
- The AI modifies files, runs tests, and hits an edge-case assertion blocker.
- D1 pushes the unfinished code to **GitHub**.

Later, **Developer D2** on **Machine M2** clones the repository from GitHub.
- Git provides the code changes, but **none of the AI context**.
- D2 has **no record** of D1's original prompt, the AI's decisions, what approaches failed, or why tests are breaking.
- D2 is forced to manually re-explain the entire feature to their AI from scratch.

---

## The AgentDrop Solution

AgentDrop binds the AI agent's working state directly to the **Git & GitHub lifecycle**:

```
[Developer D1 on Machine M1]
  │  Works with Antigravity or Claude Code
  │  Runs: agentdrop save
  ▼
[.agentdrop/ in Repo Root]
  ├── handover.json  (Structured JSON contract: objective, decisions, blocker, prompt)
  └── HANDOVER.md    (Human-readable GitHub Markdown viewable directly on GitHub.com!)
  │
  │  Runs: git add .agentdrop && git commit -m "chore: save AI handover" && git push
  ▼
[GitHub Remote Repository]
  │
  │  * D1 shuts down Machine M1 and goes offline *
  │  * D2 on Machine M2 clones the repo and checks out the branch *
  ▼
[Developer D2 on Machine M2]
  │  Runs: agentdrop status (or opens VS Code)
  ▼
[Active AI Handover Detected Instantly!]
  ├── Objective: Fix refresh-token race condition
  ├── Important Decisions: Redis token rotation, single-key atomic lock
  ├── Current Roadblock: AssertionError on 500ms replay window
  └── Primed Resume Prompt: 1-click execution in D2's AI agent!
```

---

## Core Guarantees & Non-Negotiable Invariants

1. **Portable Handover Guarantee**: The portable Handover Card is the hero feature and *always* succeeds. Native restore failure never causes handover failure.
2. **Pre-AI Sanitization**: Raw transcripts are scrubbed before reaching any model; pattern-based detection redacts API keys (OpenAI, Google, GitHub, AWS, JWT, private keys, database URLs) and excludes sensitive files (`.env*`, `*.pem`, `*.key`).
3. **Universal Security Scan**: No capsule component (`conversation`, `git`, `nativePayload`) bypasses the security scanner.
4. **Git-Native Persistence**: Context is coupled to the Git remote repository, branch, and commit.
5. **Boundary & Decompression Protection**: Segment-aware path validator rejects `../`, absolute paths, Windows drive letters, duplicate archive paths, and zip-bombs.
6. **Multi-Tier Transport**: Asynchronous Git & GitHub sync by default, plus direct ephemeral P2P streaming (ECDH + HKDF + 6-digit SAS code + AES-256-GCM) for offline local Wi-Fi / hotspot transfers.

---

## Monorepo Architecture

```text
hackathon-2026/
├── packages/
│   ├── core/                  # Headless Context Portability Engine
│   │   ├── src/
│   │   │   ├── capsule/       # Schema, validator, packager, unpacker (.aicapsule)
│   │   │   ├── security/      # File policy, scanner, pre-sanitizer, crypto (ECDH/HKDF/AES-256-GCM)
│   │   │   ├── git/           # GitIdentity, snapshot collector, TargetWorkspaceSafety
│   │   │   ├── sync/          # GitRepoProvider, RemoteSyncProvider, ContextSyncManager
│   │   │   ├── context/       # Deterministic offline extractor
│   │   │   ├── network/       # P2P protocol, sender, receiver, discovery
│   │   │   └── adapters/      # AntigravityAdapter & ClaudeCodeAdapter
│   │   └── fixtures/          # Golden Demo Fixture (Antigravity auth task)
│   │
│   ├── cli/                   # Standalone CLI Companion & Web Dashboard
│   │   ├── bin/agentdrop.js   # Executable entrypoint (`agentdrop`)
│   │   └── src/
│   │       ├── index.ts       # `save`, `status`, `load`, `beam`, `listen`, `sessions`, `ui`
│   │       └── ui.ts          # Embedded Web UI Dashboard server (localhost:3333)
│   │
│   └── vscode-extension/      # VS Code / Antigravity IDE Extension
│       ├── src/
│       │   ├── extension.ts   # Extension entrypoint and commands
│       │   └── AgentDropViewProvider.ts # Sidebar Webview (Git Handoff, Sessions, Radar)
│       └── resources/         # Activity bar icon
└── tsconfig.base.json
```

---

## Quickstart

### Prerequisites
- Node.js 18+ (Node 20+ or 22+ recommended)
- Git 2.30+

### Installation & Build
```bash
git clone https://github.com/AnshulVatsOfficial/hackathon-2026.git
cd hackathon-2026
npm install
npm run build
```

### Running Tests (27/27 Passing)
```bash
npm test
```

---

## Usage Guide

### 1. Developer 1: Save Active AI Context to Git
Save your in-flight AI coding session into the repository:
```bash
node packages/cli/bin/agentdrop.js save
```
*(Or test with the verified golden demo fixture:)*
```bash
node packages/cli/bin/agentdrop.js save --demo
```

Commit and push to GitHub:
```bash
git add .agentdrop && git commit -m "chore: save AI handover" && git push origin feature/auth
```

### 2. Developer 2: Inspect Active Context on Machine 2
Clone the repository and check out the branch on a different machine:
```bash
node packages/cli/bin/agentdrop.js status
```
*Outputs the AI Handover Card with Objective, Decisions, Current Roadblock, and the Primed Resume Prompt.*

### 3. Load the Resume Prompt
Emit the primed prompt directly to feed into any AI coding tool:
```bash
node packages/cli/bin/agentdrop.js load
```

### 4. Interactive Web UI Dashboard
Launch the visual dashboard locally or across the network:
```bash
node packages/cli/bin/agentdrop.js ui
# Open http://localhost:3333 in any browser
```

### 5. Optional: Direct Offline Peer-to-Peer Transfer (Hotspot Mode)
If both devices are in the same room without internet access:
```bash
# Machine A (Sender):
node packages/cli/bin/agentdrop.js beam --demo

# Machine B (Receiver):
node packages/cli/bin/agentdrop.js listen <PAIRING_TOKEN>
```

---

## Automated Test Suite

AgentDrop includes 27 comprehensive automated tests across all subsystems:

| Test Suite | Tests | Description |
| :--- | :--- | :--- |
| **`sync.test.ts`** | 4 | In-repo `.agentdrop/` creation, branch matching, and off-tree remote cache |
| **`security.test.ts`** | 3 | Sensitive file exclusions, pattern-based secret redaction, pre-AI sanitization |
| **`validator.test.ts`** | 5 | Directory traversal (`../`), absolute paths, Windows drive letters, zip-bombs |
| **`adapters.test.ts`** | 2 | Real session discovery & extraction across Antigravity & Claude Code |
| **`p2p.test.ts`** | 3 | Ephemeral ECDH keypair, HKDF-SHA256, 6-digit SAS, AES-256-GCM cipher |
| **`git.test.ts`** | 2 | Identity detection, repo fingerprinting, and working tree snapshotting |
| **`fallback.test.ts`** | 1 | Offline deterministic context extraction without cloud models |
| **`capsule.test.ts`** | 2 | Full archive serialize/deserialize cycle and golden fixture validation |
| **`e2e.test.ts`** | 1 | Full end-to-end context portability chain |
| **`cli.test.ts`** | 4 | CLI commands (`save`, `status`, `beam`, `listen`, `sessions`) |

---

## 3-Minute Hackathon Presentation Script

1. **The Context Trap (0:00 - 0:45)**: Show in-flight AI coding session on Machine 1 with failing tests and architectural decisions. Explain that Git pushes the code, but loses the AI's memory.
2. **The Git-Native Save (0:45 - 1:30)**: Run `agentdrop save`. Point out the scrubbed secrets, structured `.agentdrop/handover.json`, and human-readable `.agentdrop/HANDOVER.md`. Run `git push`.
3. **Machine 2 Asynchronous Recovery (1:30 - 2:30)**: Turn off Machine 1. Open Machine 2, clone the repository, and run `agentdrop status` (or open the VS Code sidebar). The Handover Card appears instantly with previous decisions and the exact active roadblock.
4. **Instant Continuation (2:30 - 3:00)**: Click **[Copy Resume Prompt]**, paste into the target AI agent, and watch the AI immediately resume fixing the failing test without re-explaining the task!
