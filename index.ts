import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

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

function latestFile(dir: string, prefix: string): string | null {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(prefix))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files[0]?.f ?? null;
  } catch {
    return null;
  }
}

export default function register(api: any) {
  const cfg = (api.pluginConfig ?? {}) as { enabled?: boolean; workspacePath?: string };
  if (cfg.enabled === false) return;

  const workspace = expandHome(cfg.workspacePath ?? "~/.openclaw/workspace");
  const cronDir = path.join(workspace, "cron");
  const cronScripts = path.join(cronDir, "scripts");
  const cronReports = path.join(cronDir, "reports");

  api.registerCommand({
    name: "cron",
    description: "Show cron dashboard (jobs + scripts + latest reports)",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const lines: string[] = [];
      lines.push("Cron dashboard");
      lines.push("");

      const crontab = safeExec("crontab -l");
      if (crontab) {
        const jobs = crontab
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"));
        lines.push(`Jobs (${jobs.length}):`);
        lines.push("```text");
        for (const j of jobs.slice(0, 50)) lines.push(j);
        if (jobs.length > 50) lines.push("... (truncated)");
        lines.push("```");
      } else {
        lines.push("No crontab entries found (or permission denied).");
      }

      lines.push("");

      try {
        const scripts = fs.readdirSync(cronScripts).filter((f) => f.endsWith(".sh"));
        lines.push(`Scripts (${scripts.length}):`);
        lines.push("```text");
        for (const s of scripts.sort()) {
          const st = fs.statSync(path.join(cronScripts, s));
          lines.push(`${s}  (mtime: ${new Date(st.mtimeMs).toISOString()})`);
        }
        lines.push("```");
      } catch {
        lines.push("No cron/scripts directory found.");
      }

      lines.push("");

      const latestPrivacy = latestFile(cronReports, "github-privacy-scan_");
      if (latestPrivacy) {
        lines.push("Latest privacy scan report:");
        lines.push("```text");
        lines.push(path.join(cronReports, latestPrivacy));
        lines.push("```");
      } else {
        lines.push("No privacy scan report found yet.");
      }

      return { text: lines.join("\n") };
    },
  });

  api.registerCommand({
    name: "privacy-scan",
    description: "Run GitHub privacy scan (safe, report-only)",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const script = path.join(workspace, "ops", "github-privacy-scan.sh");
      if (!fs.existsSync(script)) {
        return { text: `privacy scan script not found: ${script}` };
      }

      // Run and capture tail
      let out = "";
      try {
        out = execSync(`bash ${script}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
      } catch (e: any) {
        // Even on non-zero exit, show what we have.
        out = String(e?.stdout ?? "") + "\n" + String(e?.stderr ?? "");
      }

      const report = latestFile(cronReports, "github-privacy-scan_");
      const tail = out.split("\n").slice(-30).join("\n");

      const lines: string[] = [];
      lines.push("Privacy scan finished.");
      if (report) lines.push(`Report: ${path.join(cronReports, report)}`);
      lines.push("");
      lines.push("```text");
      lines.push(tail.trim() || "(no output)");
      lines.push("```");

      return { text: lines.join("\n") };
    },
  });

  api.registerCommand({
    name: "limits",
    description: "Show model/provider auth expiries and status (best-effort)",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      // Today, `openclaw models status` does not expose per-model rate-limit reset times.
      // What we CAN show reliably is the auth token/OAuth expiry window per provider,
      // which is often the next hard stop in practice.
      const out = safeExec("openclaw models status");
      if (!out) return { text: "Failed to run: openclaw models status" };

      const lines = out.split("\n");

      // Extract key header lines
      const pick = (prefix: string) => lines.find((l) => l.startsWith(prefix)) ?? "";
      const header = [
        pick("Default"),
        pick("Fallbacks"),
        pick("Configured models"),
      ].filter(Boolean);

      // Extract OAuth/token expiry section
      const startIdx = lines.findIndex((l) => l.trim() === "OAuth/token status");
      const expiry: string[] = [];
      if (startIdx >= 0) {
        for (const l of lines.slice(startIdx + 1)) {
          if (!l.trim()) continue;
          // keep provider headings and their child lines
          if (/^\s*-\s+/.test(l)) expiry.push(l);
          else if (/^\s{2,}-\s+/.test(l)) expiry.push(l);
          // stop if it looks like a new top-level section (defensive)
          if (/^\S/.test(l) && l.trim() !== "OAuth/token status") break;
        }
      }

      const msg: string[] = [];
      msg.push("Limits (best-effort)");
      msg.push("");
      if (header.length) {
        msg.push("```text");
        for (const h of header) msg.push(h);
        msg.push("```");
        msg.push("");
      }

      if (expiry.length) {
        msg.push("Auth expiry windows:");
        msg.push("```text");
        for (const l of expiry.slice(0, 80)) msg.push(l);
        if (expiry.length > 80) msg.push("... (truncated)");
        msg.push("```");
      } else {
        msg.push("No OAuth/token status section found in output.");
      }

      msg.push("");
      msg.push("Note: per-model rate-limit reset times are not currently exposed by OpenClaw CLI. If you want, I can add that to the model-failover plugin state and surface it here.");

      return { text: msg.join("\n") };
    },
  });
}
