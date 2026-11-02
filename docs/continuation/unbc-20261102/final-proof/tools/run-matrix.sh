#!/bin/bash
# Explicit-policy matrix on the final inputs: worker and normal stages (each
# under the shared heavy-job lock, supervised), then the strict report.
#   run-matrix.sh REPO VISITOR.json VISITOR-SHA256 PUBLICATION-DIR CARRIER.json.gz OUT.json
set -u
repo=$1 visitor=$2 sha=$3 pub=$4 carrier=$5 out=$6
lock=${HEAVY_LOCK:-/home/user/unbc-work/heavy2.lock}
cd "$repo"
export TZ=UTC
S=docs/continuation/unbc-20261030/connections/run-supervised.py
D=docs/continuation/unbc-20261102
COMMON="$visitor $sha $D/policy/POLICY-CASES.json $out --publication $pub --carrier $carrier"
E=$(dirname "$out")/matrix-evidence; mkdir -p "$E"
for stage in ${STAGES:-worker normal}; do
  T=$(date -u +%Y%m%dT%H%M%SZ)
  HEAP=""; [ $stage = normal ] && HEAP="--max-old-space-size=9216 --expose-gc"
  flock "$lock" python3 $S --log $E/$stage-$T.log --memory-log $E/$stage-$T.memory.jsonl \
    --execution-report $E/$stage-$T.execution.json --timeout-seconds 7000 -- \
    node $HEAP --import tsx scripts/indoor/run-explicit-policy-matrix.ts $COMMON --stage $stage
  echo "stage $stage exit $?"
done
node --import tsx scripts/indoor/run-explicit-policy-matrix.ts $COMMON --stage report \
  --expectations $D/final-proof/POLICY-EXPECTATIONS.json
echo "report exit $?"
