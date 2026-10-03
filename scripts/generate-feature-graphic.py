"""Builds the Google Play feature graphic (1024x500) from real app screenshots.

Usage: python3 scripts/generate-feature-graphic.py <store-assets-dir> <android-fonts-dir>
Reads <lang>-02-boeing-route.png and <lang>-05-airbus-tmpy.png, writes feature-graphic-<lang>.png.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1024, 500
BG = (11, 16, 24)
ACCENT = (79, 179, 169)
TEXT = (232, 237, 244)
MUTED = (148, 163, 184)
# CDU/MCDU screen regions in a 1080x2160 phone screenshot (display area above the keypad).
CROP_BOEING = (140, 205, 940, 1060)
CROP_AIRBUS = (140, 205, 940, 950)

COPY = {
    'en': ('AeroFMS', 'FMC & MCDU Simulator', 'Boeing · Airbus · 8 aircraft'),
    'ko': ('AeroFMS', 'FMC & MCDU 시뮬레이터', '보잉 · 에어버스 8개 기종'),
}


def screen(path: Path, height: int, crop: tuple[int, int, int, int]) -> Image.Image:
    img = Image.open(path).convert('RGB').crop(crop)
    w = round(img.width * height / img.height)
    img = img.resize((w, height), Image.LANCZOS)
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, height - 1], radius=14, fill=255)
    out = Image.new('RGBA', img.size)
    out.paste(img, (0, 0), mask)
    return out


def shadowed(canvas: Image.Image, tile: Image.Image, xy: tuple[int, int]) -> None:
    shadow = Image.new('RGBA', (tile.width + 60, tile.height + 60), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([30, 34, tile.width + 30, tile.height + 34], radius=16, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    canvas.alpha_composite(shadow, (xy[0] - 30, xy[1] - 30))
    border = Image.new('RGBA', (tile.width + 6, tile.height + 6), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle([0, 0, tile.width + 5, tile.height + 5], radius=17, fill=(52, 67, 93, 255))
    canvas.alpha_composite(border, (xy[0] - 3, xy[1] - 3))
    canvas.alpha_composite(tile, xy)


def main() -> None:
    assets = Path(sys.argv[1])
    fonts = Path(sys.argv[2])
    mono = str(fonts / 'IBMPlexMono-SemiBold.ttf')
    for lang, (title, subtitle, tagline) in COPY.items():
        canvas = Image.new('RGBA', (W, H), BG + (255,))
        d = ImageDraw.Draw(canvas)
        # Subtle grid backdrop.
        for x in range(0, W, 32):
            d.line([(x, 0), (x, H)], fill=(17, 24, 36, 255))
        for y in range(0, H, 32):
            d.line([(0, y), (W, y)], fill=(17, 24, 36, 255))
        sans = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
        d.text((56, 150), title, font=ImageFont.truetype(mono, 72), fill=TEXT)
        d.rectangle([58, 246, 150, 252], fill=ACCENT)
        d.text((56, 276), subtitle, font=ImageFont.truetype(sans, 34, index=6), fill=TEXT)
        d.text((56, 330), tagline, font=ImageFont.truetype(sans, 24, index=0), fill=MUTED)
        boeing = screen(assets / f'{lang}-02-boeing-route.png', 330, CROP_BOEING)
        airbus = screen(assets / f'{lang}-05-airbus-tmpy.png', 300, CROP_AIRBUS)
        shadowed(canvas, airbus, (W - airbus.width - 40, 120))
        shadowed(canvas, boeing, (W - airbus.width - boeing.width + 40, 50))
        canvas.convert('RGB').save(assets / f'feature-graphic-{lang}.png', optimize=True)
        print('wrote', assets / f'feature-graphic-{lang}.png')


if __name__ == '__main__':
    main()
