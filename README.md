# Nekomachi

A sleepy 3D orange cat naps over a sunset Tokyo, then runs the rooftops toppling shops. Swipe between lanes, collect fish,
and unlock cats, outfits, worlds and daily missions. Plays in the browser, installs as an app, and works offline.

**Play:** https://cats.tanmaybohra.com

Built by [Tanmay Bohra](https://tanmaybohra.com) with Three.js (r147, vendored in `vendor/`).

## What's inside

- `nekomachi.html` — the whole game (scene, game loop, UI) in one file. Edit this.
- `build.py` — wraps it into `index.html`, writes the content-addressed Three.js runtime under `assets/` and the
  offline service worker (`sw.js` from `sw.template.js`).
- `manifest.webmanifest`, icons — installable PWA. `.well-known/assetlinks.json` links the Android app (Trusted Web Activity).
- `tests/` — browser checks for startup, loading and camera framing (see `tests/README.md`).
- `audio/` — CC0 sounds and music, credited in `audio/CREDITS.md`.
- `promo/` — store and portal artwork.

## Run locally

```bash
python build.py
python -m http.server 8080      # then open http://localhost:8080
```

## Controls

Swipe (or use the arrow keys) to change lanes. Ultra / High / Low graphics settings for slower phones.

## License

MIT, see [LICENSE](LICENSE). Bundled Three.js files in `vendor/` keep their own MIT license; sounds and music in `audio/` are CC0 (see `audio/CREDITS.md`).
