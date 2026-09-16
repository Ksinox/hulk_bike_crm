"""
Кадры слайдов 2.0 для компьютера — весь снимок в квадрате (16.09, заказчик:
«видно ли там всё»). Медиа слайда почти квадратное (711×736 на 1440×900,
685×660 на 1366×768), а снимки 2.0 — 3:2: при заполнении обрезалась правая
часть экрана. Теперь снимок целиком на размытом фоне самого себя; детали —
кнопкой «Крупно» (там исходные кадры).

    python scripts/shots/release-frames-2.0-square.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "apps/web/public/release/2.0"
SIDE = 1350


def square(name: str) -> None:
    im = Image.open(DIR / f"{name}.jpg").convert("RGB")
    k = min(SIDE / im.width, SIDE / im.height)
    fg = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    kb = max(SIDE / im.width, SIDE / im.height)
    bg = im.resize((round(im.width * kb), round(im.height * kb)), Image.LANCZOS)
    left = (bg.width - SIDE) // 2
    top = (bg.height - SIDE) // 2
    bg = bg.crop((left, top, left + SIDE, top + SIDE)).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new("RGB", bg.size, (40, 46, 60)), 0.35)
    bg.paste(fg, ((SIDE - fg.width) // 2, (SIDE - fg.height) // 2))
    bg.save(DIR / f"{name}-sq.jpg", quality=84, optimize=True)
    print(f"{name}-sq", bg.size, "снимок", fg.size)


for n in ["d-login", "d-staff", "d-sales", "d-buyout", "d-service-was", "d-service-ba", "d-analytics", "d-search"]:
    square(n)
