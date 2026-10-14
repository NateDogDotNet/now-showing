Agent: ha-panel-research-r1 · model: claude-sonnet-5-5 · checked: 2026-10-14

produced_by: orchestrator-research · model: claude-sonnet-5-5 · question: Which popular home automation servers let a third-party browser page read states and call actions, embed their dashboard, push live updates, run local-only, and what is the safe approach for a kiosk poster app?
answer: Home Assistant is the best fit: its WebSocket API gives state push and service calls from a page, and its CORS and framing settings are documented. Recommended approach: a thin proxy in the local helper that holds a limited-user token (details below).
confidence: medium - HA, openHAB and Z2M claims were checked on official pages. Hubitat, Homey, SmartThings and HomeKit pages did not load (one DNS failure, one 404, one nav-only page), so those rows rest on prior knowledge and are marked unconfirmed.

## Findings

Legend: [S] = read on the cited page today. [U] = unconfirmed, from memory only.

### Home Assistant
- Sources: https://developers.home-assistant.io/docs/api/websocket/ and https://www.home-assistant.io/integrations/http/ (both checked 2026-10-14).
- 1. [S] WebSocket API: server sends `auth_required`, client replies with an auth message carrying an access token, then `auth_ok` or `auth_invalid`. "The command `subscribe_events` will subscribe your client to the event bus." `call_service`: "This will call a service action in Home Assistant." (domain, service, service_data, target). [S] CORS: the http integration has a setting for origins: "Origins that may make cross-origin requests. Include the scheme, for example `https://example.com`." (YAML key `cors_allowed_origins` is not shown on the page, so the key name is [U]; the user's own prompt uses it.) Long-lived tokens: the page says only "access token" (long-lived specifically [U], though widely used). The REST API also exists [U].
- 2. [S] The http page offers a "Send X-Frame-Options" setting, "to help prevent clickjacking". The page does not say whether it is on by default or how to allow framing [U]. Login inside an iframe: [U] (the HA login normally needs a session, so a kiosk must log in once, and third-party-cookie rules may interfere).
- 3. [S] Push: `subscribe_events` and `state_changed` events (the call_service doc says to "listen for `state_changed` events").
- 4. Local-only: [U] but standard (HA runs fully local; the page can use the LAN URL).
- 5. Token in the page's JS/localStorage is readable by anyone at the display. Non-admin users exist in HA [U], but per-entity restriction is not available, so a non-admin token can still call any service on any entity [U, verify].

### openHAB
- Source: https://www.openhab.org/docs/configuration/restdocs.html (checked 2026-10-14).
- 1. [S] REST API with API tokens (`-u '{API_TOKEN}:'`, tokens managed in the profile in Main UI), basic auth must be enabled in API Security, OAuth mentioned. [S] The page does not mention CORS; a CORS setting exists in openHAB [U].
- 2. Framing: [U].
- 3. [S] Push: `/rest/events?topics=...` and "server-push supporting subscriptions on change notification". (Transport is SSE [U].)
- 4. Local: [U] yes.
- 5. [S] Roles: admins change Things, Items etc.; users interact with end-user parts. "Implicit User Role" setting lets anyone on the LAN have user access (a kiosk could use that with no token, but so can everyone on the LAN).

### Zigbee2MQTT (MQTT setups)
- Source: https://www.zigbee2mqtt.io/guide/configuration/frontend.html (checked 2026-10-14).
- [S] Frontend on port 8080 by default, uses WebSockets, optional `auth_token` stored in cleartext, off by default. `disable_ui_serving` stops serving the UI but the WebSocket stays.
- [S] Basic auth does not work with WebSockets in WebKit browsers, so use `auth_token`.
- MQTT over WebSockets from a page: needs the broker's WebSocket listener (for example Mosquitto `protocol websockets`) [U]; MQTT credentials/ACLs per topic are the scoping tool [U]. Node-RED: its own HTTP-in/WebSocket nodes expose whatever flow you build [U]; Node-RED dashboards embed in iframes [U].

### Hubitat, Homey, SmartThings, HomeKit
- Hubitat page (apps-help.hubitat.com) failed DNS; Homey docs URL returned 404; SmartThings page returned only navigation. Nothing below is verified.
- Hubitat [U]: Maker API (REST with access token in the URL, local or cloud, plus an event socket for push). CORS and framing unverified.
- Homey [U]: local API with API keys (Homey Pro), Athom's homey.api library, realtime via socket.io; cloud-first for Homey Cloud.
- SmartThings [U]: cloud REST API, OAuth or personal access tokens; webhook subscriptions to a server, so not local and not browser-push. Likely needs server-side calls.
- HomeKit [U]: no browser-accessible direct API. Use HA or Homebridge as a bridge.

## Options this suggests
1. Page talks directly to the HA WebSocket with a limited user's token. Cost: token is in the browser at a shared display; needs the CORS origin entry; mixed-content problem if the app is https and HA is http.
2. Proxy via the local helper `scripts/serve.mjs --helper` [inferred from the brief]. Helper holds the token, the page sees only a small allow-list API (e.g. scenes/lights, with SSE for state). Cost: more helper code; works only where the helper runs (tablets without the helper lose it).
3. Iframe the native HA dashboard. Cheapest, but needs the framing setting and a logged-in session, and gives full dashboard access to anyone at the screen.

## Recommended
Option 2, with Home Assistant as the first adapter: the helper opens one HA WebSocket with a non-admin user's long-lived token, exposes an allow-list of entities/scripts/scenes to the page, and streams `state_changed` for just those. This keeps the token off the display, avoids CORS and mixed-content, and lets the app stay adapter-based for MQTT and openHAB later. Option 1 is the fallback for devices with no helper.

## What to verify first on a real install
1. A non-admin HA user's token can open the WebSocket and call `light.turn_on` and `scene.turn_on`, and whether you can limit it to chosen entities (probably not).
2. Whether the HA page-origin CORS entry works from the app's origin, and whether https/http mixing blocks it.
3. Whether HA's default `X-Frame-Options` blocks an iframe and whether a kiosk login survives in a frame.
4. How the token behaves after revocation and reconnect (re-auth path).
5. Re-check the unconfirmed Hubitat, Homey, SmartThings pages from official docs before promising them.

## Unknowns
- All [U] items. A fetch of the official Hubitat, Homey, SmartThings and HomeKit docs, and the HA auth docs (long-lived token, user permissions), would settle them.
