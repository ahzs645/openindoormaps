#!/bin/zsh
# Parallel derive: the main process prepares dataset-prepared.json (re-bind, fresh binds, proposals) and derives the first level group;
# two RECEIPT_PART processes start once that file exists and derive the other groups. usage: derive-parallel.sh <candidate-dir>
C=$1; cd ~/github/openindoormaps
S=$C/scripts/derive-areas.mts; L=$C/logs
node --max-old-space-size=20000 --import tsx $S candidate 311 2295121 1450417 > $L/derive.log 2>&1 &
MAIN=$!
until [ -f $C/data/candidate/dataset-prepared.json ] && [ -f $C/data/candidate/receipt.json ]; do kill -0 $MAIN 2>/dev/null || { echo "main derive exited early"; exit 1; }; sleep 5; done
RECEIPT_PART=b node --max-old-space-size=16000 --import tsx $S candidate 694 1425915 > $L/derive-b.log 2>&1 &
B=$!
RECEIPT_PART=c node --max-old-space-size=16000 --import tsx $S candidate 400176 1487353 402367 1487816 > $L/derive-c.log 2>&1 &
CC=$!
wait $MAIN; m=$?; wait $B; b=$?; wait $CC; c=$?
echo "exit main=$m b=$b c=$c"
