# Startup and rendering validation — 2026-10-30

Baseline: committed game at `6e105d2`, preserved locally as `ndw/checkpoints/nekomachi-v23-before-startup.html`. The editable source and `cats/nekomachi.html` are kept identical.

## Changes

- Website runtime: nine CDN script requests become one same-origin, content-addressed r147 bundle. Preload, immutable HTTP caching, and service-worker precaching cover first and repeat visits. Portal bundles still include the pinned local vendor files.
- Optional web fonts no longer block the game script. Late font arrival redraws existing sign/popup textures in small batches while outside active play; it no longer disposes the popup cache or re-uploads all scene textures.
- Low/mobile warm-up now uses the actual sRGB framebuffer. In r147 an ordinary offscreen target always uses linear output, so the previous warm-up prepared a redundant shader set. Auto/High still prepares its Low fallback explicitly, preventing a compilation pause when automatic quality drops during a run.
- Smaller bevel meshes and lighter tree crowns retain the cat's original geometry. Static background buildings, trees, and cloud groups are batched by material. Fish submit only live instances; fish/petal matrices use dynamic buffer hints. Texture anisotropy is capped at 4 on phones and 8 on desktop.
- Painted rooftop edging and inset lane markers improve depth/readability without new geometry. Stable sky dithering smooths Low/mobile gradients without adding a post-processing pass.

## Matched local comparison

One sequential before/after pair in headless Chromium, Low quality, desktop 1440×900 and phone emulation 390×844 at 2× device scale. Runtime assets were served locally and remote font CSS was replaced with empty CSS to isolate game initialization. Each run and Gigachad interval was sampled for four seconds. These are comparative measurements, not public-network load times or physical-phone FPS promises.

| Measurement | Before | After |
| --- | ---: | ---: |
| Desktop initialization ready | 5.81 s | 4.73 s |
| Phone initialization ready | 4.62 s | 3.68 s |
| Low shader programs | 64 | 35 |
| Vertices across unique scene geometries | 755,948 | 594,018 |
| Desktop run mean / p95 frame interval | 25.77 / 34.60 ms | 22.25 / 27.90 ms |
| Desktop Gigachad mean / p95 | 28.04 / 34.90 ms | 22.03 / 28.00 ms |
| Phone run mean / p95 | 32.53 / 41.90 ms | 20.78 / 27.90 ms |
| Phone Gigachad mean / p95 | 26.73 / 34.90 ms | 21.08 / 28.00 ms |

Phone adaptive DPR also stayed higher: 1.5 versus 1.25 during the normal sample, and 1.25 versus 1.0 during the Gigachad sample. Both runs retained the same adaptive-quality logic. Dynamic routes/particles and machine load affect individual frame samples; the counts above do not imply the same speedup on every device.

The separate desktop Auto test prepared 69 programs; explicitly switching to Low during play kept the count at 69. This intentionally trades some desktop preparation time for a safe automatic fallback. The smaller 35-program count applies to Low/mobile startup.

Raw local artifacts: `ndw/test-results/startup-baseline-final/results.json`, `startup-final/results.json`, and `startup-auto-final/results.json`, with CPU profiles and screenshots alongside them.

## Functional checks

- Built website: desktop, portrait phone, and reduced-motion camera/timing suites pass, including growth/lane framing, shrinking, boost, pause/retry/home, resize FOV, render-target reuse, uneven timing, and 30/60/120/144 Hz input response.
- All five worlds and seven cat skins render after scenery batching. Live fish instance counts match gameplay fish state. Shader compile errors and WebGL context-loss errors are treated as test failures.
- On desktop Auto and phone, the built website starts and plays while font CSS is held back and the external Three.js CDN is blocked. Late fonts, pause/resume, first-visit runtime precaching, and offline reload/play pass.
- Source and built inline scripts parse successfully. Build output is generated from the synced source; historical checkpoints and sound assets are preserved.
- Actual UI smoke tests pass on desktop, portrait phone, reduced motion, and reduced-motion short landscape. Generic, CrazyGames, and Poki bundles each load, start, pause, resume, and advance in local desktop smoke checks. Provider-hosted SDK/ad checks remain separate.
- Re-running the release build produces byte-for-byte identical HTML, service worker, and runtime assets.

The test servers inject instrumentation only into their local responses. No profiling/test hooks are shipped in the game.
