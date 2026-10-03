"""Generates AeroFMS raster icons (original artwork) with Pillow.

Usage: python3 scripts/generate-icons.py <web_public_dir> [<android_assets_dir>]
Outputs web PWA icons and, optionally, Android adaptive icon layers, monochrome icon and splash.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

BG = (11, 16, 24, 255)
SCREEN = (5, 8, 13, 255)
BEZEL = (52, 67, 93, 255)
ACCENT = (79, 179, 169, 255)
WHITE = (232, 237, 244, 255)
AMBER = (246, 178, 61, 255)
KEY = (52, 67, 93, 255)


def draw_mark(d: ImageDraw.ImageDraw, s: float, ox: float = 0, oy: float = 0, mono: tuple | None = None) -> None:
    """Draws the CDU mark in a 64x64 design grid scaled by s."""
    def p(x, y):
        return (ox + x * s, oy + y * s)

    c = (lambda col: mono or col)
    d.rounded_rectangle([p(10, 12), p(54, 42)], radius=3 * s, fill=None if mono else SCREEN, outline=c(BEZEL), width=max(1, int(2 * s)))
    d.line([p(16, 34), p(28, 22), p(36, 28), p(48, 18)], fill=c(ACCENT), width=max(1, int(3 * s)), joint='curve')
    for x, y in ((28, 22), (36, 28)):
        r = 2.5 * s
        cx, cy = p(x, y)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c(WHITE))
    d.rounded_rectangle([p(14, 47), p(22, 52)], radius=1.5 * s, fill=c(KEY))
    d.rounded_rectangle([p(25, 47), p(33, 52)], radius=1.5 * s, fill=c(KEY))
    d.rounded_rectangle([p(36, 47), p(50, 52)], radius=1.5 * s, fill=c(AMBER))


def icon(size: int, rounded: bool = True) -> Image.Image:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.19 if rounded else 0, fill=BG)
    draw_mark(d, size / 64)
    return img


def main() -> None:
    web = Path(sys.argv[1])
    web.mkdir(parents=True, exist_ok=True)
    big = icon(1024)
    for s in (192, 512):
        big.resize((s, s), Image.LANCZOS).save(web / f'icon-{s}.png')
    if len(sys.argv) > 2:
        out = Path(sys.argv[2])
        out.mkdir(parents=True, exist_ok=True)
        icon(1024).save(out / 'icon.png')
        # Adaptive icon: 108dp canvas, mark in the 66dp safe zone.
        fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        draw_mark(ImageDraw.Draw(fg), 1024 * 0.6 / 64, 1024 * 0.2, 1024 * 0.2)
        fg.save(out / 'adaptive-foreground.png')
        Image.new('RGBA', (1024, 1024), BG).save(out / 'adaptive-background.png')
        mono = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        draw_mark(ImageDraw.Draw(mono), 1024 * 0.6 / 64, 1024 * 0.2, 1024 * 0.2, mono=(255, 255, 255, 255))
        mono.save(out / 'monochrome.png')
        splash = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
        draw_mark(ImageDraw.Draw(splash), 512 / 64)
        splash.save(out / 'splash-icon.png')
        Image.new('RGBA', (512, 512), BG).save(out / 'favicon-bg.png')


if __name__ == '__main__':
    main()
