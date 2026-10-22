#!/usr/bin/env bash
# Poll the Colab compile every 10 minutes; exit when it finishes or the VM is gone.
fails=0
while true; do
  out=$(colab exec -s unbc --timeout 60 --env CMD='if pgrep -f "[r]egenerate-from-native-cache" >/dev/null; then echo STATE=running; else echo STATE=stopped; fi; tail -n 2 /content/unbc/run/compile-*.log | cut -c1-200; grep -h "Compile exit status" /content/unbc/run/compile-*.log; free -g | sed -n 2p; cat /content/drive/MyDrive/UNBC-recompile/last-sync.txt' -f /private/tmp/claude-501/-Users-ahmadjalil-github-openindoormaps/59659119-df7d-43bf-b098-c653b47a8fe0/scratchpad/sh.py 2>&1 | grep -v -i update)
  echo "== $(date -u +%FT%TZ)"; echo "$out"
  if echo "$out" | grep -q STATE=stopped; then echo COMPILE_STOPPED; exit 0; fi
  if echo "$out" | grep -q STATE=running; then fails=0; else fails=$((fails+1)); fi
  [ $fails -ge 3 ] && { echo VM_UNREACHABLE; exit 1; }
  sleep 600
done
