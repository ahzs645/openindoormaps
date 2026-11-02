#!/bin/bash
# Build the pages app and assemble a public root with checked plan carriers.
#   build-public-root.sh REPO PROGRESSIVE-DIR ROUTING-CARRIER.json.gz NEW-ROOT VISITOR-JSON VISITOR-SHA256
# Layout: NEW-ROOT/openindoormaps -> NEW-ROOT/build, data/unbc -> PROGRESSIVE-DIR,
# data/unbc-routing/<carrier>, data/unbc-plans -> build/data/unbc-plans
# (the committed carriers under REPO/public/data/unbc-plans/).
# Then runs the existing publication checks for plans and the directions cache.
# The build (3 GB heap) and the checks run under the shared heavy-job lock.
set -eu
repo=$1 progressive=$2 carrier=$3 root=$4 visitor=$5 visitorSha=$6
lock=${HEAVY_LOCK:-/home/user/unbc-work/heavy2.lock}
supervise="python3 $repo/docs/continuation/unbc-20261030/connections/run-supervised.py"
[ -e "$root" ] && { echo "NEW-ROOT must not exist" >&2; exit 2; }
mkdir -p "$root/data/unbc-routing"
cd "$repo"
TZ=UTC SITE_DEMOS=indoor flock "$lock" $supervise --log "$root.build.log" \
  --memory-log "$root.build.memory.jsonl" --execution-report "$root.build.execution.json" \
  --timeout-seconds 3600 -- node --max-old-space-size=3072 --import tsx \
  node_modules/vite/bin/vite.js build --configLoader native --mode pages --outDir "$root/build"
ln -s build "$root/openindoormaps"
ln -s "$(realpath "$progressive")" "$root/data/unbc"
cp "$carrier" "$root/data/unbc-routing/"
ln -s ../build/data/unbc-plans "$root/data/unbc-plans"
TZ=UTC flock "$lock" $supervise --log "$root.plans-check.log" \
  --memory-log "$root.plans-check.memory.jsonl" --execution-report "$root.plans-check.execution.json" \
  --timeout-seconds 3600 -- node --max-old-space-size=4096 --import tsx \
  scripts/indoor/check-published-visitor-plans.ts "$root" "$root.plans-check.json"
TZ=UTC flock "$lock" $supervise --log "$root.cache-check.log" \
  --memory-log "$root.cache-check.memory.jsonl" --execution-report "$root.cache-check.execution.json" \
  --timeout-seconds 3600 -- node --max-old-space-size=6144 --import tsx \
  scripts/indoor/check-published-directions-cache.ts "$visitor" "$visitorSha" "$root" "$root.cache-check.json"
echo public root ready
