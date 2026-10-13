#!/usr/bin/env bash
# Pre-claim probe for release-bump criterion 7 (stop 15, item 4).
# Runs the plan's current criterion 7 and the proposed form against stand-in trees
# in a scratch worktree; never touches the live tree.
set -u
REPO=/home/nathan/plex-poster-app
WT=$(mktemp -d)/wt
git -C "$REPO" worktree add -q --detach "$WT" 160aca2 || exit 1
trap 'git -C "$REPO" worktree remove --force "$WT"' EXIT
cd "$WT" || exit 1

old() { test "$(git status --porcelain --untracked-files=all | awk '{print $2}' | sort | tr '\n' ' ')" = "js/main.js package-lock.json package.json sw.js tests/e2e/release.spec.mjs "; }
new() { test "$(git status --porcelain --untracked-files=all | awk '{print $2}' | grep -v '^\.orchestrator/' | LC_ALL=C sort | tr '\n' ' ')" = "README.md Roadmap.md js/main.js package-lock.json package.json sw.js tests/e2e/release.spec.mjs "; }

touch_set() { for f in "$@"; do mkdir -p "$(dirname "$f")"; echo "// probe" >> "$f"; done; }
row() {
  local label=$1; shift
  git checkout -q -- . ; git clean -qfd
  touch_set "$@"
  old; local o=$?; new; local n=$?
  printf '| %s | %s | %s |\n' "$label" "$o" "$n"
}
FIVE="sw.js js/main.js package.json package-lock.json tests/e2e/release.spec.mjs"
echo "| case | old exit | new exit |"
echo "|---|---|---|"
row "nothing changed"
row "the five version files only" $FIVE
row "five + README.md + Roadmap.md (the phase as the follow-ups need it)" $FIVE README.md Roadmap.md
row "five + README + Roadmap + a .orchestrator/ edit (tracked snapshot)" $FIVE README.md Roadmap.md .orchestrator/state.md
row "five + README + Roadmap + an extra app file (js/engine.js)" $FIVE README.md Roadmap.md js/engine.js
row "five + README, Roadmap missing" $FIVE README.md
row "five + README + Roadmap + new untracked file" $FIVE README.md Roadmap.md tests/e2e/extra.spec.mjs
row "five + README + Roadmap + docs/decisions.md" $FIVE README.md Roadmap.md docs/decisions.md
