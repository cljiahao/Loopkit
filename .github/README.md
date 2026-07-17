# .github

## Purpose

GitHub-native config: dependency-update policy and the Actions CI/security
pipelines.

## Contents

- `dependabot.yml` — weekly npm + github-actions dependency scan; version-update PRs are disabled (`open-pull-requests-limit: 0`, intentional noise reduction for a solo/direct-to-master project); PRs for known CVEs still open
- `workflows/`

## Connectivity

`dependabot.yml` configures GitHub's built-in dependency bot directly — no
workflow file needed for it to run. `workflows/` holds the two Actions
pipelines (`ci.yml`, `security.yml`) that trigger on `push`/`pull_request`
against `main`; `ci.yml` invokes `.claude/verify-harness.sh` as its first
step, so a harness-integrity failure fails CI the same way a test failure
would.

## Parent

[loopkit](../README.md)
