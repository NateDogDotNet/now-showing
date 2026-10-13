# Research: what agents (this session + Pulse pulse-a8) can do on the remaining 2.1 work without the owner

Written 2026-10-13 by conductor-2 at the owner's request ("Work with Pulse to research what can be achived between the two of you and without me."). Research only: nothing was changed, and no token was read, printed or hashed.

## Facts (commands run here; Pulse's answers quoted as testimony)
- This host reaches PMS: `curl -s -m 5 -o /dev/null -w '%{http_code}' http://192.168.1.156:32400/identity` → 200; PMS 1.43.3.10793, claimed="1".
- plex.tv reachable: `curl -s -o /dev/null -w '%{http_code}' https://plex.tv/api/v2/ping` → 400 (reachable; no client id sent).
- `which git-filter-repo` → /home/nathan/.local/bin/git-filter-repo.
- Pulse (testimony): its Plex API path reads the server's own PlexOnlineToken from HKCU:\Software\Plex, Inc.\Plex Media Server on HOME, used only against 127.0.0.1:32400; no copy kept. ssh home works unattended. Pulse devbox has Chrome + Playwright and reaches 192.168.1.156. No Raspberry Pi exists in Pulse records. Pulse did not call plex.tv /devices.xml (no rule authorises the server token for account-level calls).

## Classification
- A. Agent-doable now, no token, no approval: purge-git-history rehearsal in a scratch clone (no push); release-bump pre-flight probes.
- B. Agent-doable without a token but they are validation rows (owner said hands-on runs wait for him): V1-C01, C03, C04, E02, E23.
- C. Agent-doable after one owner act (approve one plex.tv/link code for a dedicated headless "validation" device; fresh token kept in that browser profile only, revoked after): V1-C02, C05, C06, C08-C10, C14-C16, C17 (memory via CDP, not Task Manager), E01, E03-E07, E09; C11-C13 and E08 also need a playback started (agent via a Plex Web tab, unproven, or owner presses play).
- D. Owner only: revocation, 401 check, receipt (his rule); E10; C07/E24 (needs an off-LAN device); E25 (turns Remote Access off on HOME: Pulse could, needs approval); Pi rows E11-E22 (no Pi: owner supplies one or rules SKIPPED, which the checklist allows; README "(verify)" tags then stay); purge approval; any PR.
- Rulings needed to use C: allow a fresh validation token in an agent browser profile; allow agent-run evidence for the hitl phases real-server-validation and real-server-validation-extended (D11 says "someone runs").
- Open risk: whether the leaked token equals the server's PlexOnlineToken is unknown; if it does, revoking it signs the server out and breaks Pulse's path. Only the owner can compare without an agent handling a token.
