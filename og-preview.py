"""Draws public/og-preview.png, the link-preview image named by basics.image in resume.json.

Run by hand, only when basics.name or basics.label changes: `python og-preview.py`. It is not
part of the build. The card it replaced went stale because the script that drew it lived only
in a chat; this one lives with the image.

LABEL_LINES must be updated by hand to match basics.label: one phrase per line, without the
" · " separators.

Needs Python 3 with Pillow, and the Roboto Light, Regular and Medium TTFs from
https://raw.githubusercontent.com/googlefonts/roboto-2/main/src/hinted/Roboto-<Weight>.ttf
placed in a fonts/ folder next to this script (gitignored).

The image must stay 1200 x 630, to match IMAGE_WIDTH and IMAGE_HEIGHT in resume-head-plugin.ts.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
W, H = 1200, 630
WHITE, GREEN, INK, MUTED = "#ffffff", "#198754", "#212121", "#616161"
NAME = "Douglas Kent"
LABEL_LINES = ["Applied AI & Blockchain Software Engineer",
               "End-to-End Product Engineer",
               "Technical Leader and Mentor"]
DOMAIN = "douglaskent.com"
F = str(HERE / "fonts" / "Roboto-%s.ttf")
name_font = ImageFont.truetype(F % "Regular", 100)
label_font = ImageFont.truetype(F % "Light", 44)
domain_font = ImageFont.truetype(F % "Medium", 28)
BAR_X, BAR_W, TEXT_X = 96, 7, 150
NAME_GAP, LINE_H = 40, 62
img = Image.new("RGB", (W, H), WHITE); d = ImageDraw.Draw(img)
nb = name_font.getbbox(NAME); name_h = nb[3] - nb[1]
block_h = name_h + NAME_GAP + LINE_H * len(LABEL_LINES)
block_top = (H - block_h) // 2 - 24
d.rectangle([BAR_X, block_top, BAR_X + BAR_W, block_top + block_h], fill=GREEN)
y = block_top
d.text((TEXT_X, y - nb[1]), NAME, font=name_font, fill=INK); y += name_h + NAME_GAP
for line in LABEL_LINES:
    d.text((TEXT_X, y), line, font=label_font, fill=MUTED)
    print(line, "right edge", TEXT_X + d.textlength(line, font=label_font)); y += LINE_H
d.text((TEXT_X, H - 96 - 28), DOMAIN, font=domain_font, fill=GREEN)
print("block", block_top, block_top + block_h)
img.save(HERE / "public" / "og-preview.png", "PNG", optimize=True)
