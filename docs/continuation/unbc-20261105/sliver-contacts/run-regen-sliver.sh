#!/bin/bash
# Gap-patch + sliver-contact regeneration on this host. Resumable: rerun the
# same command after an interruption (checkpoints in run/checkpoints, private
# import data in run/imports). Holds the heavy lock for the whole run.
# Code: producer clones on claude/sliver-contacts
#   openindoormaps bdef4a6 (= 7c27b67 + boundary-patch source review + contact rule)
#   reviter        f65823a (= cb140e46 + contact rule)
# Input master: the unchanged October 21 source d5a829e8 (inputs/master.zip).
# Never point this at regen/ (Nov 4 code and checkpoints).
set -u
W=/home/user/unbc-work; WORK=$W/gap-patches/regen-sliver; N=$(date -u +%Y%m%dT%H%M%S)
[ "$(git -C $WORK/openindoormaps rev-parse HEAD)" = bdef4a6781b3084d351a47bbc57a8524e8953562 ] || { echo "openindoormaps is not at bdef4a6"; exit 1; }
[ "$(git -C $WORK/reviter rev-parse HEAD)" = f65823a93881ceeb917186f78fed74297eae0ee3 ] || { echo "reviter is not at f65823a"; exit 1; }
mkdir -p $WORK/logs; cd $WORK
TZ=UTC flock $W/heavy2.lock python3 /home/user/wt-gap-patches/docs/continuation/unbc-20261030/connections/run-supervised.py \
  --log $WORK/logs/regen-$N.log --memory-log $WORK/logs/regen-$N.memory.jsonl --execution-report $WORK/logs/regen-$N.execution.json \
  --timeout-seconds 216000 -- env NATIVE_WORKERS=1 LANDING_WORKERS=1 PARENT_HEAP_MIB=7168 NATIVE_WORKER_HEAP_MIB=4096 \
  BOUNDARY_PATCH_REVIEW=$WORK/OWNER-GAP-PATCHES.native-boundary-patches.json \
  BOUNDARY_PATCH_SUPERSESSIONS=$WORK/CONTACT-REPAIR-SUPERSESSIONS.json \
  APPLIED_BOUNDARY_PATCH_MASTER=$WORK/inputs/applied-gap-patches-73a765e9.zip \
  bash $WORK/openindoormaps/docs/continuation/unbc-20261021/recompile/run.sh $WORK
echo "REGEN_EXIT $?"
