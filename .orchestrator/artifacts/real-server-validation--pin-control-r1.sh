#!/usr/bin/env bash
# Control for V1-C02: a plex.tv link code created with plain curl (same request shape as js/plex.js createPin),
# then polled every 5 s for up to 15 min. Prints only whether a token is present, never the token.
set -uo pipefail
CID="pin-control-$(date +%s)"
P=(-H 'Accept: application/json' -H "X-Plex-Product: Plex Poster Control" -H "X-Plex-Client-Identifier: $CID" -H "X-Plex-Device-Name: Plex Poster Control")
J=$(curl -s -m 15 -X POST "${P[@]}" 'https://plex.tv/api/v2/pins?strong=false')
ID=$(printf '%s' "$J" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
CODE=$(printf '%s' "$J" | python3 -c 'import json,sys; print(json.load(sys.stdin)["code"])')
echo "$(date -u +%T) control code: $CODE (pin id $ID)"
for i in $(seq 1 180); do
  S=$(curl -s -m 15 "${P[@]}" "https://plex.tv/api/v2/pins/$ID" | python3 -c 'import json,sys; j=json.load(sys.stdin); print("hasToken=%s expiresIn=%s" % (bool(j.get("authToken")), j.get("expiresIn")))')
  case "$S" in hasToken=True*) echo "$(date -u +%T) $S — control LINKED"; exit 0;; esac
  [ $((i % 12)) -eq 1 ] && echo "$(date -u +%T) $S"
  sleep 5
done
echo "$(date -u +%T) control never linked"; exit 1
