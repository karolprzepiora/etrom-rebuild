#!/usr/bin/env python3
"""Buduje styles/logo.css z docs/brand/etrom-logo.png.

Logo dzielimy na dwie warstwy, żeby działało w obu motywach bez dwóch plików:
  - kolor: znak (łupek + magenta) i podpis „hydrotechnology” — barwy stałe,
  - tusz:  napis „etrom” — maska, malowana kolorem tekstu (--ink).
Obrazy są osadzone jako data: URI, bo maska z file:// bez tego jest blokowana.
"""
import base64, io, os
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = Image.open(os.path.join(root, 'docs/brand/etrom-logo.png')).convert('RGBA')
w, h = src.size
color = Image.new('RGBA', (w, h), (0, 0, 0, 0))
ink = Image.new('RGBA', (w, h), (0, 0, 0, 0))
cp, ip = color.load(), ink.load()
sp = src.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = sp[x, y]
        if a == 0:
            continue
        if (r * 299 + g * 587 + b * 114) / 1000 < 70:
            ip[x, y] = (0, 0, 0, a)
        else:
            cp[x, y] = (r, g, b, a)

def uri(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

# Znak zajmuje lewe ~19% szerokości — do panelu zwiniętego.
mark_w = 0
for x in range(w):
    if any(sp[x, y][3] > 0 for y in range(h)):
        mark_w = x
    elif mark_w and x - mark_w > 6:
        break
mark_w += 1

css = f"""/* Wygenerowane przez tools/build-logo.py — nie edytować ręcznie. */
/* Warstwa barwna dostępna też dla innych styli (znak wodny w nagłówkach stylu ETROM). */
:root {{ --logo-color-img: url("{uri(color)}"); --logo-ratio: {mark_w} / {h}; }}
.logo {{
  --logo-h: 2.25rem;
  position: relative;
  display: inline-block;
  flex: none;
  height: var(--logo-h);
  aspect-ratio: {w} / {h};
}}
.logo__color, .logo__ink {{ position: absolute; inset: 0; background-size: 100% 100%; background-repeat: no-repeat; }}
.logo__color {{ background-image: var(--logo-color-img); }}
.logo__ink {{
  background-color: var(--ink);
  -webkit-mask: url("{uri(ink)}") center / 100% 100% no-repeat;
  mask: url("{uri(ink)}") center / 100% 100% no-repeat;
}}
/* Sam znak: ta sama grafika przycięta do lewej części. */
.logo--mark {{ aspect-ratio: {mark_w} / {h}; overflow: hidden; }}
.logo--mark .logo__color, .logo--mark .logo__ink {{ width: calc(100% * {w} / {mark_w}); right: auto; }}
"""
open(os.path.join(root, 'styles/logo.css'), 'w').write(css)
print('znak:', mark_w, 'px z', w, '| logo.css', len(css) // 1024, 'KB')
