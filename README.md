# openclaw-ops

Local ops plugin.

## Commands

### Operations & Monitoring (Phase 1)
- `/health` - Quick system health check (gateway, resources, plugins, errors)
- `/services` - Show all OpenClaw profiles and service status
- `/logs [service] [lines]` - View gateway or plugin logs (defaults: gateway, 50 lines)
- `/plugins` - Detailed plugin dashboard with versions and workspace info

### Configuration (Phase 2)
- `/config` - Show configuration overview (environment, main config, plugin configs, env vars)
- `/config <plugin>` - Show detailed config for a specific plugin (values, schema validation, defaults comparison)

### Legacy Commands
- `/cron` - list cron jobs + scripts + recent reports
- `/privacy-scan` - run the GitHub privacy scan and show latest report path
- `/limits` - show provider auth expiry + observed cooldown windows
- `/release` - show staging gateway + human GO checklist (QA gate)
- `/staging-smoke` - install all `openclaw-*` plugins into the staging profile, restart gateway, and verify status (writes report)
- `/handoff` - show latest openclaw-ops handoff log tail

## Usage Examples

### Quick Health Check
```bash
openclaw health
```
Shows gateway status, system resources (CPU, memory, disk), plugin count, and recent errors.

### View Logs
```bash
# View last 50 lines of gateway logs (default)
openclaw logs

# View last 100 lines of specific plugin
openclaw logs openclaw-ops 100

# View audit logs
openclaw logs audit 200
```

### Service Management
```bash
# Check all profiles
openclaw services

# View detailed plugin info
openclaw plugins
```

### Operations Dashboard
```bash
# Full operational overview
openclaw cron          # Scheduled tasks
openclaw limits        # Rate limits and auth expiry
openclaw health        # System health
openclaw services      # All services
```

GitHub Actions:
- `openclaw-triage-labels` (labeling-only): scans `homeofe/openclaw-*` repos and applies labels `security`, `bug`, or `needs-triage`.
  - Uses `secrets.GITHUB_TOKEN` by default (works only for openclaw-ops repo).
  - **Cross-repo access**: set repo secret `TRIAGE_GH_TOKEN` to a Personal Access Token with `repo` scope to triage issues in all openclaw-* repositories.

Install locally:
```bash
openclaw plugins install -l ~/.openclaw/workspace/openclaw-ops
openclaw gateway restart
```
