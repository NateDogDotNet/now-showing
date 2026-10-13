#!/usr/bin/env bash
# Second rehearsal probe: the plan's step 3 literally ("in a fresh clone", no extra branch setup).
# Does `git push --all` then cover both branches? Does filter-repo leave an old->new commit map?
set -uo pipefail
OUT=${1:?scratch dir}; BACKUP=${2:?backup.git from rehearsal-r1}
mkdir -p "$OUT" && cd "$OUT" || exit 1
echo '$ git clone -q --no-local BACKUP plain && git -C plain branch -a'
git clone -q --no-local "$BACKUP" plain && git -C plain branch -a
echo '$ git -C plain filter-repo --invert-paths --path config.js && git -C plain for-each-ref refs/heads refs/remotes'
(cd plain && git filter-repo --invert-paths --path config.js >/dev/null 2>&1; echo "exit $?")
git -C plain for-each-ref --format='%(refname) %(objectname:short)' refs/heads refs/remotes
echo "remotes left: $(git -C plain remote | wc -l)"
echo '$ wc -l plain/.git/filter-repo/commit-map; head -3'
wc -l < plain/.git/filter-repo/commit-map; head -3 plain/.git/filter-repo/commit-map | awk '{print substr($1,1,12), substr($2,1,12)}'
echo '$ old landed SHAs cited by the trail, mapped (sample)'
for s in d409ad7 e764aee 78b9f67 160aca2 3603ed8 e411e14 ee6fbbe; do
  full=$(git -C "$BACKUP" rev-parse --verify -q "$s^{commit}") || { echo "$s not in backup"; continue; }
  new=$(awk -v o="$full" '$1==o{print substr($2,1,7)}' plain/.git/filter-repo/commit-map); echo "$s -> ${new:-UNMAPPED}"
done
