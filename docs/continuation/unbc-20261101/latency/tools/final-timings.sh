#!/bin/bash
# Final before/after browser timings with minified production builds.
L=/home/user/unbc-work/agents/latency
cd /home/user/openindoormaps
for variant in before after; do
  ln -sfn $L/builds/$variant $L/public/openindoormaps
  for mode in desktop mobile; do
    for rep in 1 2; do
      label="final-$rep"
      [ -f $L/runs/final-$variant/$mode-$label-timing.json ] && continue
      TZ=UTC flock /home/user/unbc-work/agents-heavy.lock node $L/tools/profile-route.mjs \
        http://127.0.0.1:42601/openindoormaps/ http://127.0.0.1:42601/data/unbc/manifest.json \
        $L/runs/final-$variant $mode $label > $L/runs-final-$variant-$mode-$rep.log 2>&1
      echo "$variant $mode $rep exit $?"
    done
  done
done
echo ALLDONE
