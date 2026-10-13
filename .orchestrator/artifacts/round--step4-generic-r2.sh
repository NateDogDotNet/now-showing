#!/usr/bin/env bash
# v2 of round--step4-generic-r1.sh: lints with round--eslint-r1e.config.mjs (r1 pointed at the stale first config).
# usage: round--step4-generic-r1.sh <phase> <worktree> <label> <comma-separated Output paths>
# Writes <phase>--precommit-{lint,format,tests,security}-<label>.json and <phase>--scope-<label>.json
# from evidence.py exec in the worktree. Append-only: never edited after first run.
set -u
P=$1; WT=$2; L=$3; OUT=$4
A=/home/nathan/plex-poster-app/.orchestrator/artifacts
E="python3 $HOME/.claude/scripts/cc_utils/evidence.py exec --timeout 900"
cd "$WT" || exit 2
JS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(m?js)$' | tr '\n' ' ')
if [ -n "$JS" ]; then $E --kind lint --shell "eslint --no-config-lookup -c $A/round--eslint-r1e.config.mjs $JS && for f in $JS; do node --check \$f || exit 1; done" > $A/$P--precommit-lint-$L.json
else $E --kind lint --shell "echo 'N/A: no JS in the staged set'; true" > $A/$P--precommit-lint-$L.json; fi
$E --kind lint --shell "git diff --cached --check" > $A/$P--precommit-format-$L.json
$E --kind test --shell "npm test" > $A/$P--precommit-tests-$L.json
$E --kind lint --shell "! git diff --cached -U0 | grep -E '^\+' | grep -nE '(X-Plex-Token[=:] *[A-Za-z0-9_-]{15,}|os2x1fGZ|BEGIN (RSA|OPENSSH) PRIVATE KEY|password *= *[\"\x27][^\"\x27]{4,})'" > $A/$P--precommit-security-$L.json
PAT=$(echo "$OUT" | sed 's/,/|/g')
$E --kind test --shell "test -z \"\$(git diff --cached --name-only | grep -vxE '($PAT)')\" && test -z \"\$(git status --porcelain | grep -v '^[AM]  ')\"" > $A/$P--scope-$L.json
for f in lint format tests security; do printf '%s %s exit=%s\n' $P $f "$(python3 -c "import json;print(json.load(open('$A/$P--precommit-$f-$L.json'))['exit'])")"; done
printf '%s scope exit=%s\n' $P "$(python3 -c "import json;print(json.load(open('$A/$P--scope-$L.json'))['exit'])")"
