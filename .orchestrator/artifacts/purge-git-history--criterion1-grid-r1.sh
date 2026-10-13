#!/usr/bin/env bash
# D49 probe: plan criterion 1 as written vs extended with a refs/pull check, over origin stand-ins.
set -uo pipefail
S=${1:?scratch dir from rehearsal-r1}   # holds backup.git (pre-purge mirror) and standin.git (purged branches + refs/pull/1/head)
old='d=$(mktemp -d) && git clone -q "$(git remote get-url origin)" "$d/fresh" && test -z "$(git -C "$d/fresh" log --all --oneline -- config.js)"'
new='d=$(mktemp -d) && git clone -q "$(git remote get-url origin)" "$d/fresh" && test -z "$(git -C "$d/fresh" log --all --oneline -- config.js)" && test -z "$(git ls-remote "$(git remote get-url origin)" "refs/pull/*")"'
fresh=$(mktemp -d)/recreated.git; git init -q --bare "$fresh"; git -C "$S/standin.git" push -q "$fresh" 'refs/heads/*:refs/heads/*'
run() { local label=$1 url=$2 w; w=$(mktemp -d); git -C "$w" init -q && git -C "$w" remote add origin "$url"
  (cd "$w" && bash -c "$old"); local o=$?; (cd "$w" && bash -c "$new"); local n=$?; printf '| %s | %s | %s |\n' "$label" "$o" "$n"; }
echo "| origin state | old exit | new exit |"; echo "|---|---|---|"
run "before purge (mirror of today's GitHub)" "$S/backup.git"
run "after force-push, PR ref kept (option a without Support)" "$S/standin.git"
run "re-created repo: purged branches only (option b)" "$fresh"
run "re-created repo but an unpurged branch pushed by mistake" "$S/backup.git"
