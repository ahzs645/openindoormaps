#!/bin/bash
# Gate 4 + gate 5 for the chosen candidate, resumable, under the shared lock.
#   admit-chain.sh REPO CANDIDATE.zip PROGRESSIVE-DIR MANIFEST-FILE-SHA256 WORK-DIR
# 1. admit-published-project.ts   (full normal imports + every-scope readback
#                                   -> progressive-floors receipt, --write)
# 2. export-published-visitor-plans.ts (candidate 2D plan carriers)
# 3. admit-published-visitor-plans.ts  (independent re-export; writes
#                                   published-visitor-plan-receipts.ts)
set -eu
# HEAVY_LOCK overrides the shared heavy-job lock file.
repo=$1 candidate=$2 progressive=$3 manifest=$4 work=$5
supervise="python3 $repo/docs/continuation/unbc-20261030/connections/run-supervised.py"
mkdir -p "$work"
cd "$repo"
step() {
  local name=$1
  shift
  [ -f "$work/$name.done" ] && return 0
  TZ=UTC flock "${HEAVY_LOCK:-/home/user/unbc-work/heavy2.lock}" $supervise \
    --log "$work/$name.log" --memory-log "$work/$name.memory.jsonl" \
    --execution-report "$work/$name.execution.json" --timeout-seconds 10800 \
    -- "$@"
  touch "$work/$name.done"
}
[ -f "$work/project-admission.done" ] ||
  rm -f "$work/project-admission.json" "$work/project-admission.receipt.json"
step project-admission node --max-old-space-size=8192 --expose-gc --import tsx \
  scripts/indoor/admit-published-project.ts "$candidate" "$progressive" \
  "$manifest" "$work/project-admission.json" --write
if [ ! -f "$work/plan-export.done" ]; then
  rm -rf "$work/candidate-plans"
  step plan-export node --max-old-space-size=8192 --expose-gc --import tsx \
    scripts/indoor/export-published-visitor-plans.ts "$progressive" \
    "$manifest" "$work/candidate-plans"
fi
if [ ! -f "$work/plan-admission.done" ]; then
  rm -f "$work/plan-admission.json" "$work/plan-admission.json.independent.log"
  step plan-admission node --import tsx \
    scripts/indoor/admit-published-visitor-plans.ts "$progressive" \
    "$manifest" "$work/candidate-plans" "$work/plan-admission.json" \
    --verifier-heap-mib=8192
fi
echo chain complete
