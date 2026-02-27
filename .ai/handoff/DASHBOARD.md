# openclaw-ops: Build Dashboard

> Single source of truth for build health, test coverage, and pipeline state.
> Updated by agents at the end of every completed task.

---

## Purpose

Operational commands for OpenClaw:
- `/health` - Quick system health check (gateway, resources, plugins, errors)
- `/services` - Show all OpenClaw profiles and service status
- `/logs [service] [lines]` - View gateway or plugin logs
- `/plugins` - Detailed plugin dashboard with versions and workspace info
- `/cron` - Cron dashboard (crontab + systemd user timers + scripts + latest reports)
- `/privacy-scan` - GitHub privacy scanning (report-only)
- `/limits` - Provider auth expiry + observed cooldown windows
- `/release` - Staging gateway QA checklist
- `/staging-smoke` - Sequential staging installs for all openclaw-* repos
- `/handoff` - Recent handoff log tail

---

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.openclaw/workspace` | OpenClaw workspace |
| `cron/scripts/*.sh` | Cron scripts |
| `cron/reports/*` | Cron reports |
| `memory/model-ratelimits.json` | Failover limit state |

---

## Safety Rules

- Never print secrets in command output
- Privacy scan reports filenames only (never matched lines)
- `/limits` reports windows/ETAs (cooldowns, expiry), not model list

---

## v0.2 Roadmap - GitHub Issues

| Issue | Title | Labels | Priority | Status |
|-------|-------|--------|----------|--------|
| [#1](https://github.com/elvatis/openclaw-ops/issues/1) | Extract shared utilities into a common module | enhancement | High | Done |
| [#2](https://github.com/elvatis/openclaw-ops/issues/2) | Add test infrastructure and basic command tests | enhancement | High | Done |
| [#3](https://github.com/elvatis/openclaw-ops/issues/3) | Implement Phase 2 /config command | enhancement | Medium | Done |
| [#4](https://github.com/elvatis/openclaw-ops/issues/4) | Fix Windows disk usage detection in /health | bug | Medium | Done |
| [#5](https://github.com/elvatis/openclaw-ops/issues/5) | Fix triage CI workflow cross-repo 403 errors | bug | Low | Blocked |

---

## Open Tasks (Legacy Tracking)

| ID | Task | Priority | Blocked by | Ready? | GitHub Issue |
|----|------|----------|-----------|--------|--------------|
| T-003 | Fix and re-enable triage CI | LOW | 403 permission issue | Blocked | [#5](https://github.com/elvatis/openclaw-ops/issues/5) |

## Completed Tasks

| ID | Task | Completed |
|----|------|-----------|
| T-001 | Improve /limits output | 2026-02-27 |
| T-002 | Add cooldown detection from model-failover | 2026-02-27 |
| T-004 | Extract shared utilities | 2026-02-27 |
| T-005 | Add test infrastructure (159 vitest tests) | 2026-02-27 |
| T-006 | Implement /config command | 2026-02-27 |
| T-007 | Fix Windows disk detection | 2026-02-27 |
| T-008 | Add /skills and /shortcuts commands | 2026-02-27 |
