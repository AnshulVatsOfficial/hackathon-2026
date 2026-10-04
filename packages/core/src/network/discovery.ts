/**
 * AgentDrop - Local Network Discovery & IP Resolver
 * Authoritative Implementation Plan: Invariant 6, Section 28
 */

import os from "node:os";

export class NetworkDiscovery {
  /**
   * Resolves the primary local IPv4 address (e.g. 192.168.x.x or 10.x.x.x).
   */
  static getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;

      for (const iface of ifaceList) {
        // Skip internal/loopback and non-IPv4 addresses
        if (!iface.internal && iface.family === "IPv4") {
          return iface.address;
        }
      }
    }
    return "127.0.0.1";
  }

  /**
   * Returns a friendly local device name.
   */
  static getDeviceName(): string {
    return os.hostname() || process.env.COMPUTERNAME || "AgentDrop-Device";
  }
}
