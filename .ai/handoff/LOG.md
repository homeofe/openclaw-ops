# LOG

- 2026-02-24: Created openclaw-ops with /cron + /privacy-scan.
- 2026-02-24: Added /limits (auth expiry + cooldown windows).
- 2026-02-25: Adjusted `assets/logo-256.png` to keep the logo centered within GitHub avatar safe area.
- 2026-02-25: Disabled 40 risky GitHub automation cron jobs (`ghwatch-*` and `ghtriage-*`) that could auto-spawn fix agents / open PRs.
- 2026-02-25: Added GitHub Actions workflow `openclaw-triage-labels` (labeling-only) + `scripts/triage_labels.py` to triage and label issues across all `homeofe/openclaw-*` repos (skip archived/forks). Commit: 0275eb0.
- 2026-02-25: Updated `openclaw-triage-labels` to use `secrets.GITHUB_TOKEN` by default (with `issues: write`), optional override via `TRIAGE_GH_TOKEN`. Documented in README.
- 2026-02-25: Added QA documentation + commands: `RELEASE.md` (staging gateway + GO checklist), `/release` (prints QA gate), `/handoff` (shows recent handoff log tail). Updated README command list.
