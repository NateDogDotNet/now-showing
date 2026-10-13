#!/usr/bin/env bash
# Pre-claim rehearsal of purge-git-history (owner request 2026-10-13: "do the purge rehearsal now").
# Runs the plan's hand-off steps against LOCAL copies only. Nothing is pushed to GitHub:
# the force-push goes to a local bare stand-in for origin. The leaked value is only ever
# counted (grep -c / wc -l), never printed.
set -uo pipefail
REPO=/home/nathan/plex-poster-app
OUT=${1:?usage: rehearsal.sh <scratch dir>}
mkdir -p "$OUT" && cd "$OUT" || exit 1
step() { printf '\n### %s\n$ %s\n' "$1" "$2"; }

L=$(git -C "$REPO" show 5c4a716:config.js | grep -oE '[A-Za-z0-9_-]{20}' | head -1)
test -n "$L" || { echo "no leaked value found in 5c4a716"; exit 1; }
hits() { # repos-wide count of commits whose tree holds the value; never prints it
  local d=$1; git -C "$d" rev-list --all | while read -r c; do git -C "$d" grep -q -F "$L" "$c" -- && echo "$c"; done | wc -l; }
blobs() { # count of blobs (any object, reachable from any ref) containing the value
  local d=$1; git -C "$d" cat-file --batch-all-objects --batch-check='%(objectname) %(objecttype)' \
    | awk '$2=="blob"{print $1}' | while read -r b; do git -C "$d" cat-file -p "$b" | grep -q -F "$L" && echo "$b"; done | wc -l; }

step "1 backup: mirror clone of GitHub origin" "git clone -q --mirror \$(git -C REPO remote get-url origin) backup.git"
git clone -q --mirror "$(git -C "$REPO" remote get-url origin)" backup.git; echo "exit $?"
git -C backup.git for-each-ref --format='%(refname) %(objectname:short)'
echo "commits reachable from all refs: $(git -C backup.git rev-list --all | wc -l)"
echo "commits whose tree holds the leaked value: $(hits backup.git)"
echo "blobs holding the leaked value: $(blobs backup.git)"
echo "commits touching config.js: $(git -C backup.git log --all --oneline -- config.js | wc -l)"

step "2 tool" "git filter-repo --version"
git filter-repo --version; echo "exit $?"

step "3 fresh clone, then the plan's rewrite" "git clone -q --no-local backup.git work && git -C work filter-repo --invert-paths --path config.js"
git clone -q --no-local backup.git work && (cd work && for b in $(git -C ../backup.git for-each-ref --format='%(refname:short)' refs/heads/); do git branch -q --track "$b" "origin/$b" 2>/dev/null; done; git branch -a)
(cd work && git filter-repo --invert-paths --path config.js 2>&1 | tail -4); echo "exit $?"
git -C work for-each-ref --format='%(refname) %(objectname:short)' refs/heads/
echo "commits: $(git -C work rev-list --all | wc -l)"
echo "commits whose tree holds the leaked value: $(hits work)"
echo "blobs holding the leaked value: $(blobs work)"
echo "commits touching config.js: $(git -C work log --all --oneline -- config.js | wc -l)"

step "3b tip trees unchanged (config.js is in no tip)" "git rev-parse <branch>^{tree} before vs after"
for b in $(git -C work for-each-ref --format='%(refname:short)' refs/heads/); do
  before=$(git -C backup.git rev-parse "refs/heads/$b^{tree}"); after=$(git -C work rev-parse "refs/heads/$b^{tree}")
  printf '%s  before %s  after %s  %s\n' "$b" "${before:0:12}" "${after:0:12}" "$([ "$before" = "$after" ] && echo same || echo DIFFERENT)"
done

step "4+5 re-add origin (local bare stand-in) and force-push" "git remote add origin standin.git && git push --force-with-lease --all && git push --force --tags"
git clone -q --mirror backup.git standin.git
git -C standin.git for-each-ref --format='%(refname)' | grep -v '^refs/heads/' | sed 's/^/stand-in keeps non-branch ref: /'
(cd work && git remote add origin ../standin.git && git fetch -q origin && git push --force-with-lease --all 2>&1 | tail -3; echo "push --all exit ${PIPESTATUS[0]}"; git push --force --tags 2>&1 | tail -1; echo "push --tags exit ${PIPESTATUS[0]}")

step "criterion 1, verbatim, from a clone whose origin is the stand-in" 'd=$(mktemp -d) && git clone -q "$(git remote get-url origin)" "$d/fresh" && test -z "$(git -C "$d/fresh" log --all --oneline -- config.js)"'
(cd work && d=$(mktemp -d) && git clone -q "$(git remote get-url origin)" "$d/fresh" && test -z "$(git -C "$d/fresh" log --all --oneline -- config.js)"; echo "exit $?")

step "criterion 3, verbatim, in the rewritten clone" 'git fsck --no-dangling >/dev/null 2>&1'
(cd work && git fsck --no-dangling >/dev/null 2>&1; echo "exit $?")

step "stand-in after push: what a fresh GitHub clone would still see" "hits/blobs over every ref of standin.git"
echo "commits whose tree holds the leaked value (all refs): $(hits standin.git)"
echo "blobs holding the leaked value (all objects): $(blobs standin.git)"
git -C standin.git for-each-ref --format='%(refname) %(objectname:short)' | grep -v '^refs/heads/' | while read -r r o; do
  echo "non-branch ref $r -> $o, reaches config.js commits: $(git -C standin.git log --oneline "$r" -- config.js | wc -l)"; done
unset L
