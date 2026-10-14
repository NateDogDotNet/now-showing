Agent: ambient-light-research-r1 · model: claude-sonnet-5-5 · checked: 2026-10-14
produced_by: orchestrator-research · question: on a device with a light sensor, can the app dim/turn off the display when the room is dark and brighten/wake it when light returns?
answer: Only partly via the web platform. The Ambient Light Sensor API is not on by default in any engine, so the portable inputs are a Pi helper (I2C sensor via IIO) and a Home Assistant illuminance entity. The app's existing outputs (brightness filter, night dim, sleep veil) can act on any of them.
confidence: medium - spec, MDN, kernel ABI and HA docs were fetched; per-browser flag details and Pi backlight details are from memory (marked).

## Findings

### 1. Ambient Light Sensor API
- W3C Working Draft 14 May 2026. It says it is "not expected to advance to W3C Recommendation in its current form" and is not available by default in any browser engine. https://www.w3.org/TR/ambient-light/
- MDN: "Limited availability", not Baseline, experimental, secure context only. https://developer.mozilla.org/en-US/docs/Web/API/AmbientLightSensor
- Permission: Permissions API name `ambient-light-sensor`, policy-controlled, default allowlist `'self'` (W3C and MDN above).
- Privacy: "user agents must reduce accuracy of sensor readings". Rounding multiple must be at least 50 lux. The threshold should be at least half the rounding multiple. "User agents may also limit maximum sampling frequency." (W3C). So readings are coarse: dark vs dim vs bright works, fine steps do not.
- Per browser (the MDN compat table did not render, so none of this is confirmed today):
  - inferred (memory): Chrome/Edge (Android and desktop) ship the class only behind chrome://flags "Generic Sensor Extra Classes" (`#enable-generic-sensor-extra-classes`). Not on by default.
  - inferred: Firefox has no support (an old about:config flag was removed). Safari iOS/iPadOS has none. Samsung Internet follows Chromium; whether it exposes the flag is unknown.
  - Installed PWA or `--kiosk` on Linux: no doc found. inferred: a Pi has no light sensor, so the class would never report there. A flag can be passed to Chromium with `--enable-features=...` or via chrome://flags on a tablet, but this is unverified.
- Consequence: it cannot be relied on. Use it only as a feature-detected bonus (`"AmbientLightSensor" in window`) that needs a flag, so it is effectively Android Chrome with the flag enabled.

### 2. Web-page alternatives
- (a) `prefers-color-scheme` / `prefers-contrast`: nothing found in the docs that maps a light sensor to them. Treat as no. (inferred: they follow user or OS theme settings; some OS "auto" dark mode is time-based.) Not fetched.
- (b) Camera via `getUserMedia`: unconfirmed in this run. From memory: a permission prompt per origin, and the camera indicator lights while it is active. Chromium policy `VideoCaptureAllowedUrls` can pre-grant a kiosk (inferred, check the policy list). Cost: continuous camera power, an always-on privacy indicator, and it works only while the page is visible. Auto-exposure also defeats absolute luminance readings. Recommend not at all, or an explicit opt-in.
- (c) `screen.brightness` / Screen Brightness proposal: not verified. From memory there is no shipping API (only Wake Lock and the Screen Wake Lock type "screen"). Treat as unavailable.
- (d) A page cannot turn the backlight off or set OS brightness. Not verified against a source. Only a CSS or black veil is possible, which on OLED is effectively off.

### 3. Pi helper path
- Kernel ABI: `in_illuminance_raw` / `in_illuminance_input` are "Illuminance measurement, units after application of scale and offset are lux." `in_illuminance_scale` is applied after offset to `_raw`. https://www.kernel.org/doc/Documentation/ABI/testing/sysfs-bus-iio (page truncated, but these entries were read).
- Which drivers: not confirmed in this run. From memory, mainline IIO has drivers for BH1750 (`bh1750`), TSL2591 (`tsl2591`), VEML7700 (`veml6030`, covering the VEML7700 family), and TSL2561 (`tsl2563`). Each needs an overlay or `dtoverlay=i2c-sensor`/`i2c-gpio` plus `echo <name> 0x<addr> > .../new_device`. Verify per driver in `drivers/iio/light/Kconfig`.
- Pi official touch display backlight: not confirmed. From memory, `/sys/class/backlight/rpi_backlight/brightness` (0-255) for the 7-inch v1, and a different node for the Touch Display 2; the helper would write it as root or via udev rule. Check on the real device with `ls /sys/class/backlight`.

### 4. Home Assistant
- The `sensor` integration lists device class Illuminance (`illuminance`): "Light level, in lx." https://www.home-assistant.io/integrations/sensor/ Confirmed. Read over the WebSocket API via `get_states` / `subscribe_events` (state_changed); the mechanism itself was not re-fetched.

## Recommended design (one design)
1. Inputs, in priority: HA illuminance entity (via the helper, D69) or helper I2C sensor on a Pi; `AmbientLightSensor` only when feature-detected (needs a flag, Android Chrome); camera not at all (or an explicit opt-in later).
2. Normalize every input to a lux number plus a source tag; ignore the source if its readings stop for N minutes.
3. Outputs: map lux to the existing brightness filter and night dim as a continuous or 3-step curve; below an "off" lux, show the sleep veil (black, wake lock held), which is effectively off on OLED.
4. On a Pi, the helper also does TV power (CEC/wlr-randr) and optionally the backlight node, only below the "off" threshold and after the delay.
5. Smoothing: exponential moving average or median over about 30-60 s, plus hysteresis (for example go dark under 5 lux, wake over 15 lux) and a minimum dwell of 2-5 minutes before sleeping, shorter to wake. Ease the filter change over a few seconds, never step it.
6. Allow a manual override (touch wakes for N minutes) and keep the schedule as the fallback.
7. Verify first on real devices: (i) whether Chrome on the target Android tablet reports `AmbientLightSensor` with the flag on, and the actual lux step size; (ii) that an installed PWA keeps getting readings with the screen dimmed; (iii) the I2C sensor and driver on the Pi and `ls /sys/class/backlight`; (iv) whether a veil triggers any OS auto-brightness feedback loop (the sensor reads the screen's own light on a wall display).

## Unknowns
- Current flag status and exact versions per browser (settle by opening the MDN compat table or chromestatus.com for "Ambient Light Sensor").
- Camera policy name, `screen.brightness` status, Pi backlight node names, and the exact IIO driver names (all from memory; settle on a device or via kernel Kconfig).
