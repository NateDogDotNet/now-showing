# Token rotation receipt

Rotated: yes
Date: 2026-10-14
Method: other
Old token rejected (HTTP 401): yes
History purge chosen: yes (see purge-git-history)

The Plex token committed in `5c4a716:config.js` no longer works. Who revoked it is not on record; the owner gave the method as "other" and the date as 2026-10-14.

The 401 check ran on 2026-10-14 at 00:57 UTC, at the owner's request, from the conductor's shell. The old token went to plex.tv `GET /api/v2/user` in a request header read from a file descriptor. plex.tv answered HTTP 401, so the plan's check (status equals 401) holds. A made-up token sent the same way also got 401, as expected. The token was never printed or written to any file.

No token appears in this file.
