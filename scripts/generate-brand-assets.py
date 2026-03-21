#!/usr/bin/env python3
"""Regenerate favicons, PWA icons, and og-image from public/brand/rise-shine-logo-full.png."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public"
BRAND = ROOT / "brand"
SRC = BRAND / "rise-shine-logo-full.png"


def fit_on_bg(img, size, bg="#1a2226"):
    w, h = img.size
    scale = min(size / w, size / h) * 0.88
    nw, nh = int(w * scale), int(h * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def main():
    im = Image.open(SRC).convert("RGBA")
    fit_on_bg(im, 32).save(BRAND / "favicon-32.png")
    fit_on_bg(im, 180).save(BRAND / "apple-touch-icon.png")
    fit_on_bg(im, 192).save(BRAND / "icon-192.png")
    fit_on_bg(im, 512).save(BRAND / "icon-512.png")
    Image.open(BRAND / "favicon-32.png").convert("RGBA").save(ROOT / "favicon.ico", format="ICO", sizes=[(32, 32)])

    og_w, og_h = 1200, 630
    og = Image.new("RGBA", (og_w, og_h), (26, 34, 38, 255))
    scale = min((og_w * 0.55) / im.width, (og_h * 0.78) / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    r = im.resize((nw, nh), Image.Resampling.LANCZOS)
    og.paste(r, ((og_w - nw) // 2, (og_h - nh) // 2), r)
    og.save(ROOT / "og-image.png", "PNG")
    print("OK:", BRAND / "favicon-32.png", ROOT / "og-image.png", "…")


if __name__ == "__main__":
    main()
