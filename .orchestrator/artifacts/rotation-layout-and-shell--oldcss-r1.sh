#!/usr/bin/env bash
# Conductor probe (append-only): the rotation specs must FAIL when css/app.css (and js/display.js)
# are reverted to the pre-phase versions (F1 bug present). Run in a scratch worktree.
set -u; WT=/home/user/wt-rotation-layout-and-shell; A=/home/user/plex-poster-app/.orchestrator/artifacts
d=$(mktemp -d) || exit 2; git -C $WT worktree add -q --detach $d/wt HEAD || exit 2
(cd $WT && git diff --cached --binary) | (cd $d/wt && git apply --index) || exit 2
(cd $d/wt && git checkout HEAD -- css/app.css js/display.js) || exit 2
out=$(cd $d/wt && E2E_PORT=$((20000+RANDOM%9000)) E2E_MOCK_PORT=$((30000+RANDOM%9000)) timeout 600 npm run test:e2e -- rotation ui-rotation 2>&1); rc=$?
git -C $WT worktree remove --force $d/wt; rm -rf $d
echo "$out" | grep -E "^(PASS|FAIL)|AssertionError|centre|inside" | head -12; echo "rc=$rc"
echo "$out" | grep -q '^FAIL rotation' && echo "$out" | grep -q '^FAIL ui-rotation'
