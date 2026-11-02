#!/bin/bash
# Final-proof browser series: collect the identity once, serve the public root
# (outside the heavy-job lock), then run the 8 journeys cold in desktop and
# mobile emulation, RUNS times each, every browser run under the shared lock.
#   run-final-proof.sh REPO PUBLIC-ROOT VISITOR.json VISITOR-SHA256 CARRIER.json.gz REVITER PORT OUT [RUNS]
# Runs whose proof file exists are skipped (resumable).
set -u
repo=$1 root=$2 visitor=$3 visitorSha=$4 carrier=$5 reviter=$6 port=$7 out=$8 runs=${9:-2}
here=$(cd "$(dirname "$0")" && pwd)
lock=${HEAVY_LOCK:-/home/user/unbc-work/heavy2.lock}
journeys=$repo/docs/continuation/unbc-20261102/final-candidate/browser/JOURNEYS.json
mkdir -p "$out"
cd "$repo"
node --import tsx "$here/collect-identity.ts" "$repo" "$root" "$visitor" "$visitorSha" \
  "$carrier" "$reviter" "$out/IDENTITY.json" >/dev/null || exit 3
(cd "$root" && exec python3 -m http.server "$port" --bind 127.0.0.1 >"$out/http.log" 2>&1) &
http=$!
trap 'kill $http 2>/dev/null' EXIT
sleep 2
base=http://127.0.0.1:$port
status=0
for run in $(seq 1 "$runs"); do
  for mode in desktop mobile; do
    [ -f "$out/$mode-run$run-proof.json" ] && continue
    TZ=UTC flock "$lock" timeout 2400 node "$here/proof-final-journeys.mjs" \
      "$base/openindoormaps/" "$base/data/unbc/manifest.json" "$out" "$mode" \
      "$journeys" "$out/IDENTITY.json" "run$run" >"$out/$mode-run$run.log" 2>&1
    rc=$?
    echo "$(date -u +%FT%TZ) $mode run$run exit $rc" | tee -a "$out/runs.txt"
    [ $rc -eq 0 ] || status=1
  done
done
exit $status
