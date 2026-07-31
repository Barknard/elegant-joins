#!/usr/bin/env python3
"""Generate the PWA icon set from the brand mark's geometry.

The source favicon.png is only 128px, so upscaling it to 512 would be visibly soft.
The mark is three identical rounded rectangles in a staircase, one flat colour, so it
is cheaper and sharper to redraw it from proportions at each target size.

Proportions were measured off the original favicon (bbox 28,16 -> 107,111 on a 128px
canvas) and are expressed as fractions so every output is pixel-exact.

Run from the repo root:  python tools/make-icons.py
"""
import pathlib
from PIL import Image, ImageDraw

BRAND = (242, 98, 1, 255)          # #F26201, sampled from the original mark
MASKABLE_BG = (11, 18, 32, 255)    # near-black, matches the app's dark canvas

# Fractions of the canvas edge, from the 128px original.
BLOCK_W, BLOCK_H = 40 / 128, 32 / 128
RADIUS = 8 / 128
BLOCKS = [
    (28 / 128, 16 / 128),   # top-left
    (68 / 128, 48 / 128),   # middle-right
    (28 / 128, 80 / 128),   # bottom-left
]

OUT = pathlib.Path(__file__).resolve().parent.parent / "client" / "public"


def draw_mark(size: int, scale: float = 1.0, background=None) -> Image.Image:
    """Renders the mark at `size` px. `scale` shrinks it toward the centre, which is
    how the maskable variant keeps the art inside the safe zone that launchers crop to.
    Supersampled 4x then downsampled, because PIL's rounded_rectangle does not
    antialias on its own."""
    ss = 4
    canvas = size * ss
    img = Image.new("RGBA", (canvas, canvas), background or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # The original art is not centred on its own canvas (its bbox sits 4px right of
    # middle). Recentre from the measured bbox rather than inheriting that drift —
    # otherwise every generated size, and especially the cropped maskable variant,
    # looks subtly lopsided.
    min_x = min(fx for fx, _ in BLOCKS)
    max_x = max(fx + BLOCK_W for fx, _ in BLOCKS)
    min_y = min(fy for _, fy in BLOCKS)
    max_y = max(fy + BLOCK_H for _, fy in BLOCKS)
    shift_x = 0.5 - (min_x + max_x) / 2
    shift_y = 0.5 - (min_y + max_y) / 2

    offset = (1 - scale) / 2
    for fx, fy in BLOCKS:
        x0 = (offset + (fx + shift_x) * scale) * canvas
        y0 = (offset + (fy + shift_y) * scale) * canvas
        x1 = x0 + BLOCK_W * scale * canvas
        y1 = y0 + BLOCK_H * scale * canvas
        d.rounded_rectangle([x0, y0, x1, y1], radius=RADIUS * scale * canvas, fill=BRAND)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    written = []

    for size in (192, 512):
        p = OUT / f"icon-{size}.png"
        draw_mark(size).save(p)
        written.append(p)

    # Apple ignores transparency and composites onto black, which would swallow the
    # dark-on-dark edges — give it an explicit background.
    p = OUT / "apple-touch-icon.png"
    draw_mark(180, scale=0.78, background=MASKABLE_BG).save(p)
    written.append(p)

    # Maskable: launchers crop to a circle inscribed in the middle 80%, so the art has
    # to sit well inside that or corners get shaved off.
    p = OUT / "icon-maskable-512.png"
    draw_mark(512, scale=0.62, background=MASKABLE_BG).save(p)
    written.append(p)

    # Refresh the favicon itself from the same geometry so nothing drifts.
    p = OUT / "favicon.png"
    draw_mark(128).save(p)
    written.append(p)

    for f in written:
        print(f"  {f.name:26} {f.stat().st_size / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
