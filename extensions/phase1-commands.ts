/**
 * openclaw-ops Phase 1 Extensions
 * Operational Command Board - High Priority Commands
 * 
 * Commands: /health, /services, /logs, /plugins
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawnSync } from "node:child_process";

// Utility functions (shared with main index.ts)
function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function safeExec(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function runCmd(cmd: string, args: string[], timeoutMs = 30000): { code: number; out: string } {
  try {
    const p = spawnSync(cmd, args, {
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = `${p.stdout ?? ""}\n${p.stderr ?? ""}`.trim();
    return { code: p.status ?? (p.error ? 1 : 0), out };
  } catch (e: any) {
    return { code: 1, out: String(e?.message ?? e) };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)}MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)}GB`;
}

function getSystemResources(): { cpu: string; memory: string; disk: string } {
  const platform = os.platform();
  
  // CPU load
  const loadavg = os.loadavg();
  const cpu = `${loadavg[0].toFixed(2)}, ${loadavg[1].toFixed(2)}, ${loadavg[2].toFixed(2)}`;
  
  // Memory
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = ((usedMem / totalMem) * 100).toFixed(1);
  const memory = `${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${memPercent}%)`;
  
  // Disk (platform-specific)
  let disk = "N/A";
  try {
    if (platform === "linux" || platform === "darwin") {
      const df = safeExec("df -h /");
      const lines = df.split("\n");
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        disk = `${parts[4] || "N/A"} used (${parts[2] || "?"} / ${parts[1] || "?"})`;
      }
    } else if (platform === "win32") {
      const driveInfo = safeExec('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:csv');
      // Parse Windows output - simplified
      const match = driveInfo.match(/\d+,\d+,(\d+)/);
      if (match) disk = `${formatBytes(parseInt(match[1]))} free`;
    }
  } catch {
    // Keep N/A
  }
  
  return { cpu, memory, disk };
}

function checkGatewayStatus(profile = "default"): { running: boolean; pid?: number; uptime?: string } {
  const profileArg = profile === "default" ? [] : ["--profile", profile];
  const result = runCmd("openclaw", [...profileArg, "gateway", "status"], 10000);
  
  const running = result.code === 0 && result.out.toLowerCase().includes("running");
  
  // Try to extract PID if available
  let pid: number | undefined;
  let uptime: string | undefined;
  const pidMatch = result.out.match(/PID[:\s]+(\d+)/i);
  if (pidMatch) pid = parseInt(pidMatch[1]);
  
  const uptimeMatch = result.out.match(/uptime[:\s]+(.+?)(?:\n|$)/i);
  if (uptimeMatch) uptime = uptimeMatch[1].trim();
  
  return { running, pid, uptime };
}

export function registerPhase1Commands(api: any, workspace: string) {
  
  // ========================================
  // /health - System Health Overview
  // ========================================
  api.registerCommand({
    name: "health",
    description: "Quick system health check (gateway, resources, plugins)",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const lines: string[] = [];
      lines.push("System Health");
      lines.push("");
      
      // Gateway Status
      lines.push("GATEWAY");
      const defaultStatus = checkGatewayStatus("default");
      const statusIcon = defaultStatus.running ? "✓" : "✗";
      lines.push(`- Default: ${statusIcon} ${defaultStatus.running ? "Running" : "Stopped"}`);
      if (defaultStatus.pid) lines.push(`  PID ${defaultStatus.pid}`);
      if (defaultStatus.uptime) lines.push(`  Uptime: ${defaultStatus.uptime}`);
      
      const stagingStatus = checkGatewayStatus("staging");
      const stageIcon = stagingStatus.running ? "✓" : "○";
      lines.push(`- Staging: ${stageIcon} ${stagingStatus.running ? "Running" : "Stopped"}`);
      
      // System Resources
      lines.push("");
      lines.push("RESOURCES");
      const resources = getSystemResources();
      lines.push(`- CPU load: ${resources.cpu}`);
      lines.push(`- Memory: ${resources.memory}`);
      lines.push(`- Disk: ${resources.disk}`);
      
      // Plugin Count
      lines.push("");
      lines.push("PLUGINS");
      const pluginList = runCmd("openclaw", ["plugins", "list"], 10000);
      if (pluginList.code === 0) {
        const count = pluginList.out.split("\n").filter(l => l.trim() && !l.startsWith("Installed")).length;
        lines.push(`- Installed: ${count}`);
      } else {
        lines.push("- Unable to count plugins");
      }
      
      // Last Error Check
      lines.push("");
      lines.push("ERRORS");
      const logDir = path.join(expandHome("~/.openclaw"), "logs");
      let lastError = "None detected";
      try {
        if (fs.existsSync(logDir)) {
          const logFiles = fs.readdirSync(logDir)
            .filter((f: string) => f.endsWith(".log"))
            .map((f: string) => path.join(logDir, f));
          
          for (const logFile of logFiles.slice(-3)) {
            const content = fs.readFileSync(logFile, "utf-8");
            const errorLines = content.split("\n").filter((l: string) => 
              l.toLowerCase().includes("error") || l.toLowerCase().includes("fatal")
            );
            if (errorLines.length > 0) {
              const lastLine = errorLines[errorLines.length - 1];
              lastError = `${path.basename(logFile)}: ${lastLine.slice(0, 60)}...`;
              break;
            }
          }
        }
      } catch {
        lastError = "Error reading logs";
      }
      lines.push(`- Last error: ${lastError}`);
      
      return { text: lines.join("\n") };
    },
  });

  // ========================================
  // /services - Comprehensive Service Status
  // ========================================
  api.registerCommand({
    name: "services",
    description: "Show all OpenClaw profiles and service status",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const lines: string[] = [];
      lines.push("Services Status");
      lines.push("");
      
      // Detect available profiles
      const openclawDir = expandHome("~/.openclaw");
      const profiles: string[] = ["default"];
      
      try {
        const entries = fs.readdirSync(path.dirname(openclawDir));
        for (const entry of entries) {
          if (entry.startsWith(".openclaw-") && entry !== ".openclaw-staging") {
            const profileName = entry.replace(".openclaw-", "");
            profiles.push(profileName);
          }
        }
        if (fs.existsSync(expandHome("~/.openclaw-staging"))) {
          profiles.push("staging");
        }
      } catch {
        // Continue with default only
      }
      
      lines.push(`PROFILES (${profiles.length})`);
      
      for (const profile of profiles) {
        const status = checkGatewayStatus(profile);
        const icon = status.running ? "▶" : "■";
        const state = status.running ? "Running" : "Stopped";
        lines.push(`${icon} ${profile}: ${state}`);
        if (status.running) {
          if (status.pid) lines.push(`  PID: ${status.pid}`);
          if (status.uptime) lines.push(`  Uptime: ${status.uptime}`);
          
          // Try to get port binding
          const configPath = profile === "default" 
            ? expandHome("~/.openclaw/config.json")
            : expandHome(`~/.openclaw-${profile}/config.json`);
          
          try {
            if (fs.existsSync(configPath)) {
              const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
              const port = config?.gateway?.port || config?.port || "default";
              lines.push(`  Port: ${port}`);
            }
          } catch {
            // Skip port info
          }
        }
      }
      
      // Check for systemd services (Linux only)
      if (os.platform() === "linux") {
        lines.push("");
        lines.push("SYSTEMD SERVICES");
        const systemdOut = safeExec("systemctl --user list-units 'openclaw*' --no-pager");
        if (systemdOut) {
          const services = systemdOut.split("\n")
            .filter(l => l.includes("openclaw"))
            .slice(0, 5);
          if (services.length > 0) {
            for (const svc of services) {
              lines.push(`- ${svc.trim()}`);
            }
          } else {
            lines.push("- (none)");
          }
        } else {
          lines.push("- (unable to check)");
        }
      }
      
      return { text: lines.join("\n") };
    },
  });

  // ========================================
  // /logs [service] [lines] - Unified Log Viewer
  // ========================================
  api.registerCommand({
    name: "logs",
    description: "View gateway or plugin logs (usage: /logs [service] [lines])",
    requireAuth: false,
    acceptsArgs: true,
    handler: async (args: string) => {
      const parts = args.trim().split(/\s+/);
      const service = parts[0] || "gateway";
      const numLines = parseInt(parts[1] || "50");
      
      const lines: string[] = [];
      lines.push(`Logs: ${service} (last ${numLines} lines)`);
      lines.push("");
      
      const logDir = expandHome("~/.openclaw/logs");
      
      try {
        let targetLog: string | null = null;
        
        if (service === "gateway") {
          // Find latest gateway log
          const files = fs.readdirSync(logDir).filter((f: string) => f.startsWith("gateway")).sort();
          if (files.length > 0) {
            targetLog = path.join(logDir, files[files.length - 1]);
          }
        } else {
          // Find plugin log
          const files = fs.readdirSync(logDir).filter((f: string) => f.includes(service)).sort();
          if (files.length > 0) {
            targetLog = path.join(logDir, files[files.length - 1]);
          }
        }
        
        if (!targetLog || !fs.existsSync(targetLog)) {
          lines.push(`No log file found for: ${service}`);
          lines.push("");
          lines.push("Available logs:");
          const allLogs = fs.readdirSync(logDir);
          for (const log of allLogs.slice(-10)) {
            lines.push(`- ${log}`);
          }
        } else {
          const content = fs.readFileSync(targetLog, "utf-8");
          const logLines = content.split("\n").filter((l: string) => l.trim());
          const tail = logLines.slice(-numLines);
          
          lines.push(`File: ${path.basename(targetLog)}`);
          lines.push("```text");
          for (const line of tail) {
            lines.push(line);
          }
          lines.push("```");
        }
      } catch (e: any) {
        lines.push(`Error reading logs: ${e.message}`);
      }
      
      return { text: lines.join("\n") };
    },
  });

  // ========================================
  // /plugins - Enhanced Plugin Dashboard
  // ========================================
  api.registerCommand({
    name: "plugins",
    description: "Show detailed plugin dashboard (installed, status, versions)",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const lines: string[] = [];
      lines.push("Plugins Dashboard");
      lines.push("");
      
      // Get plugin list
      const result = runCmd("openclaw", ["plugins", "list"], 15000);
      
      if (result.code !== 0) {
        lines.push("Failed to list plugins");
        lines.push("```text");
        lines.push(result.out);
        lines.push("```");
        return { text: lines.join("\n") };
      }
      
      // Parse plugin list
      const pluginLines = result.out.split("\n").filter(l => l.trim() && !l.startsWith("Installed"));
      
      lines.push(`INSTALLED (${pluginLines.length})`);
      
      // Try to get more details by checking workspace
      const pluginDetails: Array<{ name: string; version?: string; path?: string }> = [];
      
      for (const line of pluginLines) {
        const match = line.match(/^[\s-]*(.+?)(?:\s+\((.+?)\))?$/);
        if (match) {
          const name = match[1].trim();
          const info = match[2];
          pluginDetails.push({ name, version: info });
        }
      }
      
      // Enhanced details from workspace
      const wsPlugins = path.join(workspace);
      try {
        const dirs = fs.readdirSync(wsPlugins).filter((d: string) => 
          d.startsWith("openclaw-") && 
          fs.existsSync(path.join(wsPlugins, d, "openclaw.plugin.json"))
        );
        
        for (const plugin of pluginDetails) {
          const pluginDir = dirs.find((d: string) => d === plugin.name || d.endsWith(plugin.name));
          if (pluginDir) {
            const pkgPath = path.join(wsPlugins, pluginDir, "package.json");
            if (fs.existsSync(pkgPath)) {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
              plugin.version = pkg.version;
            }
            plugin.path = pluginDir;
          }
        }
      } catch {
        // Continue without enhanced details
      }
      
      // Display formatted
      for (const plugin of pluginDetails) {
        let display = `- ${plugin.name}`;
        if (plugin.version) display += ` (v${plugin.version})`;
        lines.push(display);
        if (plugin.path) {
          lines.push(`  Path: ~/.openclaw/workspace/${plugin.path}`);
        }
      }
      
      if (pluginDetails.length === 0) {
        lines.push("- (none installed)");
      }
      
      // Check for available but not installed
      lines.push("");
      lines.push("AVAILABLE IN WORKSPACE");
      try {
        const workspacePlugins = fs.readdirSync(workspace)
          .filter((d: string) => 
            d.startsWith("openclaw-") && 
            fs.existsSync(path.join(workspace, d, "openclaw.plugin.json"))
          );
        
        const installedNames = new Set(pluginDetails.map((p: any) => p.name));
        const available = workspacePlugins.filter((wp: string) => !installedNames.has(wp));
        
        if (available.length > 0) {
          for (const avail of available) {
            lines.push(`- ${avail} (not installed)`);
          }
        } else {
          lines.push("- (all workspace plugins installed)");
        }
      } catch {
        lines.push("- (unable to scan workspace)");
      }
      
      return { text: lines.join("\n") };
    },
  });
}
