#!/bin/bash
# Resumable supervised route acceptance on the gap-regeneration master.
# usage: run-accept.sh CATALOG.json OUT-NAME
# Same command as docs/continuation/unbc-20261102/final-candidate/acceptance/EXECUTION.json
# (node on the default PATH, v22.22.0, as recorded in that report).
set -u
export TZ=UTC
CAT=$1; NAME=$2
G=/home/user/unbc-work/gap-requal
WT=/home/user/wt-gap-requal
EV=$G/evidence
OUT=$G/$NAME
LOCK=/home/user/unbc-work/heavy2.lock
[ -f "$OUT/report.json" ] && grep -q '"status": *"PASS"' "$OUT/report.json" && { echo ACCEPT_ALREADY; exit 0; }
n=1; while [ -e "$EV/$NAME-$n.log" ] || [ -e "$EV/$NAME-$n.execution.json" ]; do n=$((n+1)); done
[ -e "$OUT" ] && mv "$OUT" "$OUT.prev.$(date -u +%s)"
cd "$WT"
echo "$(date -u +%FT%TZ) start $NAME-$n $(node --version) $CAT" >> "$EV/attempts.txt"
flock "$LOCK" python3 -I docs/continuation/unbc-20261030/connections/run-supervised.py \
  --log "$EV/$NAME-$n.log" --memory-log "$EV/$NAME-$n.memory.jsonl" \
  --execution-report "$EV/$NAME-$n.execution.json" --timeout-seconds 9000 -- \
  node --max-old-space-size=4096 --expose-gc --import tsx scripts/indoor/verify-shared-corridor-candidate.ts \
  "${MASTER:-$G/master-gap-0388.zip}" "$CAT" "$WT/docs/continuation/unbc-20261031/ROUTE-CASES-CAMPUS-0388.json" "$OUT"
rc=$?
echo "$(date -u +%FT%TZ) end $NAME-$n rc=$rc" >> "$EV/attempts.txt"
echo "ACCEPT_DONE rc=$rc"
