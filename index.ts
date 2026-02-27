import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawnSync } from "node:child_process";
import { registerPhase1Commands } from "./extensions/phase1-commands.js";

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

function runCmd(cmd: string, args: string[], timeoutMs = 120_000): { code: number; out: string } {
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
    description: "Show cron dashboard (WhatsApp-friendly)",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const lines: string[] = [];
      lines.push("Cron dashboard");

      // CRONTAB
      const crontab = safeExec("crontab -l");
      const jobs = crontab
        ? crontab
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#"))
        : [];

      lines.push("");
      lines.push(`CRONTAB JOBS (${jobs.length})`);
      if (!jobs.length) {
        lines.push("- (none)");
      } else {
        for (const j of jobs.slice(0, 20)) lines.push(`- ${j}`);
        if (jobs.length > 20) lines.push("- ... (truncated)");
      }

      // SCRIPTS
      lines.push("");
      lines.push("SCRIPTS");
      try {
        const scripts = fs.readdirSync(cronScripts).filter((f) => f.endsWith(".sh")).sort();
        if (!scripts.length) {
          lines.push("- (none)");
        } else {
          for (const s of scripts) {
            const st = fs.statSync(path.join(cronScripts, s));
            const m = new Date(st.mtimeMs).toISOString().slice(0, 16).replace("T", " ");
            lines.push(`- ${s} (modified ${m} UTC)`);
          }
        }
      } catch {
        lines.push("- (cron/scripts missing)");
      }

      // REPORTS
      lines.push("");
      lines.push("REPORTS");
      const latestPrivacy = latestFile(cronReports, "github-privacy-scan_");
      if (latestPrivacy) {
        lines.push(`- latest privacy scan: ${latestPrivacy.replace(".txt", "")}`);
        lines.push(`  ${path.join(cronReports, latestPrivacy)}`);
      } else {
        lines.push("- (no privacy scan report yet)");
      }

      // SYSTEMD USER TIMERS (short)
      const timers = safeExec("systemctl --user list-timers --all --no-pager");
      if (timers) {
        const tlines = timers.split("\n").filter(Boolean);
        const head = tlines.slice(0, 1);
        const body = tlines.slice(1).filter((l) => !l.startsWith("-") && l.trim()).slice(0, 2);
        lines.push("");
        lines.push("SYSTEMD (USER) TIMERS (top 2)");
        lines.push("```text");
        for (const l of [...head, ...body]) lines.push(l);
        lines.push("```");
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
    name: "release",
    description: "Show staging gateway + human GO checklist (QA gate)",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const p = path.join(workspace, "openclaw-ops", "RELEASE.md");
      const lines: string[] = [];
      lines.push("Release / QA");
      lines.push("");
      if (fs.existsSync(p)) {
        const txt = fs.readFileSync(p, "utf-8").trim();
        // WhatsApp-friendly: keep it short
        const out = txt.split("\n").slice(0, 160).join("\n");
        lines.push(out);
        if (txt.split("\n").length > 160) lines.push("\n... (truncated)");
      } else {
        lines.push(`Missing: ${p}`);
      }
      return { text: lines.join("\n") };
    },
  });

  api.registerCommand({
    name: "staging-smoke",
    description: "Run staging smoke tests for all openclaw-* repos (install + restart + status)",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const reportsDir = path.join(workspace, "cron", "reports");
      fs.mkdirSync(reportsDir, { recursive: true });

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
      const reportPath = path.join(reportsDir, `staging-smoke_${stamp}.txt`);

      const repoDirs = fs
        .readdirSync(workspace)
        .filter((d) => d.startsWith("openclaw-") && fs.existsSync(path.join(workspace, d, "openclaw.plugin.json")))
        .sort();

      const log: string[] = [];
      log.push(`staging-smoke ${new Date().toISOString()}`);
      log.push(`repos: ${repoDirs.length}`);
      log.push("");

      const outLines: string[] = [];
      outLines.push("Staging smoke");
      outLines.push("");
      outLines.push(`Repos: ${repoDirs.length}`);

      for (const repo of repoDirs) {
        const repoPath = path.join(workspace, repo);
        const rel = `~/.openclaw/workspace/${repo}`;

        // Restrict plugin autoload during smoke tests to reduce cross-plugin interference.
        // This is a safety measure for staging runs only.
        const pluginId = repo;
        log.push(`== ${repo} ==`);
        const allow = runCmd(
          "openclaw",
          ["--profile", "staging", "config", "set", "plugins.allow", JSON.stringify([pluginId])],
          60_000
        );
        log.push(`allowlist: exit ${allow.code}`);
        if (allow.out) log.push(allow.out);
        if (allow.code !== 0) {
          fs.writeFileSync(reportPath, log.join("\n") + "\n", "utf-8");
          return { text: `Staging smoke FAILED on ${repo} (set plugins.allow). Report: ${reportPath}` };
        }

        const step1 = runCmd("openclaw", ["--profile", "staging", "plugins", "install", "-l", repoPath], 300_000);
        log.push(`install: exit ${step1.code}`);
        if (step1.out) log.push(step1.out);
        if (step1.code !== 0) {
          log.push("");
          log.push(`FAIL: ${repo} install`);
          fs.writeFileSync(reportPath, log.join("\n") + "\n", "utf-8");
          return { text: `Staging smoke FAILED on ${repo} (install). Report: ${reportPath}` };
        }

        const step2 = runCmd("openclaw", ["--profile", "staging", "gateway", "restart"], 300_000);
        log.push(`restart: exit ${step2.code}`);
        if (step2.out) log.push(step2.out);
        if (step2.code !== 0) {
          log.push("");
          log.push(`FAIL: ${repo} gateway restart`);
          fs.writeFileSync(reportPath, log.join("\n") + "\n", "utf-8");
          return { text: `Staging smoke FAILED on ${repo} (gateway restart). Report: ${reportPath}` };
        }

        const step3 = runCmd("openclaw", ["--profile", "staging", "status"], 180_000);
        log.push(`status: exit ${step3.code}`);
        if (step3.out) log.push(step3.out);
        if (step3.code !== 0) {
          log.push("");
          log.push(`FAIL: ${repo} status`);
          fs.writeFileSync(reportPath, log.join("\n") + "\n", "utf-8");
          return { text: `Staging smoke FAILED on ${repo} (status). Report: ${reportPath}` };
        }

        outLines.push(`- OK: ${repo} (${rel})`);
        log.push("");
      }

      log.push("DONE");
      fs.writeFileSync(reportPath, log.join("\n") + "\n", "utf-8");

      outLines.push("");
      outLines.push(`Report: ${reportPath}`);
      return { text: outLines.join("\n") };
    },
  });

  api.registerCommand({
    name: "handoff",
    description: "Show latest handoff log entries for openclaw-ops",
    requireAuth: false,
    acceptsArgs: false,
    handler: async () => {
      const p = path.join(workspace, "openclaw-ops", ".ai", "handoff", "LOG.md");
      if (!fs.existsSync(p)) return { text: `Missing: ${p}` };
      const txt = fs.readFileSync(p, "utf-8");
      const tail = txt.split("\n").slice(-40).join("\n").trim();
      const lines: string[] = [];
      lines.push("openclaw-ops handoff (tail)");
      lines.push("");
      lines.push("```text");
      lines.push(tail || "(empty)");
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

      // Extract key header lines (keep it minimal, no full model dump)
      const pick = (prefix: string) => lines.find((l) => l.startsWith(prefix)) ?? "";
      const header = [pick("Default"), pick("Fallbacks")].filter(Boolean);

      // Extract OAuth/token expiry section
      const startIdx = lines.findIndex((l) => l.trim() === "OAuth/token status");
      const expiry: string[] = [];
      if (startIdx >= 0) {
        for (const l of lines.slice(startIdx + 1)) {
          // stop when another top-level header starts
          if (l.trim() && !l.startsWith("-") && !l.startsWith(" ") && !l.startsWith("\t")) break;
          if (!l.trim()) continue;
          if (/^\s*-\s+/.test(l) || /^\s{2,}-\s+/.test(l)) expiry.push(l);
        }
      }

      const msg: string[] = [];
      msg.push("Limits");

      // Section: Config
      if (header.length) {
        msg.push("");
        msg.push("CONFIG");
        msg.push("```text");
        for (const h of header) msg.push(h);
        msg.push("```");
      }

      // Section: Auth expiry (hard stop)
      msg.push("");
      msg.push("AUTH EXPIRY (hard stop)");
      if (expiry.length) {
        msg.push("```text");
        for (const l of expiry.slice(0, 120)) msg.push(l);
        if (expiry.length > 120) msg.push("... (truncated)");
        msg.push("```");
      } else {
        msg.push("(not found in CLI output)");
      }

      // Section: Rate-limit cooldowns (observed)
      msg.push("");
      msg.push("RATE LIMIT COOLDOWNS (observed)");
      try {
        const statePath = path.join(workspace, "memory", "model-ratelimits.json");
        const now = Math.floor(Date.now() / 1000);

        if (!fs.existsSync(statePath)) {
          msg.push("None recorded yet. (Shows up after first 429/quota event via model-failover.)");
        } else {
          const raw = fs.readFileSync(statePath, "utf-8");
          const st = JSON.parse(raw) as any;
          const lim = (st?.limited ?? {}) as Record<string, { lastHitAt: number; nextAvailableAt: number; reason?: string }>;

          const active = Object.entries(lim)
            .map(([model, v]) => ({ model, ...v }))
            .filter((v) => typeof v.nextAvailableAt === "number" && v.nextAvailableAt > now)
            .sort((a, b) => a.nextAvailableAt - b.nextAvailableAt)
            .slice(0, 50);

          if (!active.length) {
            msg.push("None active.");
          } else {
            // pretty aligned table
            const modelW = Math.min(42, Math.max(...active.map((a) => a.model.length)));
            msg.push("```text");
            msg.push(`${"MODEL".padEnd(modelW)}  UNTIL (UTC)                 ETA`);
            for (const a of active) {
              const etaSec = a.nextAvailableAt - now;
              const etaMin = Math.max(0, Math.round(etaSec / 60));
              const untilIso = new Date(a.nextAvailableAt * 1000).toISOString().replace(".000Z", "Z");
              msg.push(`${a.model.padEnd(modelW)}  ${untilIso}  ~${etaMin}m`);
            }
            msg.push("```");
          }
        }
      } catch {
        msg.push("Failed to read local cooldown state.");
      }

      msg.push("");
      msg.push("NOTE");
      msg.push("OpenClaw does not expose per-model token remaining, quota counters, or official reset timestamps via CLI/API today.");
      msg.push("This command reports provider auth expiry and observed cooldown windows from local failover state.");

      return { text: msg.join("\n") };
    },
  });

  // Register Phase 1 operational commands
  registerPhase1Commands(api, workspace);
}
