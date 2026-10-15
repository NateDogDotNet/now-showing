#!/usr/bin/env bash
# purge-git-history: the real run (D49, D76, D77). Irreversible from the first point of no return.
# Usage: run.sh <scratch dir outside the repository> [--confirm-delete]   (without --confirm-delete it stops before the delete)
# Every check before the delete is a hard stop (set -e). No value from the replace list is ever printed.
set -euo pipefail
REPO=/home/nathan/plex-poster-app; OLD=NateDogDotNet/plex-poster-app; NEW=NateDogDotNet/now-showing
OUT=${1:?scratch dir}; CONFIRM=${2:-}; mkdir -p "$OUT"; cd "$OUT"
step() { printf '\n### %s\n' "$1"; }

step "0 preconditions"
test -z "$(git -C "$REPO" status --porcelain --untracked-files=all | grep -v '^?? \.orchestrator/')" || { echo "working tree not clean"; exit 1; }
test "$(git -C "$REPO" rev-parse HEAD)" = "$(git -C "$REPO" ls-remote origin refs/heads/claude/intelligent-rubin-4vsi63 | cut -f1)" || { echo "local tip differs from origin"; exit 1; }
gh auth status 2>&1 | grep -q delete_repo || { echo "gh lacks delete_repo"; exit 1; }
gh repo view "$NEW" >/dev/null 2>&1 && { echo "$NEW already exists"; exit 1; }
git filter-repo --version >/dev/null

step "1 backup: mirror of origin (kept until the owner says delete)"
git clone -q --mirror "https://github.com/$OLD.git" backup.git
echo "refs: $(git -C backup.git for-each-ref | wc -l); commits: $(git -C backup.git rev-list --all | wc -l)"

step "2 replace list (outside the repository; shredded at the end)"
L=$(git -C "$REPO" show 5c4a716:config.js | grep -oE '[A-Za-z0-9_-]{20}' | head -1); test -n "$L"
U=$(ssh -o BatchMode=yes home 'echo %USERPROFILE%' | tr -d '\r'); test -n "$U"
LIST="$OUT/replace.list"; : > "$LIST"
python3 - "$L" "$U" "$LIST" <<'PY'
import sys, urllib.parse
L, u, out = sys.argv[1], sys.argv[2], sys.argv[3]
base = u.split('\\')[-1]; first, last = base.split(' ', 1)
entries = [(L, '<leaked-token>')]
for v in {u, u.replace('\\','/'), u.replace('\\','\\\\'), u.replace(' ','%20'), u.replace('\\','/').replace(' ','%20'), u.replace('\\','\\\\').replace(' ','%20'), urllib.parse.quote(u), urllib.parse.quote(u, safe=':/')}:
    entries.append((v, '%USERPROFILE%'))
for v in [f'{first} {last}', f'{first}%20{last}', f'{first}|{last}', f'{first}\\|{last}']: entries.append((v, '<owner>'))
for v in (last, last.capitalize(), last.upper()): entries.append((v, '<owner-surname>'))
open(out, 'w').write(''.join(f'{a}==>{b}\n' for a, b in entries))
PY
git -C "$REPO" show 11ed786:.orchestrator/artifacts/real-server-validation--home-core-r1b.txt | grep -o '"[^"]* (shared)"' | sed 's/^"//; s/ (shared)"$//' | awk '{printf "%s==><shared server %d>\n", $0, NR}' >> "$LIST"
echo "list lines: $(wc -l < "$LIST")"; test "$(wc -l < "$LIST")" -ge 20

step "3 fresh clone and the rewrite"
git clone -q --no-local backup.git work
(cd work && for b in $(git -C ../backup.git for-each-ref --format='%(refname:short)' refs/heads/); do git branch -q --track "$b" "origin/$b" 2>/dev/null || true; done)
(cd work && git filter-repo --invert-paths --path config.js --replace-text "$LIST" 2>&1 | tail -2)
cp work/.git/filter-repo/commit-map "$OUT/commit-map"
test -z "$(git -C work log --all --oneline -- config.js)" || { echo "config.js still in history"; exit 1; }
while IFS= read -r line; do lit=${line%%==>*}; test -n "$lit"; test -z "$(git -C work log --all -F -S"$lit" --oneline)" || { echo "a list entry survives the rewrite"; exit 1; }; done < "$LIST"
for b in $(git -C work for-each-ref --format='%(refname:short)' refs/heads/); do test "$(git -C backup.git rev-parse "refs/heads/$b^{tree}")" = "$(git -C work rev-parse "refs/heads/$b^{tree}")" || { echo "tip tree changed: $b"; exit 1; }; done
(cd work && git fsck --no-dangling >/dev/null)
echo "rewrite verified: config.js 0 commits, every entry 0 commits, tip trees unchanged, fsck clean"
test "$CONFIRM" = "--confirm-delete" || { echo "STOP: rehearsal complete; re-run with --confirm-delete to delete $OLD and create $NEW"; shred -u "$LIST" 2>/dev/null || rm -f "$LIST"; exit 0; }

step "4 POINT OF NO RETURN 1: delete $OLD (removes pull request #1 and the Pages setting)"
gh repo delete "$OLD" --yes

step "5 create $NEW, push everything (POINT OF NO RETURN 2), default branch main"
gh repo create "$NEW" --public
(cd work && git remote add origin "https://github.com/$NEW.git" && git push -q --all origin && git push -q --tags origin)
gh repo edit "$NEW" --default-branch main
gh api -X POST "repos/$NEW/pages" -f source[branch]=main -f source[path]=/ >/dev/null || gh api -X PUT "repos/$NEW/pages" -f source[branch]=main -f source[path]=/ >/dev/null
gh repo edit "$NEW" --homepage "https://natedogdotnet.github.io/now-showing/"
echo "origin refs after push:"; git ls-remote "https://github.com/$NEW.git" | cut -c1-12,41- ; test -z "$(git ls-remote "https://github.com/$NEW.git" 'refs/pull/*')"

step "6 re-sync the conductor's checkout"
git -C "$REPO" remote set-url origin "https://github.com/$NEW.git"
git -C "$REPO" fetch -q --prune --force origin
for b in $(git -C "$REPO" for-each-ref --format='%(refname:short)' refs/heads/); do case "$b" in orch/*) git -C "$REPO" branch -q -D "$b";; main|claude/intelligent-rubin-4vsi63) git -C "$REPO" update-ref "refs/heads/$b" "refs/remotes/origin/$b";; esac; done
git -C "$REPO" reset -q --hard "origin/claude/intelligent-rubin-4vsi63"; git -C "$REPO" reflog expire --expire=now --all; git -C "$REPO" gc -q --prune=now
echo "checkout tip: $(git -C "$REPO" rev-parse --short HEAD); config.js in history: $(git -C "$REPO" log --all --oneline -- config.js | wc -l)"
shred -u "$LIST" 2>/dev/null || rm -f "$LIST"; echo "list removed; backup.git and commit-map kept in $OUT"
