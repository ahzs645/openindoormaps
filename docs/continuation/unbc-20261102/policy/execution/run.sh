#!/bin/bash
# Resumable explicit-policy matrix run: worker stage, normal stage, report.
set -u
cd /home/user/wt-policy-matrix
export TZ=UTC
W=/home/user/unbc-work/policy-matrix
S=docs/continuation/unbc-20261030/connections/run-supervised.py
V=/home/user/unbc-work/vp/visitor/viewer/indoor.json
SHA=39e9fed5dde728cb42fd3511614e1d3236bc28c6cb11bdfd14532c989f2be008
CASES=docs/continuation/unbc-20261102/policy/POLICY-CASES.json
PUB=/home/user/unbc-work/vp/public/data/unbc
CAR=/home/user/unbc-work/vp/public/data/unbc-routing/dec83a467f07fdf12fa3b3d3bbb29b858acec5d594c94f13e25a07d3aab5bb38.json.gz
OUT=$W/matrix.json
COMMON="$V $SHA $CASES $OUT --publication $PUB --carrier $CAR"
for stage in ${STAGES:-worker normal}; do
  T=$(date -u +%Y%m%dT%H%M%SZ)
  E=$W/evidence/$stage-$T
  mkdir -p $W/evidence
  HEAP=""
  [ $stage = normal ] && HEAP="--max-old-space-size=9216 --expose-gc"
  echo "stage $stage start $T"
  flock /home/user/unbc-work/agents-heavy.lock python3 $S --log $E.log --memory-log $E.memory.jsonl --execution-report $E.execution.json --timeout-seconds 7000 -- node $HEAP --import tsx scripts/indoor/run-explicit-policy-matrix.ts $COMMON --stage $stage
  echo "stage $stage exit $?"
done
node --import tsx scripts/indoor/run-explicit-policy-matrix.ts $COMMON --stage report
echo MATRIX_DONE
