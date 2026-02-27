# openclaw-ops: Current State of the Nation

> Last updated: 2026-02-27 by claude-opus-4.6 (T-006 /config command)
> Commit: pending
>
> **Rule:** This file is rewritten (not appended) at the end of every session.
> It reflects the *current* reality, not history. History lives in LOG.md.

---

<!-- SECTION: summary -->
Active plugin at v0.2.0. All commands working. src/utils.ts is the single shared utility module exporting all cross-cutting helpers (path, shell, filesystem, JSON, formatting, cooldown, system, workspace scanning). Legacy commands extracted from index.ts into extensions/legacy-commands.ts. index.ts is now a thin entry point that delegates to five extension modules. 158 vitest tests passing across 7 test files. Triage CI suspended. v0.2 roadmap in progress - T-006 (/config) completed.
<!-- /SECTION: summary -->

<!-- SECTION: build_health -->
## Build Health

| Check | Result | Notes |
|-------|--------|-------|
| `tsc --noEmit` | Pass | Verified 2026-02-27 |
| `npm test` | Pass (158 tests) | 7 test files, all passing |
| `lint` | (Unknown) | Not configured |

<!-- /SECTION: build_health -->

---

<!-- SECTION: architecture -->
## Architecture

```
index.ts                      -- thin entry point, delegates to extensions
src/utils.ts                  -- single shared utility module (all helpers)
src/utils.test.ts             -- 45 tests for shared utilities
src/test-helpers.ts           -- shared mock API for command testing
extensions/
  legacy-commands.ts          -- /cron, /privacy-scan, /release, /staging-smoke, /handoff, /limits
  legacy-commands.test.ts     -- 24 tests
  phase1-commands.ts          -- /health, /services, /logs, /plugins
  phase1-commands.test.ts     -- 18 tests
  observer-commands.ts        -- /sessions, /activity, /session-tail, /session-stats, /session-clear
  observer-commands.test.ts   -- 24 tests
  skills-commands.ts          -- /skills, /shortcuts
  skills-commands.test.ts     -- 16 tests
  config-commands.ts          -- /config [plugin]
  config-commands.test.ts     -- 25 tests
```

### Shared utilities (src/utils.ts)

| Category | Exports |
|----------|---------|
| Path | `expandHome` |
| Shell | `safeExec`, `runCmd` |
| Filesystem | `latestFile` |
| JSON | `readJsonSafe` |
| Formatting | `formatBytes`, `formatIsoCompact` |
| Cooldown | `CooldownEntry`, `loadActiveCooldowns`, `formatCooldownLine` |
| System | `getSystemResources`, `checkGatewayStatus` |
| Workspace | `listWorkspacePluginDirs` |

<!-- /SECTION: architecture -->

---

<!-- SECTION: commands -->
## Commands

| Command | Module | Notes |
|---------|--------|-------|
| `/health` | phase1-commands | Gateway status, system resources, plugin count, model cooldowns, recent errors |
| `/services` | phase1-commands | Profile listing, gateway state per profile, port bindings |
| `/logs` | phase1-commands | Unified log viewer with service and line-count args |
| `/plugins` | phase1-commands | Enhanced plugin dashboard with versions and workspace info |
| `/config` | config-commands | Config overview (env, main config, plugin configs, env vars) or per-plugin detail with schema validation |
| `/cron` | legacy-commands | Shows crontab + systemd timers + scripts + latest reports |
| `/privacy-scan` | legacy-commands | Report-only, filenames only for secret matches |
| `/limits` | legacy-commands | Shows cooldown windows + auth expiry ETAs |
| `/release` | legacy-commands | Prints QA gate checklist |
| `/handoff` | legacy-commands | Shows recent handoff log tail |
| `/staging-smoke` | legacy-commands | Sequential staging installs for all openclaw-* repos |
| `/sessions` | observer-commands | List recent AI agent sessions with activity summary |
| `/activity` | observer-commands | Recent agent activity (all or by session) |
| `/session-tail` | observer-commands | Tail the most recent agent events |
| `/session-stats` | observer-commands | Aggregate statistics for observed sessions |
| `/session-clear` | observer-commands | Clear observer event log (requires auth) |
| `/skills` | skills-commands | Show all locally installed plugins with their commands |
| `/shortcuts` | skills-commands | Flat cheat-sheet of all commands across all plugins |

<!-- /SECTION: commands -->

---

<!-- SECTION: roadmap -->
## v0.2 Roadmap

Defined 2026-02-27. Five GitHub issues created:

| Issue | Title | Priority | Status |
|-------|-------|----------|--------|
| [#1](https://github.com/homeofe/openclaw-ops/issues/1) | Extract shared utilities into a common module | High | Done |
| [#2](https://github.com/homeofe/openclaw-ops/issues/2) | Add test infrastructure and basic command tests | High | Done |
| [#3](https://github.com/homeofe/openclaw-ops/issues/3) | Implement Phase 2 /config command | Medium | Done |
| [#4](https://github.com/homeofe/openclaw-ops/issues/4) | Fix Windows disk usage detection in /health | Medium | Open |
| [#5](https://github.com/homeofe/openclaw-ops/issues/5) | Fix triage CI workflow cross-repo 403 errors | Low | Open |

Remaining: #4 (bug fix) -> #5 (CI fix, requires PAT setup)

<!-- /SECTION: roadmap -->

---

<!-- SECTION: what_is_missing -->
## What is Missing

| Gap | Severity | Description | Tracked |
|-----|----------|-------------|---------|
| Windows disk detection | MEDIUM | Uses deprecated wmic, hardcodes C: drive | [#4](https://github.com/homeofe/openclaw-ops/issues/4) |
| Triage CI | LOW | Suspended - 403 cross-repo failures, needs PAT | [#5](https://github.com/homeofe/openclaw-ops/issues/5) |

<!-- /SECTION: what_is_missing -->

---

<!-- SECTION: safety_rules -->
## Safety Rules

- Never print secrets in command output
- Privacy scan reports list filenames only for secret-like matches, never matched lines
- `/limits` should report windows/ETAs (cooldowns, expiry), not dump all model names
- `/config` masks secret-like values (API keys, tokens, passwords) in output

<!-- /SECTION: safety_rules -->

---

## Trust Levels

- **(Verified)**: confirmed by running code/tests
- **(Assumed)**: derived from docs/config, not directly tested
- **(Unknown)**: needs verification
