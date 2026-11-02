#!/bin/bash
# Asserted browser proof, desktop then mobile, each under the heavy lock.
set -u
cd /home/user/wt-policy-matrix
export TZ=UTC
W=/home/user/unbc-work/policy-matrix
S=docs/continuation/unbc-20261030/connections/run-supervised.py
PORT=${PORT:-42731}
OUT=$W/browser-out
mkdir -p $OUT $W/evidence
for mode in ${MODES:-desktop mobile}; do
  T=$(date -u +%Y%m%dT%H%M%SZ)
  E=$W/evidence/browser-$mode-$T
  echo "browser $mode queued $T"
  flock -o /home/user/unbc-work/agents-heavy.lock bash -c "
    (cd /home/user/unbc-work/vp/public && exec python3 -m http.server $PORT --bind 127.0.0.1 > $E.http.log 2>&1) &
    HTTP=\$!; sleep 2; cd /home/user/wt-policy-matrix
    python3 $S --log $E.log --memory-log $E.memory.jsonl --execution-report $E.execution.json --timeout-seconds 3600 -- node docs/continuation/unbc-20261102/visitor/proof-chosen-candidate-asserted.mjs http://127.0.0.1:$PORT/openindoormaps/ http://127.0.0.1:$PORT/data/unbc/manifest.json $OUT $mode docs/continuation/unbc-20261102/policy/browser/JOURNEYS.json
    RC=\$?; kill \$HTTP; exit \$RC"
  echo "browser $mode exit $?"
done
echo BROWSER_DONE
