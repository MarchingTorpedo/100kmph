"""Rebuild the self-hosted woff2 files in ../fonts from the Google Fonts sources.

Needs Python 3 with `pip install fonttools brotli`. Download the sources from
https://github.com/google/fonts (ofl/archivo, ofl/newsreader) into one folder:

  Archivo[wdth,wght].ttf
  Newsreader[opsz,wght].ttf
  Newsreader-Italic[opsz,wght].ttf

then run:  python scripts/build-fonts.py <source-folder>

It also prints the metric overrides for the local fallback faces used in
styles/fonts.css (Arial for Archivo, Times New Roman for Newsreader; pass
--arial / --times to point at those files on non-Windows machines).
"""

import argparse
import os
import subprocess
import sys

from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "fonts")

# Google Fonts' "latin" subset plus U+20B9 (Indian rupee sign).
UNICODES = (
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,"
    "U+0308,U+0329,U+2000-206F,U+20AC,U+20B9,U+2122,U+2191,U+2193,U+2212,"
    "U+2215,U+FEFF,U+FFFD"
)
FEATURES = "kern,liga,calt,ccmp,locl,mark,mkmk,tnum,lnum,case"

# (source, instancer axis limits, output)
BUILDS = [
    # Text cut: preloaded, every weight we use, fixed at normal width.
    ("Archivo[wdth,wght].ttf", ["wght=500:800", "wdth=100"], "archivo-text-latin.woff2"),
    # Display cut: Velocity Width headings. One weight, full width range.
    ("Archivo[wdth,wght].ttf", ["wght=800", "wdth=75:125"], "archivo-display-latin.woff2"),
    ("Newsreader[opsz,wght].ttf", ["wght=400", "opsz=18"], "newsreader-400-latin.woff2"),
    ("Newsreader-Italic[opsz,wght].ttf", ["wght=400", "opsz=18"], "newsreader-400-italic-latin.woff2"),
]


def run(*args):
    subprocess.run([sys.executable, "-m", *args], check=True)


def fallback_metrics(woff2, local):
    """size-adjust and ascent/descent/line-gap overrides so the local fallback
    occupies the same space as the web font while it loads."""
    font, ref = TTFont(woff2), TTFont(local)
    upm = font["head"].unitsPerEm
    sample = "the quick brown fox jumps over the lazy dog THE QUICK BROWN FOX 0123456789"

    def avg_width(f):
        cmap, hmtx, u = f.getBestCmap(), f["hmtx"], f["head"].unitsPerEm
        return sum(hmtx[cmap[ord(c)]][0] / u for c in sample) / len(sample)

    size_adjust = avg_width(font) / avg_width(ref)
    hhea = font["hhea"]
    pct = lambda v: f"{abs(v) / upm / size_adjust * 100:.2f}%"
    return {
        "size-adjust": f"{size_adjust * 100:.2f}%",
        "ascent-override": pct(hhea.ascent),
        "descent-override": pct(hhea.descent),
        "line-gap-override": pct(hhea.lineGap),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("src")
    p.add_argument("--arial", default=r"C:\Windows\Fonts\arial.ttf")
    p.add_argument("--times", default=r"C:\Windows\Fonts\times.ttf")
    a = p.parse_args()

    tmp = os.path.join(OUT, "_instance.ttf")
    for src, limits, out in BUILDS:
        run("fontTools.varLib.instancer", os.path.join(a.src, src), *limits, "-o", tmp, "-q")
        run(
            "fontTools.subset", tmp,
            f"--unicodes={UNICODES}", f"--layout-features={FEATURES}",
            "--flavor=woff2", "--no-hinting", "--desubroutinize",
            f"--output-file={os.path.join(OUT, out)}",
        )
        print(f"{out}: {os.path.getsize(os.path.join(OUT, out)) / 1024:.1f} KB")
    os.remove(tmp)

    for out, ref in (("archivo-text-latin.woff2", a.arial), ("newsreader-400-latin.woff2", a.times)):
        if os.path.exists(ref):
            print(out, "fallback:", fallback_metrics(os.path.join(OUT, out), ref))


if __name__ == "__main__":
    main()
