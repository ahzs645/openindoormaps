#!/usr/bin/env bash
# Run the attempt 006 native compile plus the Building 4-8 door aperture
# review. See README.md.
#
#   bash run.sh WORK
#
# WORK holds the two clones (openindoormaps/ and reviter/, side by side) and
# inputs/ from fetch-inputs.py. The run writes WORK/run/. Checkpoints in
# WORK/run/checkpoints are kept, so running it again after an interruption
# reuses every finished floor and landing check (same WORK path and commits).
#
# Optional environment:
#   NATIVE_WORKERS=1|2  LANDING_WORKERS=1..8  PARENT_HEAP_MIB=N
#     override the sizing chosen from this machine's cores and memory.
#   SYNC_DIR=dir   copy checkpoints there every 10 minutes and restore them
#     at start when WORK/run/checkpoints is empty (Colab: a Drive folder).
#   DRY_RUN=1      print the command without running it.
set -euo pipefail
WORK=$(cd "${1:?usage: run.sh WORK}" && pwd -P)
OIM=$WORK/openindoormaps IN=$WORK/inputs RUN=$WORK/run
REVIEW=$OIM/docs/continuation/unbc-20261021/link-doors/DOOR-APERTURE-REVIEW.json

for d in "$OIM" "$WORK/reviter" "$IN"; do [ -d "$d" ] || { echo "Missing $d" >&2; exit 1; }; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<15))throw Error("Node 22.15 or newer is required, found "+process.version)'

cores=$(getconf _NPROCESSORS_ONLN)
mem_gib=$(awk '/MemTotal/{print int($2/1048576)}' /proc/meminfo 2>/dev/null || echo $(( $(sysctl -n hw.memsize) / 1073741824 )))
# The main process peaks around 7 GiB; each floor or landing worker has a
# 4 GiB heap cap. Floors and landings run in different stages.
spare=$(( mem_gib - 9 ))
native=${NATIVE_WORKERS:-$(( spare >= 10 && cores >= 3 ? 2 : 1 ))}
landing=${LANDING_WORKERS:-$(( spare / 5 ))}
(( landing > cores - 1 )) && landing=$(( cores - 1 ))
(( landing > 8 )) && landing=8
(( landing < 1 )) && landing=1
heap=${PARENT_HEAP_MIB:-$(( mem_gib >= 32 ? 8192 : 6144 ))}
echo "Machine: $cores cores, $mem_gib GiB. Floor workers $native, landing workers $landing, main heap $heap MiB."

# Checkpoint files are content-addressed and never change, so a copy only has
# to add new files.
copy() { mkdir -p "$2"; if command -v rsync >/dev/null; then rsync -a "$1/" "$2/"; else cp -an "$1/." "$2/" 2>&1 | grep -v non-portable >&2 || true; fi; }

mkdir -p "$RUN/checkpoints"
mkdir -p -m 700 "$RUN/imports"
if [ -n "${SYNC_DIR:-}" ] && [ -z "$(ls -A "$RUN/checkpoints")" ] && [ -d "$SYNC_DIR/checkpoints" ]; then
  echo "Restoring checkpoints from $SYNC_DIR"
  copy "$SYNC_DIR/checkpoints" "$RUN/checkpoints"
  if [ -d "$SYNC_DIR/imports" ]; then copy "$SYNC_DIR/imports" "$RUN/imports"; fi
fi
# Synced copies lose their modes; the private import data must stay owner-only.
chmod 700 "$RUN/imports"; find "$RUN/imports" -type f -exec chmod 600 {} +
# Output and diagnostic directories must be new; checkpoints carry the work.
rm -rf "$RUN/output" "$RUN/diagnostic"

cmd=(node --max-old-space-size="$heap" --expose-gc --import tsx
  scripts/indoor/regenerate-from-native-cache.ts "$IN/master.zip" "$IN/native-cache.json" "$RUN/output"
  --native-workers "$native" --native-worker-heap-mib 4096 --landing-workers "$landing"
  --checkpoint-dir "$RUN/checkpoints"
  --drawing-reference-review "$IN/reviewed-drawing-references.json" --refresh-drawing-floor-bindings checked
  --boundary-contact-review "$IN/checked-boundary-review-bundle.json"
  --door-boundary-closure-review "$IN/checked-door-boundary-review.json"
  --source-flat-landing-review checked
  --source-stepped-stair-review "$IN/positive-source-review.json"
  --source-door-standing-review "$IN/03-source-door-standing-review.json"
  --source-stair-base-standing-review "$IN/05-source-stair-base-standing-review.json"
  --door-aperture-review "$REVIEW"
  --validated-import-checkpoint-dir "$RUN/imports"
  --prepared-diagnostic-dir "$RUN/diagnostic")
if [ -n "${DRY_RUN:-}" ]; then (cd "$OIM" && printf '%q ' "${cmd[@]}"; echo); exit 0; fi

log=$RUN/compile-$(date -u +%Y%m%dT%H%M%SZ).log
{ echo "openindoormaps $(git -C "$OIM" rev-parse HEAD)"; echo "reviter $(git -C "$WORK/reviter" rev-parse HEAD)"
  echo "node $(node --version), $cores cores, $mem_gib GiB, floors $native, landings $landing, heap $heap"; } > "$log"

sync_pid=
if [ -n "${SYNC_DIR:-}" ]; then
  mkdir -p "$SYNC_DIR"
  ( while sleep 600; do
      copy "$RUN/checkpoints" "$SYNC_DIR/checkpoints" || true
      copy "$RUN/imports" "$SYNC_DIR/imports" || true
      cp "$log" "$SYNC_DIR/" || true
    done ) &
  sync_pid=$!
fi

set +e
# Each log line gets a UTC time so stage durations can be measured.
(cd "$OIM" && NODE_OPTIONS= "${cmd[@]}") 2>&1 | while IFS= read -r line; do
  printf '%s %s\n' "$(date -u +%H:%M:%S)" "$line"; done | tee -a "$log" | awk '{ print substr($0, 1, 240); fflush() }'
status=${PIPESTATUS[0]}
set -e
[ -n "$sync_pid" ] && kill "$sync_pid" 2>/dev/null || true
echo "Compile exit status: $status" | tee -a "$log"

# Package whatever was produced, success or not: the diagnostic directory
# keeps the computed data when a final gate refuses.
result=$RUN/compile-result-$(date -u +%Y%m%dT%H%M%SZ).tar.gz
tar -czf "$result" -C "$RUN" $(cd "$RUN" && ls -d output diagnostic 2>/dev/null) "$(basename "$log")"
sha256sum "$result" 2>/dev/null || shasum -a 256 "$result"
if [ -n "${SYNC_DIR:-}" ]; then
  copy "$RUN/checkpoints" "$SYNC_DIR/checkpoints"; cp "$result" "$log" "$SYNC_DIR/"
  echo "Copied result and log to $SYNC_DIR"
fi
exit "$status"
