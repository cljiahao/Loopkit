#!/usr/bin/env bash
# pre-push checks. Invoked by husky's pre-push hook.
set -euo pipefail
bash .claude/verify-harness.sh
pnpm run check && pnpm test -- --run
