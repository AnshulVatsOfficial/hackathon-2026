# AgentDrop — AI Context Portability Layer

> **"It doesn't move a chat window. It moves the AI's working context."**

[![npm version](https://img.shields.io/npm/v/agentdrop-portability-cli.svg?color=blue)](https://www.npmjs.com/package/agentdrop-portability-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Architecture: Local-First](https://img.shields.io/badge/Architecture-Local--First%20%7C%20Git--Native-green.svg)]()
[![Privacy: Scrubbed Secrets](https://img.shields.io/badge/Privacy-Scrubbed%20Secrets-success.svg)]()

AgentDrop is a **local-first, vendor-neutral AI coding context portability layer** designed for developer teams, multi-device workflows, and continuous AI development handoffs.

---

## 🚀 The Problem AgentDrop Solves

When **Developer D1** works on a feature using an AI coding agent (such as Google Antigravity or Claude Code):
- D1 provides detailed requirements, refines architectural choices, and tests code changes.
- The AI runs tests, inspects files, and hits a specific edge-case error.
- D1 pushes the code to **GitHub**.

Later, **Developer D2** (or D1 on a second machine) clones the repository:
- Git provides the code modifications, but **zero AI working context**.
- D2 has no record of D1's original prompt, the AI's internal decisions, what approaches failed, or why tests are breaking.
- D2 is forced to manually re-explain the entire feature to their AI from scratch.

---

## ⚡ The AgentDrop Solution

AgentDrop binds the AI agent's working memory directly to the **Git & GitHub lifecycle**:

```text
[Machine 1 / Developer 1]
  │  Works with Antigravity or Claude Code
  │  Runs: agentdrop save
  ▼
[.agentdrop/ in Repo Root]
  ├── handover.json  (Structured JSON contract: objective, decisions, blocker, prompt)
  └── HANDOVER.md    (Human-readable GitHub Markdown rendered on GitHub.com!)
  │
  │  Runs: git add .agentdrop && git commit -m "chore: save AI handover" && git push
  ▼
[GitHub Remote Repository]
  │
  │  * Machine 1 goes offline *
  │  * Machine 2 clones repo and pulls main *
  ▼
[Machine 2 / Developer 2]
  │  Runs: agentdrop status (or opens VS Code)
  ▼
[Active AI Handover Detected Instantly!]
  ├── Objective: Write full-stack authentication middleware
  ├── Important Decisions: Redis token rotation, atomic single-key lock
  ├── Current Roadblock: AssertionError on 500ms replay window
  └── Primed Resume Prompt: 1-click execution in Machine 2's AI agent!
```

---

## ✨ Features

- 🔄 **Git-Native Persistence**: Context handovers live directly inside `.agentdrop/` in your repository. They version-control alongside your code commits.
- 🤖 **Universal Multi-Agent Support**: Out-of-the-box adapters for **Google Antigravity IDE**, **Claude Code**, **Cursor**, **Windsurf**, and **VS Code**.
- 🔒 **Pre-AI Secret Scrubbing**: Pattern-based security scanner redacts API keys (`sk-`, `ghp_`, tokens, private keys, database URLs) and excludes sensitive files (`.env*`, `*.pem`, `*.key`).
- 🎯 **Smart Workspace Isolation**: Automatically isolates sessions per workspace directory depth so parallel project instances never leak.
- 🚀 **Pure NPM Package**: Zero native daemons or background web servers; runs everywhere standard Node.js and Git exist.

---

## 📦 Installation

Install globally via npm:

```bash
npm install -g agentdrop-portability-cli
```

Verify installation:

```bash
agentdrop --version
```

---

## 🛠️ CLI Command Reference

### `agentdrop init`
Initializes AgentDrop in the current Git repository by setting up `.agentdrop/`, adding `AGENTS.md` context bridge, installing Git hooks, and configuring npm scripts.

```bash
agentdrop init
```

### `agentdrop save`
Captures the active AI coding session from your local agent, scrubs secrets, synthesizes the handover contract, and writes `.agentdrop/HANDOVER.md` and `.agentdrop/handover.json`.

```bash
agentdrop save
```
*Tip: Test with verified golden demo fixture:*
```bash
agentdrop save --demo
```

### `agentdrop status`
Inspects the current repository for active AI handovers, verifying branch compatibility, commit hashes, current roadblocks, and displaying the Primed Resume Prompt.

```bash
agentdrop status
```

### `agentdrop load`
Outputs the loaded context contract summary and formats the primed resume prompt for direct 1-click execution into any AI agent.

```bash
agentdrop load
```

### `agentdrop hook`
Installs or uninstalls Git post-merge and post-checkout hooks that notify developers when an active AI context handover is pulled onto their machine.

```bash
agentdrop hook install
agentdrop hook uninstall
```

### `agentdrop sessions`
Discovers and lists in-flight and recent coding agent sessions across installed tools (Antigravity IDE, Claude Code).

```bash
agentdrop sessions
```

---

## 🔒 Security & Privacy Guarantees

1. **Zero Cloud Leak**: AgentDrop operates local-first. Raw transcripts never leave your machine unless explicitly committed to your repository.
2. **Pre-Sanitization**: API keys (OpenAI, Google, GitHub, AWS, JWT), private keys, and sensitive environment variables are scrubbed before reaching any prompt or handover file.
3. **Boundary & Decompression Protection**: Strict segment-aware path validator rejects traversal attacks (`../`), absolute paths, and zip-bombs.

---

## 📄 License

MIT © [Anshul Vats](https://github.com/AnshulVatsOfficial)
