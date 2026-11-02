#!/bin/bash
# Resumable cold-run series: run-measurements.sh BASE_URL OUT_DIR LABEL_PREFIX [extra collector flags]
# Each run is a fresh browser (cold cache) under the shared heavy-job lock;
# runs whose timing file exists are skipped.
set -u
base=$1 out=$2 prefix=$3
shift 3
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
for run in 1 2; do
  for mode in desktop mobile; do
    label="$prefix-$run"
    [ -f "$out/$mode-$label-timing.json" ] && continue
    rm -f "$out/$mode-$label-progress.jsonl"
    TZ=UTC flock /home/user/unbc-work/agents-heavy.lock \
      timeout 1800 node "$here/profile-route.mjs" "$base/openindoormaps/" \
      "$base/data/unbc/manifest.json" "$out" "$mode" "$label" \
      --port=$((9400 + run)) "$@" >"$out/$mode-$label.log" 2>&1
    echo "$mode $label exit $?" >>"$out/runs.txt"
  done
done
