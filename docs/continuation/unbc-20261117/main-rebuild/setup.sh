#!/bin/bash
# Colab setup for the November 17 main-based rebuild (D10, D12).
#   bash setup.sh OIM_SHA REVITER_SHA
# Clones both repositories at the given commits of branch
# claude/exciting-brown-u1petk, installs Node 22.22.0 and dependencies, and
# fetches the October 21 inputs from the owner's Drive (checked by SHA-256).
# Upload applied-gap-patches-73a765e9.zip to /content/upload first.
set -euo pipefail
OIM_SHA=${1:?usage: setup.sh OIM_SHA REVITER_SHA}; RV_SHA=${2:?usage: setup.sh OIM_SHA REVITER_SHA}
export TZ=UTC HUSKY=0 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
U=/content/upload; W=/content/unbc; mkdir -p $W $U
node --version 2>/dev/null | grep -qx v22.22.0 || (curl -fsSL https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1)
node --version; which rsync zstd >/dev/null || apt-get -qq install -y rsync zstd > /dev/null
declare -A SHA=( [openindoormaps]=$OIM_SHA [reviter]=$RV_SHA )
for repo in openindoormaps reviter; do
  [ -d $W/$repo ] || git clone -q https://github.com/ahzs645/$repo.git $W/$repo
  git -C $W/$repo fetch -q origin claude/exciting-brown-u1petk
  git -C $W/$repo checkout -q --detach ${SHA[$repo]}
  echo "$repo $(git -C $W/$repo rev-parse HEAD)"
done
(cd $W/reviter && [ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error) &
(cd $W/openindoormaps && [ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error) &
python3 -I $W/openindoormaps/docs/continuation/unbc-20261021/recompile/fetch-inputs.py $W/inputs
wait
A=$U/applied-gap-patches-73a765e9.zip
[ -f $A ] && echo "73a765e96091e2c01eef5331dfb8983998664bcb281444c23856d4842d5e494d  $A" | sha256sum -c - || { echo "Upload $A first"; exit 1; }
echo SETUP_DONE
