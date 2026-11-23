# Publishing Nekomachi

Build the uploads with `python cats/build.py portals`. This writes three zips to `cats/dist/`. Each one is self-contained: three.js is bundled, plus the audio, at about 12.6 MB.

The same build writes the website with one content-addressed Three.js runtime under `assets/`. Keep that directory with `index.html` and `sw.js` when deploying. The runtime is preloaded, cached for repeat visits, and precached for offline play. Browser validation commands are in [tests/README.md](tests/README.md).

| Zip | Use for | What changes in-game |
|---|---|---|
| `nekomachi-crazygames.zip` | CrazyGames | CrazyGames SDK v3: gameplay start/stop events, a midgame ad every second retry, a rewarded "Watch an ad · free" continue, and happytime on a new best. The share button is hidden. |
| `nekomachi-poki.zip` | Poki | The same hooks through the Poki SDK v2 (commercialBreak / rewardedBreak). |
| `nekomachi-generic.zip` | itch.io, GameDistribution, Newgrounds, Game Jolt, Y8, Armor Games, GameMonetize | No ads and no outbound links. |

Store art lives in `cats/promo/`:
- `cover-1920x1080.png`, `cover-1280x720.png`, `cover-800x450.png`
- `cover-630x500-itch.png` (itch.io cover)
- `square-628.png`, `square-1024.png`
- `icon-512.png`
- `screenshot-1..6.png` (1280x720)

## Listing copy

**Title:** Nekomachi: Rooftop Cat

**Short description (under 150 characters):** A sleepy orange cat dashes across sunset Tokyo rooftops. Smash shops, dodge laundry, collect fish and dress up your cat.

**Description:**
> Mikan the orange cat naps on a rooftop above a sunset Tokyo town. Wake her up and run!
> Dash across three lanes of rooftops, smash through tiny shops, duck under laundry lines, leap the gaps between buildings and scoop up fish. Ring the golden bell for fever mode, grab an onigiri shield, and keep going as day turns to a starry, firework-lit night.
> Spend your fish in the cat shop on 7 cats (each with her own meow), 12 hats and accessories, 5 towns and 6 music packs. Come back daily for new missions and a login streak.

**Controls:** A/D or arrows to switch lanes, W/Space/Up to jump, S/Down to slide, P to pause. On mobile, swipe.

**Genre / tags:** Runner, Endless runner, 3D, Cute, Cat, Casual, Arcade, Kawaii, Japan, Hyper-casual

**Devices:** Desktop and mobile browsers, landscape and portrait.

**Credits:** Game by Tanmay Bohra. Sounds and music are CC0 from Freesound; see `audio/CREDITS.md`.

## Where to submit (in priority order)

1. **CrazyGames:** https://developer.crazygames.com. Sign up, choose "Upload game", pick HTML5, then upload `nekomachi-crazygames.zip` and the art. Use their QA tool first: it checks that SDK events fire. Revenue is shared from their ads, and the game starts in "basic launch" before full release.
2. **Poki:** https://developers.poki.com. Submit through Poki for Developers. They curate, so not every game is accepted. Upload `nekomachi-poki.zip` once they invite you.
3. **itch.io:** https://itch.io/game/new. Choose Kind = HTML, upload `nekomachi-generic.zip`, and tick "This file will be played in the browser". Set the viewport to 1280x720 with Fullscreen and Mobile friendly enabled. Free with optional tips.
4. **GameDistribution:** https://gamedistribution.com/developers. One upload is syndicated to hundreds of sites. Their SDK is required for revenue; ask me to add a `gamedistribution` build.
5. **Newgrounds** (https://www.newgrounds.com/projects/games), **Game Jolt** (https://gamejolt.com/dashboard/games/add), and **Y8** (https://www.y8.com/upload): upload `nekomachi-generic.zip`.
6. **Our own site:** apply for **AdSense H5 Games Ads** (Ad Placement API) for cats.tanmaybohra.com. Then wire `adBreak` into the same `Portal` hooks; the adapter already supports midgame and rewarded ads.

## Getting players

- Post 15–30 s vertical clips on TikTok, YouTube Shorts and Reels. Good moments: the cat smashing buildings, the night fireworks, and the dress-up shop.
- Post on Reddit: r/WebGames, r/IndieGaming, r/playmygame, r/cats (as a cute clip, not an ad).
- Show HN / Product Hunt with the play link.
- Use the in-game Share score button on our own site.
