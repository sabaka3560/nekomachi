"""Build Nekomachi.

  python cats/build.py            -> cats/index.html (same-origin, cached Three.js runtime)
  python cats/build.py portals    -> also cats/dist/<portal>/ and cats/dist/nekomachi-<portal>.zip:
                                     self-contained builds for game portals (three.js bundled, portal SDK added)

cats/nekomachi.html is the game source (also published as a claude.ai artifact).
"""
import hashlib
import re
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

here = Path(__file__).parent
body = (here / "nekomachi.html").read_text(encoding="utf-8")

# The editable source stays portable. Production fetches the same pinned r147
# libraries in one cacheable request from its own origin.
runtime_urls = re.findall(r'src="(https://cdn\.jsdelivr\.net/npm/three@0\.147\.0/[^"]+)"', body)
vendored, runtime_parts = [], []
local = body
for url in runtime_urls:
    name = url.rsplit("/", 1)[1]
    dest = here / "vendor" / name
    if not dest.exists():
        dest.parent.mkdir(exist_ok=True)
        urllib.request.urlretrieve(url, dest)
    # Normalize checkout line endings before hashing, including on Windows.
    runtime_parts.append(dest.read_text(encoding="utf-8").encode("utf-8"))
    vendored.append(name)
    local = local.replace(url, f"vendor/{name}")
runtime = b"\n;\n".join(runtime_parts)
runtime_hash = hashlib.sha256(runtime).hexdigest()[:12]
runtime_path = f"assets/three-r147.{runtime_hash}.js"
(here / "assets").mkdir(exist_ok=True)
(here / runtime_path).write_bytes(runtime)
web_body, script_count = re.subn(
    r'<script src="https://cdn\.jsdelivr\.net/npm/three@0\.147\.0/[^"]+"[^>]*></script>\s*', "", body)
if script_count != len(vendored) or not vendored:
    raise ValueError("Missing Three.js runtime scripts")
web_body = web_body.replace('<script>\n(() => {', f'<script src="{runtime_path}"></script>\n<script>\n(() => {{', 1)
if f'src="{runtime_path}"' not in web_body:
    raise ValueError("Could not locate the game script")

ICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath d='M8 19L10 4l11 9zM40 19L38 4l-11 9z' fill='%23f5933c'/%3E"
        "%3Cellipse cx='24' cy='27' rx='18' ry='15' fill='%23f5933c'/%3E%3Cellipse cx='17' cy='26' rx='3' ry='4' fill='%232a1610'/%3E"
        "%3Cellipse cx='31' cy='26' rx='3' ry='4' fill='%232a1610'/%3E%3C/svg%3E")


def wrap(page_body, extra="", canonical=False):
    canon = '<link rel="canonical" href="https://cats.tanmaybohra.com/">\n' if canonical else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Nekomachi: a kawaii 3D rooftop runner. A sleepy orange cat naps over Tokyo, then smashes shops across the rooftops. Free in the browser.">
<meta name="theme-color" content="#2b2350">
<meta property="og:title" content="Nekomachi · Rooftop Cat">
<meta property="og:description" content="A sleepy orange cat, a sunset town, and a lot of accidentally toppled buildings. Play in the browser.">
<meta property="og:url" content="https://cats.tanmaybohra.com/">
<meta property="og:type" content="website">
{canon}<link rel="icon" href="{ICON}">
<style>html{{color-scheme:light}}body{{margin:0}}[hidden]{{display:none!important}}</style>
{extra}</head>
<body>
{page_body}
</body>
</html>
"""


# our own site: installable (manifest, icons) with an offline-friendly service worker
APP = """<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<script>if ('serviceWorker' in navigator && location.hostname === 'cats.tanmaybohra.com') addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));</script>
"""
(here / "index.html").write_text(wrap(web_body, APP + f'<link rel="preload" href="{runtime_path}" as="script">\n', canonical=True), encoding="utf-8")
version = hashlib.sha1((web_body + runtime_hash + "".join(sorted(p.name for p in (here / "audio").iterdir()))).encode()).hexdigest()[:10]
(here / "sw.js").write_text((here / "sw.template.js").read_text(encoding="utf-8").replace("__VERSION__", version).replace("__RUNTIME__", "/" + runtime_path), encoding="utf-8")
print("wrote", here / "index.html", "and sw.js", version)

if len(sys.argv) > 1 and sys.argv[1] == "portals":
    # bundle every three.js script the page loads: portals want builds with no CDN dependencies
    portals = {
        "crazygames": '<script>window.NEKO_PORTAL = "crazygames";</script>\n<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n',
        "poki": '<script>window.NEKO_PORTAL = "poki";</script>\n<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>\n',
        # itch.io, GameDistribution, Newgrounds, Game Jolt...: no SDK, no links out
        "generic": '<script>window.NEKO_PORTAL = "generic";</script>\n',
    }
    dist = (here / "dist").resolve()
    if dist.parent != here.resolve() or dist.name != "dist":
        raise ValueError("Portal output must stay inside cats/dist")
    shutil.rmtree(dist, ignore_errors=True)
    for name, extra in portals.items():
        out = dist / name
        (out / "vendor").mkdir(parents=True)
        (out / "index.html").write_text(wrap(local, extra), encoding="utf-8")
        shutil.copytree(here / "audio", out / "audio")
        for f in vendored:
            shutil.copy(here / "vendor" / f, out / "vendor" / f)
        zpath = dist / f"nekomachi-{name}.zip"
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
            for f in sorted(out.rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(out).as_posix())
        print(f"wrote {zpath} ({zpath.stat().st_size // 1024} KB)")
