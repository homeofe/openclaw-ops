#!/usr/bin/env python3
"""Labeling-only GitHub issue triage across repos.

Safety properties:
- No commits, no branches, no PRs.
- Only reads repos/issues and adds labels to issues.
- Does NOT remove existing labels.

Env:
  GITHUB_TOKEN      Default token in GitHub Actions (preferred)
  TRIAGE_GH_TOKEN   Optional override token (fine-grained PAT) if you want explicit token control
  GH_OWNER          Org/user to scan (default: homeofe)
  REPO_PREFIX       Repo name prefix filter (default: openclaw-)
  PER_REPO_LIMIT    Max open issues per repo to consider (default: 30)
  SKIP_ARCHIVED     "1" to skip archived repos
  SKIP_FORKS        "1" to skip forks
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

API = "https://api.github.com"

SECURITY_KEYWORDS = [
    "security",
    "cve",
    "vuln",
    "vulnerability",
    "xss",
    "ssrf",
    "csrf",
    "rce",
    "auth bypass",
    "token leak",
]

BUG_KEYWORDS = [
    "bug",
    "crash",
    "panic",
    "exception",
    "error",
    "failing",
    "test fails",
    "regression",
    "broken",
]

LABELS = {
    "security": {"color": "b60205", "description": "Security-related issue"},
    "bug": {"color": "d73a4a", "description": "Something isn't working"},
    "needs-triage": {"color": "ededed", "description": "Needs initial triage"},
}


@dataclass
class Counts:
    security: int = 0
    bug: int = 0
    needs_triage: int = 0


def env(name: str, default: Optional[str] = None) -> str:
    v = os.environ.get(name)
    if v is None or v == "":
        if default is None:
            raise SystemExit(f"Missing env var: {name}")
        return default
    return v


def bool_env(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip() not in ("0", "false", "False", "no", "NO", "")


def session(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update(
        {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "openclaw-triage-labels",
        }
    )
    return s


def gh_get_paginated(s: requests.Session, url: str, params: Dict[str, Any] | None = None) -> Iterable[Dict[str, Any]]:
    """Yield items from a GitHub API endpoint that returns an array."""
    while url:
        r = s.get(url, params=params)
        params = None  # only for first page
        if r.status_code >= 400:
            raise RuntimeError(f"GET {url} failed: {r.status_code} {r.text}")
        data = r.json()
        if not isinstance(data, list):
            raise RuntimeError(f"Expected list from {url}, got {type(data)}")
        for item in data:
            yield item

        # parse Link header
        link = r.headers.get("Link", "")
        next_url = None
        for part in link.split(","):
            part = part.strip()
            if 'rel="next"' in part:
                m = re.search(r"<([^>]+)>", part)
                if m:
                    next_url = m.group(1)
        url = next_url


def ensure_label(s: requests.Session, owner: str, repo: str, name: str, color: str, description: str) -> None:
    # If exists -> 200; else 404
    r = s.get(f"{API}/repos/{owner}/{repo}/labels/{name}")
    if r.status_code == 200:
        return
    if r.status_code != 404:
        raise RuntimeError(f"GET label {owner}/{repo}:{name} failed: {r.status_code} {r.text}")

    r = s.post(
        f"{API}/repos/{owner}/{repo}/labels",
        json={"name": name, "color": color, "description": description},
    )
    if r.status_code not in (200, 201):
        # If it was created concurrently, GitHub may return 422. Treat as OK if label now exists.
        r2 = s.get(f"{API}/repos/{owner}/{repo}/labels/{name}")
        if r2.status_code == 200:
            return
        raise RuntimeError(f"POST label {owner}/{repo}:{name} failed: {r.status_code} {r.text}")


def list_repos(s: requests.Session, owner: str) -> List[Dict[str, Any]]:
    # Try org first, fallback to user
    org_url = f"{API}/orgs/{owner}/repos"
    user_url = f"{API}/users/{owner}/repos"

    def try_url(url: str) -> Optional[List[Dict[str, Any]]]:
        try:
            return list(gh_get_paginated(s, url, params={"per_page": 100, "type": "all"}))
        except RuntimeError as e:
            if "404" in str(e):
                return None
            raise

    repos = try_url(org_url)
    if repos is None:
        repos = try_url(user_url)
    if repos is None:
        raise RuntimeError(f"Owner not found as org or user: {owner}")
    return repos


def classify(text: str) -> str:
    t = text.lower()
    if any(k in t for k in SECURITY_KEYWORDS):
        return "security"
    if any(k in t for k in BUG_KEYWORDS):
        return "bug"
    return "needs-triage"


def add_label(s: requests.Session, owner: str, repo: str, issue_number: int, label: str) -> None:
    r = s.post(
        f"{API}/repos/{owner}/{repo}/issues/{issue_number}/labels",
        json={"labels": [label]},
    )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Add label failed for {owner}/{repo}#{issue_number}: {r.status_code} {r.text}")


def main() -> int:
    # Prefer Actions' built-in token. Allow explicit override via TRIAGE_GH_TOKEN.
    token = os.environ.get("TRIAGE_GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Missing env var: GITHUB_TOKEN (or TRIAGE_GH_TOKEN override)")
    owner = os.environ.get("GH_OWNER", "homeofe")
    prefix = os.environ.get("REPO_PREFIX", "openclaw-")
    per_repo_limit = int(os.environ.get("PER_REPO_LIMIT", "30"))
    skip_archived = bool_env("SKIP_ARCHIVED", True)
    skip_forks = bool_env("SKIP_FORKS", True)

    s = session(token)

    # sanity check auth - use /octocat for installation tokens (doesn't require user scope)
    # The /user endpoint requires user-level access which GitHub Actions GITHUB_TOKEN doesn't have
    auth_check = s.get(f"{API}/octocat")
    if auth_check.status_code >= 400:
        raise RuntimeError(f"Auth check failed: {auth_check.status_code} {auth_check.text}")

    repos = list_repos(s, owner)
    repos = [r for r in repos if r.get("name", "").startswith(prefix)]
    if skip_archived:
        repos = [r for r in repos if not r.get("archived", False)]
    if skip_forks:
        repos = [r for r in repos if not r.get("fork", False)]

    repos.sort(key=lambda r: r.get("name", ""))

    total = Counts()
    per_repo: Dict[str, Counts] = {}

    for r in repos:
        repo = r["name"]
        per_repo[repo] = Counts()

        # Ensure labels exist
        for lname, meta in LABELS.items():
            ensure_label(s, owner, repo, lname, meta["color"], meta["description"])

        # Fetch open issues (GitHub's /issues includes PRs; filter them)
        issues = s.get(
            f"{API}/repos/{owner}/{repo}/issues",
            params={"state": "open", "per_page": per_repo_limit, "sort": "created", "direction": "desc"},
        )
        if issues.status_code >= 400:
            raise RuntimeError(f"List issues failed for {owner}/{repo}: {issues.status_code} {issues.text}")
        items = issues.json()
        if not isinstance(items, list):
            raise RuntimeError(f"Expected list issues for {owner}/{repo}")

        for item in items:
            if "pull_request" in item:
                continue

            number = int(item["number"])
            title = item.get("title") or ""
            body = item.get("body") or ""
            existing = {lbl.get("name") for lbl in item.get("labels", []) if isinstance(lbl, dict)}

            # Skip if already triaged as bug/security
            if "bug" in existing or "security" in existing:
                continue

            label = classify(f"{title}\n{body}")
            add_label(s, owner, repo, number, label)

            c = per_repo[repo]
            if label == "security":
                c.security += 1
                total.security += 1
            elif label == "bug":
                c.bug += 1
                total.bug += 1
            else:
                c.needs_triage += 1
                total.needs_triage += 1

    # Print a GitHub Actions-friendly summary
    print("\n== openclaw triage summary ==")
    print(f"repos scanned: {len(repos)}")
    print(f"labeled total: security={total.security}, bug={total.bug}, needs-triage={total.needs_triage}")
    print("\nPer repo:")
    for repo in sorted(per_repo.keys()):
        c = per_repo[repo]
        if c.security or c.bug or c.needs_triage:
            print(f"- {owner}/{repo}: security={c.security}, bug={c.bug}, needs-triage={c.needs_triage}")

    # Also write to the job summary if available
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write("## OpenClaw triage (labeling-only)\n")
            f.write(f"Repos scanned: **{len(repos)}**\\n\\n")
            f.write(
                f"Labeled total: **security={total.security}**, **bug={total.bug}**, **needs-triage={total.needs_triage}**\\n\\n"
            )
            f.write("### Per repo (non-zero)\n")
            for repo in sorted(per_repo.keys()):
                c = per_repo[repo]
                if c.security or c.bug or c.needs_triage:
                    f.write(f"- `{owner}/{repo}`: security={c.security}, bug={c.bug}, needs-triage={c.needs_triage}\\n")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise
