#!/usr/bin/env python3
"""
Regenerate favicons, PWA icons, og-image, and tight-cropped master from
public/brand/rise-shine-logo-full.png.

- Trims near-uniform dark margins (charcoal background).
- Writes cropped full lockup back to rise-shine-logo-full.png.
- Exports logo-mark.png (sun + landscape, no wordmark) for small icons / header tile.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public"
BRAND = ROOT / "brand"
SRC = BRAND / "rise-shine-logo-full.png"
# Fraction of cropped height kept for icon-only mark (above “RISE & SHINE”).
MARK_TOP_FRAC = 0.64


def _corner_bg_rgb(px, w, h):
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    return tuple(sum(c[i] for c in corners) / 4 for i in range(3))


def _dist(a, b):
    return sum((a[i] - b[i]) ** 2 for i in range(3)) ** 0.5


def trim_to_artwork(im: Image.Image, tol: float = 45.0, pad: int = 3) -> Image.Image:
    """Crop uniform dark borders; gold/text pixels differ from corner average."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    bg = _corner_bg_rgb(px, w, h)

    def is_background(x, y):
        return _dist(px[x, y], bg) < tol

    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if not is_background(x, y):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x < min_x:
        return im.convert("RGBA")

    min_x = max(0, min_x - pad)
    min_y = max(0, min_y - pad)
    max_x = min(w - 1, max_x + pad)
    max_y = min(h - 1, max_y + pad)
    return rgb.crop((min_x, min_y, max_x + 1, max_y + 1)).convert("RGBA")


def graphic_mark(artwork: Image.Image) -> Image.Image:
    w, h = artwork.size
    cut = max(1, int(h * MARK_TOP_FRAC))
    return artwork.crop((0, 0, w, cut))


def fit_on_bg(img, size, bg="#1a2226"):
    w, h = img.size
    scale = min(size / w, size / h) * 0.88
    nw, nh = int(w * scale), int(h * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), bg)
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return canvas


def main():
    raw = Image.open(SRC).convert("RGBA")
    artwork = trim_to_artwork(raw)
    artwork.save(SRC, "PNG")

    mark = graphic_mark(artwork)
    mark.save(BRAND / "logo-mark.png", "PNG")

    fit_on_bg(mark, 32).save(BRAND / "favicon-32.png")
    fit_on_bg(mark, 180).save(BRAND / "apple-touch-icon.png")
    fit_on_bg(mark, 192).save(BRAND / "icon-192.png")
    fit_on_bg(mark, 512).save(BRAND / "icon-512.png")
    Image.open(BRAND / "favicon-32.png").convert("RGBA").save(
        ROOT / "favicon.ico", format="ICO", sizes=[(32, 32)]
    )

    og_w, og_h = 1200, 630
    og = Image.new("RGBA", (og_w, og_h), (26, 34, 38, 255))
    im = artwork
    scale = min((og_w * 0.58) / im.width, (og_h * 0.82) / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    r = im.resize((nw, nh), Image.Resampling.LANCZOS)
    og.paste(r, ((og_w - nw) // 2, (og_h - nh) // 2), r)
    og.save(ROOT / "og-image.png", "PNG")

    print("OK:", SRC, BRAND / "logo-mark.png", ROOT / "og-image.png", "…")


if __name__ == "__main__":
    main()
