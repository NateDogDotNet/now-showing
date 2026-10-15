#!/usr/bin/env bash
# Rehearsal r2 of purge-git-history (D77): the D49/D77 rewrite with --replace-text, against LOCAL copies only.
# Nothing is pushed to GitHub. The replace list is built at run time in the scratch dir from live values and deleted
# at the end; no value in it is ever printed (counts only).
set -uo pipefail
REPO=/home/nathan/plex-poster-app
OUT=${1:?usage: rehearsal-r2.sh <scratch dir>}
mkdir -p "$OUT" && cd "$OUT" || exit 1
step() { printf '\n### %s\n$ %s\n' "$1" "$2"; }

step "0 build the replace list outside the repository" "token from 5c4a716:config.js; %USERPROFILE% from HOME in every spelling; the surname; the four shared-server names from 11ed786's C05 row"
L=$(git -C "$REPO" show 5c4a716:config.js | grep -oE '[A-Za-z0-9_-]{20}' | head -1); test -n "$L" || { echo "no leaked value"; exit 1; }
U=$(ssh -o BatchMode=yes home 'echo %USERPROFILE%' | tr -d '\r'); test -n "$U" || { echo "no USERPROFILE"; exit 1; }
LIST="$OUT/replace.list"; : > "$LIST"
python3 - "$L" "$U" "$LIST" <<'PY'
import sys, urllib.parse
L, u, out = sys.argv[1], sys.argv[2], sys.argv[3]
base = u.split('\\')[-1]; first, last = base.split(' ', 1)
entries = [(L, '<leaked-token>')]
for v in {u, u.replace('\\','/'), u.replace('\\','\\\\'), u.replace(' ','%20'), u.replace('\\','/').replace(' ','%20'), u.replace('\\','\\\\').replace(' ','%20'), urllib.parse.quote(u), urllib.parse.quote(u, safe=':/')}:
    entries.append((v, '%USERPROFILE%'))
for v in [f'{first} {last}', f'{first}%20{last}', f'{first}|{last}', f'{first}\\|{last}']:
    entries.append((v, '<owner>'))
entries.append((last, '<owner-surname>')); entries.append((last.capitalize(), '<owner-surname>')); entries.append((last.upper(), '<owner-surname>'))
with open(out, 'w') as f:
    for lit, rep in entries: f.write(f'{lit}==>{rep}\n')
print('entries so far', len(entries))
PY
git -C "$REPO" show 11ed786:.orchestrator/artifacts/real-server-validation--home-core-r1b.txt | grep -o '"[^"]* (shared)"' | sed 's/^"//; s/ (shared)"$//' | awk '{printf "%s==><shared server %d>\n", $0, NR}' >> "$LIST"
echo "replace list lines: $(wc -l < "$LIST") (values not printed)"

step "1 backup: mirror clone of GitHub origin" "git clone -q --mirror origin backup.git"
git clone -q --mirror "$(git -C "$REPO" remote get-url origin)" backup.git; echo "exit $?"
git -C backup.git for-each-ref --format='%(refname) %(objectname:short)'
echo "commits reachable from all refs: $(git -C backup.git rev-list --all | wc -l)"
echo "commits touching config.js: $(git -C backup.git log --all --oneline -- config.js | wc -l)"
echo "commits whose diff adds or removes each list entry (per line, before):"; n=0; while IFS= read -r line; do lit=${line%%==>*}; n=$((n+1)); printf '  entry %d: %s commits\n' "$n" "$(git -C backup.git log --all -S"$lit" --oneline | wc -l)"; done < "$LIST"

step "2 fresh clone and the D77 rewrite" "git clone -q --no-local backup.git work && git -C work filter-repo --invert-paths --path config.js --replace-text \$LIST"
git clone -q --no-local backup.git work && (cd work && for b in $(git -C ../backup.git for-each-ref --format='%(refname:short)' refs/heads/); do git branch -q --track "$b" "origin/$b" 2>/dev/null; done; true)
(cd work && git filter-repo --invert-paths --path config.js --replace-text "$LIST" 2>&1 | tail -3); echo "exit $?"
echo "commits: $(git -C work rev-list --all | wc -l)"; echo "commits touching config.js: $(git -C work log --all --oneline -- config.js | wc -l)"
echo "commit-map lines: $(wc -l < work/.git/filter-repo/commit-map)"

step "3 criterion 1's per-line check (D77) in the rewritten clone" 'while read line; do test -z "$(git log --all -S"$line" --oneline)" || exit 1; done < $LIST'
fail=0; n=0; while IFS= read -r line; do lit=${line%%==>*}; n=$((n+1)); c=$(git -C work log --all -S"$lit" --oneline | wc -l); printf '  entry %d: %s commits\n' "$n" "$c"; [ "$c" = 0 ] || fail=1; done < "$LIST"; echo "per-line check exit $fail"
echo "blobs in the rewritten clone holding the leaked value: $(git -C work cat-file --batch-all-objects --batch-check='%(objectname) %(objecttype)' | awk '$2=="blob"{print $1}' | while read -r b; do git -C work cat-file -p "$b" | grep -q -F "$L" && echo "$b"; done | wc -l)"

step "4 tip trees before vs after (every spelling is masked at HEAD, so the tips should match)" "git rev-parse <branch>^{tree}"
for b in $(git -C work for-each-ref --format='%(refname:short)' refs/heads/); do before=$(git -C backup.git rev-parse "refs/heads/$b^{tree}"); after=$(git -C work rev-parse "refs/heads/$b^{tree}"); printf '%s  before %s  after %s  %s\n' "$b" "${before:0:12}" "${after:0:12}" "$([ "$before" = "$after" ] && echo same || echo DIFFERENT)"; done
git -C work diff --stat "$(git -C backup.git rev-parse refs/heads/claude/intelligent-rubin-4vsi63)" "$(git -C work rev-parse refs/heads/claude/intelligent-rubin-4vsi63)" 2>/dev/null | tail -2 || echo "(old tip object not in the rewritten clone, as expected)"

step "5 criterion 3 in the rewritten clone" "git fsck --no-dangling"
(cd work && git fsck --no-dangling >/dev/null 2>&1; echo "exit $?")

step "6 clean-up" "shred the replace list; keep backup.git and work for the audit"
shred -u "$LIST" 2>/dev/null || rm -f "$LIST"; echo "list removed: $([ -e "$LIST" ] && echo no || echo yes)"
