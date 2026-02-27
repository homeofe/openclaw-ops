# openclaw-ops: Autonomous Multi-Agent Workflow

> Based on the [AAHP Protocol](https://github.com/elvatis/AAHP).

---

## Agent Roles

| Agent | Model | Role | Responsibility |
|-------|-------|------|---------------|
| Implementer | claude-sonnet | Implementer | Command handlers, scripts, CI fixes |
| Reviewer | gpt-4 or second model | Reviewer | Safety review, security check |

---

## The Pipeline

### Implement + Review

```
Reads:   handoff/NEXT_ACTIONS.md (top unblocked task)
         handoff/STATUS.md
         CONVENTIONS.md (MANDATORY - check safety rules before any output)

Does:    Creates feature branch
         Implements command handler or script
         Tests manually or adds test
         Commits and pushes branch

After:
  DASHBOARD.md:    Update task status
  STATUS.md:       Update command status
  LOG.md:          Append session summary
  NEXT_ACTIONS.md: Update T-IDs
```

---

## Safety Rules

1. Never expose secrets in command output
2. Privacy scan: report filenames only, never matched lines
3. `/limits`: report windows/ETAs only, no model list
4. Staging gate: all releases must pass staging smoke first
5. Triage CI: do not re-enable until 403 permission issue is resolved

---

## Autonomy Boundaries

| Allowed | Not allowed |
|---------|-------------|
| Write command handlers | Push directly to `main` |
| Write shell scripts | Enable dangerous cron jobs without review |
| Push feature branches | Print secrets in output |
| Run privacy scan in report-only mode | Auto-spawn fix agents |

---

*Continuously refined by agents and humans.*
