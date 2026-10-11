#!/usr/bin/env bash
# Mutations for serve-config-guard r1, each in a scratch copy of the staged tree. Append-only.
set -u
A=/home/user/plex-poster-app/.orchestrator/artifacts; P=serve-config-guard
run() { name=$1; hazard=$2; file=$3; from=$4; to=$5
  d=$(mktemp -d) || exit 2; git -C /home/user/wt-$P worktree add -q --detach "$d/wt" HEAD || exit 2
  (cd /home/user/wt-$P && git diff --cached) | (cd "$d/wt" && git apply) || exit 2
  cp "$d/wt/$file" "$d/orig"; python3 - "$d/wt/$file" "$from" "$to" <<'PY'
import sys; p,a,b=sys.argv[1:]; s=open(p).read(); open(p,'w').write(s.replace(a,b,1)) if a in s else print("DID NOT APPLY")
PY
  { echo "Hazard: $hazard"; echo "## diff"; diff -u "$d/orig" "$d/wt/$file" | head -20; echo "## test"; (cd "$d/wt" && node --test tests/serve.test.js 2>&1 | tail -12) > "$d/out"; cat "$d/out"; n=$(grep -oE '^# fail [0-9]+' "$d/out" | awk '{print $3}'); echo "## summary"; echo "${n:-0} failed"; } > $A/$P--mutation-$name-r1.txt
  git -C /home/user/wt-$P worktree remove --force "$d/wt"; rm -rf "$d"; echo "$name: $(tail -1 $A/$P--mutation-$name-r1.txt)"; }
run drop-host-check "a loopback peer with a foreign Host (DNS rebinding) gets config.json" scripts/serve.mjs "|| !isLoopbackHost(req.headers.host)" ""
run trust-mapped "IPv4-mapped LAN peers treated as loopback" scripts/net.mjs "if (a === '::1') return true;" "if (a === '::1' || addr.startsWith('::ffff:')) return true;"
run no-normalise "dot-segment / case variants reach config.json" scripts/serve.mjs "if (raw !== '/config.json') return send(res, 404, 'Not found');" ""
run allow-all "repo internals served to the LAN" scripts/serve.mjs "if (!FILES.has(path) && !DIRS.some((d) => path.startsWith(d))) return send(res, 404, 'Not found');" ""
