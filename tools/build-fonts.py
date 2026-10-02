"""Buduje styles/fonts.css z osadzonymi krojami (licencja SIL OFL 1.1):
- ETROM Text — Inter 400/500/600 (krój roboczy: tabele, formularze, menu),
- ETROM Display — Instrument Sans 400/700 (tytuły, nazwy projektów, liczby kluczowe).

Krój jest wpisany w CSS jako data URI, więc aplikacja działa po dwukliku
z dysku (file://) i bez sieci — przeglądarka nie musi niczego pobierać.
Podzbiór znaków: łacina podstawowa i rozszerzona (polskie litery), interpunkcja,
cyfry tabelaryczne. Uruchomienie (tylko przy zmianie kroju):
    python3 tools/build-fonts.py
"""
import base64, io, sys, os
from fontTools import subset
from fontTools.ttLib import TTFont

DISPLAY = '/mnt/skills/examples/canvas-design/canvas-fonts'
TEXT = '/usr/share/fonts/opentype/inter'
OUT = os.path.join(os.path.dirname(__file__), '..', 'styles', 'fonts.css')
FACES = [
    ('ETROM Text', os.path.join(TEXT, 'Inter-Regular.otf'), 400),
    ('ETROM Text', os.path.join(TEXT, 'Inter-Medium.otf'), 500),
    ('ETROM Text', os.path.join(TEXT, 'Inter-SemiBold.otf'), 600),
    ('ETROM Display', os.path.join(DISPLAY, 'InstrumentSans-Regular.ttf'), 400),
    ('ETROM Display', os.path.join(DISPLAY, 'InstrumentSans-Bold.ttf'), 700),
]
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [
    0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2022, 0x2026,
    0x2032, 0x2033, 0x2039, 0x203A, 0x20AC, 0x2116, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193,
    0x2212, 0x2248, 0x2260, 0x2264, 0x2265, 0x00D7]

blocks = []
for family, path, weight in FACES:
    options = subset.Options()
    options.flavor = 'woff'
    options.layout_features = ['kern', 'liga', 'calt', 'tnum', 'lnum', 'case', 'zero', 'ss01', 'ss02', 'cv01', 'cv05', 'cv08', 'cv11']
    options.name_IDs = ['*']
    font = TTFont(path)
    sub = subset.Subsetter(options)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    font.flavor = 'woff'
    buf = io.BytesIO()
    font.save(buf)
    data = base64.b64encode(buf.getvalue()).decode('ascii')
    blocks.append(
        '@font-face {\n'
        f'  font-family: "{family}";\n'
        f'  font-weight: {weight};\n'
        '  font-style: normal;\n'
        '  font-display: block;\n'
        f'  src: url("data:font/woff;base64,{data}") format("woff");\n'
        '}\n')
    print(family, weight, len(buf.getvalue()) // 1024, 'KB')

with open(OUT, 'w', encoding='utf-8') as fh:
    fh.write('/* ETROM — kroje osadzone w aplikacji (działają z dysku, bez sieci).\n'
             '   ETROM Text: Inter. ETROM Display: Instrument Sans. Obie na licencji SIL OFL 1.1\n'
             '   (docs/licenses). Plik generowany: tools/build-fonts.py — nie edytować ręcznie. */\n\n')
    fh.write('\n'.join(blocks))
