#!/bin/bash
# Resumable gap-requal chain: 06-388 link check + export, then two guide compiles.
# Every heavy step runs under flock heavy2.lock and run-supervised.py (TZ=UTC).
# A step is done when its result exists; a failed or killed attempt keeps its
# evidence and the next attempt uses fresh numbered evidence paths.
set -u
export TZ=UTC
export PATH=/root/.npm/_npx/09ae5d3560c7b1f2/node_modules/node/bin:$PATH
G=/home/user/unbc-work/gap-requal
WT=/home/user/wt-gap-requal
WS=$G/wt-straight-runs
EV=$G/evidence
LOCK=/home/user/unbc-work/heavy2.lock
SUP=$WT/docs/continuation/unbc-20261030/connections/run-supervised.py
REGEN=/home/user/unbc-work/gap-patches/regen/run/output/UNBC.master.reviter.zip
MASTER=$G/master-gap-0388.zip
mkdir -p "$EV"

next() { local n=1; while [ -e "$EV/$1-$n.log" ] || [ -e "$EV/$1-$n.execution.json" ]; do n=$((n+1)); done; echo "$1-$n"; }
sup() { # name timeout cmd...
  local name=$1 to=$2; shift 2
  echo "$(date -u +%FT%TZ) start $name $*" >> "$EV/attempts.txt"
  flock "$LOCK" python3 -I "$SUP" --log "$EV/$name.log" --memory-log "$EV/$name.memory.jsonl" \
    --execution-report "$EV/$name.execution.json" --timeout-seconds "$to" -- "$@"
  local rc=$?
  echo "$(date -u +%FT%TZ) end $name rc=$rc" >> "$EV/attempts.txt"
  return $rc
}

LINK_ARGS=(--from door:1487353:1780077:0 --to door:1487353:1779222:0
  --source docs/continuation/unbc-20261031/campus/README.md
  --decision-id 06-388-island-missing-approach
  --summary "Connected door 1780077 (06-366 Lounge to 06-364 Corridor) has no walking approach on its 06-364 portal, isolating 06-388 Vestibule and 15 other rooms. Join that portal to the neighbouring 06-364 portal of door 1779222 (6.46 ft) inside native cell 994."
  --notes "Re-added unchanged on the gap-patch regeneration master 65536052 (November 5, 2026). The regeneration renumbered native cells; the same 06-364 corridor cell is native cell 1077 there.")

cd "$WT"
# B1. check-only replay
if ! grep -q LINK_REPLAY_PASSED_NOT_EXPORTED "$EV"/link-check-*.log 2>/dev/null; then
  sup "$(next link-check)" 7200 node --max-old-space-size=6144 --import tsx \
    scripts/indoor/add-reviewed-circulation-link.ts "$REGEN" --check-only "${LINK_ARGS[@]}" || { echo LINK_CHECK_FAILED; exit 1; }
fi
grep -q LINK_REPLAY_PASSED_NOT_EXPORTED "$EV"/link-check-*.log || { echo LINK_CHECK_FAILED; exit 1; }
# B2. export
if ! grep -q LINK_ADDED_GUIDES_AND_ACCEPTANCE_REQUIRED "$EV"/link-export-*.log 2>/dev/null; then
  [ -e "$MASTER" ] && mv "$MASTER" "$MASTER.partial.$(date -u +%s)"
  sup "$(next link-export)" 14400 node --max-old-space-size=6144 --import tsx \
    scripts/indoor/add-reviewed-circulation-link.ts "$REGEN" "$MASTER" "${LINK_ARGS[@]}" || { echo LINK_EXPORT_FAILED; exit 1; }
fi
grep -q LINK_ADDED_GUIDES_AND_ACCEPTANCE_REQUIRED "$EV"/link-export-*.log || { echo LINK_EXPORT_FAILED; exit 1; }
sha256sum "$MASTER" > "$MASTER.sha256"
echo "master $(cut -c1-64 "$MASTER.sha256")"

compile() { # tag worktree out
  local tag=$1 wt=$2 out=$3 extra=()
  [ -f "$out/prepared-routing.json" ] && { echo "$tag already compiled"; return 0; }
  [ -d "$out" ] && [ -n "$(ls -A "$out" 2>/dev/null)" ] && extra=(--resume)
  (cd "$wt" && sup "$(next "$tag")" 9000 node --max-old-space-size=8192 --import tsx \
    scripts/indoor/compile-corridor-candidates.ts "$MASTER" "$out" "${extra[@]}")
}
# C1. current compiler
compile guides "$WT" "$G/guides/compile" || { echo GUIDES_FAILED; exit 1; }
# C2. held straight-corridor-runs patch (scratch worktree, git am of corridor-runs-code.patch)
compile guides-straight "$WS" "$G/guides-straight/compile" || { echo GUIDES_STRAIGHT_FAILED; exit 1; }
echo CHAIN_DONE
