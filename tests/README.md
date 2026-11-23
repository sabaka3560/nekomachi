# Browser checks

Use Node and an installed Playwright module. These tests serve a local copy over HTTP and block leaderboard traffic. Instrumentation is injected by the test server; production HTML contains no test API.

```powershell
node cats/tests/camera.browser.cjs PLAYWRIGHT_MODULE_PATH --chrome=CHROMIUM_PATH
node cats/tests/camera.browser.cjs PLAYWRIGHT_MODULE_PATH --chrome=CHROMIUM_PATH --source=index.html --smoke
node cats/tests/loading.browser.cjs PLAYWRIGHT_MODULE_PATH --chrome=CHROMIUM_PATH
node cats/tests/startup.browser.cjs PLAYWRIGHT_MODULE_PATH --chrome=CHROMIUM_PATH
node cats/tests/startup.browser.cjs PLAYWRIGHT_MODULE_PATH --chrome=CHROMIUM_PATH --gfx=auto --only=desktop
```

- `camera.browser.cjs`: desktop, portrait phone, and reduced-motion framing; transformation, lanes, boost, pause, retry, home, frame timing, render-target reuse, all five worlds/seven cat skins, and compact fish instancing. `--smoke` uses actual controls without injected game hooks and adds short landscape.
- `loading.browser.cjs`: the built website must start and play while font CSS is held back and the external Three.js CDN is blocked. Checks one local runtime request, late font arrival, first-visit runtime precaching, and offline reload/play on desktop and phone. Desktop uses the default Auto/High quality.
- `startup.browser.cjs`: comparative initialization marks, CPU profile, model counts, and real animation-frame intervals. Fixed local runtime files and empty font CSS remove network variance. Default Low provides a matched shader/geometry comparison; `--gfx=auto` additionally forces the Low fallback and asserts it creates no new shader programs. This deliberately measures the fallback run at Low, not default desktop High.

Options include `--root=GAME_DIRECTORY`, `--output=RESULT_DIRECTORY`, and `--source=HTML_FILE` where applicable. Startup accepts `--vendor=RUNTIME_DIRECTORY` and `--cpu=THROTTLE_FACTOR`. Run performance comparisons sequentially; concurrent browser runs distort results.

For a portal smoke check, use `--root=cats/dist/generic --source=index.html --smoke`. For the deployed game, use `--smoke --url=https://cats.tanmaybohra.com`. Camera checks also accept `--only=desktop`, `--only=phone`, and `--perf` for the longer real-time giga sample. Omit the Playwright module argument when it resolves through Node's module path.

Build the release with `python cats/build.py portals`. The website bundles the pinned Three.js r147 libraries into one content-addressed file in `cats/assets/`, preloads it, and precaches it for offline visits. The standalone source retains CDN script URLs, and the portal ZIPs retain local vendor scripts. No framework or renderer version upgrade is involved.

Results live in `cats/test-results/` (ignored by Git and excluded from deployment). Headless phone emulation is comparative evidence, not a physical-device frame-rate guarantee. Provider-hosted portal SDK/ad QA remains separate from local smoke tests.
