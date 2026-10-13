#!/usr/bin/env bash
# usage: round--mutate-r1.sh <phase> <mutant-name> <hazard> <file> <from-file> <to-file> <test command...>
# Applies one string replacement (from/to read from files) to <file> in a scratch worktree of the
# phase's staged tree, runs the test command there, writes <phase>--mutation-<name>-r1.txt with the
# diff above the output and a final "<N> failed" line (N = 1 if the command exits non-zero, or the
# node --test "# fail N" count when present). Append-only: never edited after first run.
set -u
P=$1; NAME=$2; HAZ=$3; FILE=$4; FROM=$5; TO=$6; shift 6
A=/home/nathan/plex-poster-app/.orchestrator/artifacts; WT=/home/nathan/wt-$P; OUT=$A/$P--mutation-$NAME-r1.txt
d=$(mktemp -d) || exit 2
git -C "$WT" worktree add -q --detach "$d/wt" HEAD || exit 2
(cd "$WT" && git diff --cached --binary) | (cd "$d/wt" && git apply --index) || exit 2
[ -d "$WT/node_modules" ] && ln -s "$WT/node_modules" "$d/wt/node_modules"
cp "$d/wt/$FILE" "$d/orig"
applied=$(python3 - "$d/wt/$FILE" "$FROM" "$TO" <<'PY'
import sys; p,a,b=sys.argv[1:]; a=open(a).read(); b=open(b).read(); s=open(p).read()
print("ok" if a in s else "DID NOT APPLY"); open(p,'w').write(s.replace(a,b,1)) if a in s else None
PY
)
{ echo "Hazard: $HAZ"; echo "Mutant: $NAME ($FILE) — $applied"; echo "## diff"; diff -u "$d/orig" "$d/wt/$FILE" | head -30
  echo "## test: $*"; (cd "$d/wt" && E2E_PORT=$((20000+RANDOM%9000)) E2E_MOCK_PORT=$((30000+RANDOM%9000)) timeout 600 bash -c "$*" > "$d/out" 2>&1); rc=$?; tail -25 "$d/out"
  n=$(grep -oE '^# fail [0-9]+' "$d/out" | tail -1 | awk '{print $3}'); [ -z "$n" ] && { [ $rc -ne 0 ] && n=1 || n=0; }
  echo "## summary (exit $rc)"; echo "$n failed"; } > "$OUT"
git -C "$WT" worktree remove --force "$d/wt"; rm -rf "$d"; echo "$P/$NAME: $(sed -n 2p $OUT) → $(tail -1 $OUT)"
