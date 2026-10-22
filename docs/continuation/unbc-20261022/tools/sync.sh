#!/usr/bin/env bash
# Copy checkpoints, private import data, logs and results to Drive every 10 min
# while the compile runs, then once more after it ends.
RUN=/content/unbc/run SYNC=/content/drive/MyDrive/UNBC-recompile
mkdir -p "$SYNC"
printf '{"openindoormaps":"%s","reviter":"%s"}\n' "$(git -C /content/unbc/openindoormaps rev-parse HEAD)" "$(git -C /content/unbc/reviter rev-parse HEAD)" > "$SYNC/commits.json"
once() {
  for d in checkpoints imports; do [ -d "$RUN/$d" ] && rsync -a "$RUN/$d/" "$SYNC/$d/"; done
  cp -f "$RUN"/compile-*.log "$RUN"/compile-result-*.tar.gz /content/unbc/run.out "$SYNC/" 2>/dev/null
  date -u +%FT%TZ > "$SYNC/last-sync.txt"
}
while pgrep -f "[r]egenerate-from-native-cache" >/dev/null; do once; sleep 600; done
sleep 120; once; echo done >> "$SYNC/last-sync.txt"
