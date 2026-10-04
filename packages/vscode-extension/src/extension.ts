/**
 * AgentDrop - VS Code Extension Entrypoint
 * Authoritative Plan: Section 42
 */

import * as vscode from "vscode";
import { AgentDropViewProvider } from "./AgentDropViewProvider.js";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new AgentDropViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AgentDropViewProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentdrop.beamSession", () => {
      vscode.commands.executeCommand("workbench.view.extension.agentdrop-sidebar");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentdrop.beamDemo", () => {
      vscode.commands.executeCommand("workbench.view.extension.agentdrop-sidebar");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("agentdrop.receiveSession", () => {
      vscode.commands.executeCommand("workbench.view.extension.agentdrop-sidebar");
    })
  );
}

export function deactivate(): void {
  // Any active servers are automatically cleaned up when extension unloads
}
