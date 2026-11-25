"""Makes small copies of the private photos in _erica_private/web, for publishing.

Hidden data such as location is left out. The originals are never changed.
Run by encrypt.mjs; needs Pillow.
"""
from pathlib import Path

from PIL import Image, ImageOps

PRIVATE = Path(__file__).resolve().parents[2] / "_erica_private"
WEB = PRIVATE / "web"
LONGEST = 1200

WEB.mkdir(exist_ok=True)
for photo in PRIVATE.iterdir():
    if photo.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        continue
    copy = WEB / f"{photo.name}.jpg"
    if copy.exists() and copy.stat().st_mtime >= photo.stat().st_mtime:
        continue
    with Image.open(photo) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA", "P"):
            rgba = image.convert("RGBA")
            image = Image.new("RGB", rgba.size, "#fffdf8")
            image.paste(rgba, mask=rgba.getchannel("A"))
        small = image.convert("RGB")
        small.thumbnail((LONGEST, LONGEST), Image.Resampling.LANCZOS)
        # A fresh image carries no metadata across.
        clean = Image.new("RGB", small.size)
        clean.paste(small)
        clean.save(copy, "JPEG", quality=80, optimize=True, progressive=True)
