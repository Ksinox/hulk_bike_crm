"""
Кадры слайда выпуска 2.0.3 (public/release/2.0.3) из кадров «Развития».

Компьютер: область целиком в квадрате 1350×1350 на размытом фоне того же
кадра (как в 2.0.2). Телефон: кусок кадра с белыми полями — слайд
телефона почти квадратный.

    python scripts/shots/release-frames-2.0.3.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/web/public/progress"
OUT = ROOT / "apps/web/public/release/2.0.3"
OUT.mkdir(parents=True, exist_ok=True)
SIDE = 1350
INNER = 1190


def square(name: str, box: tuple[int, int, int, int], out: str) -> None:
    im = Image.open(SRC / f"{name}.jpg").convert("RGB")
    region = im.crop(box)
    k = min(INNER / region.width, INNER / region.height)
    fg = region.resize((round(region.width * k), round(region.height * k)), Image.LANCZOS)
    kb = max(SIDE / im.width, SIDE / im.height)
    bg = im.resize((round(im.width * kb), round(im.height * kb)), Image.LANCZOS)
    left = (bg.width - SIDE) // 2
    top = (bg.height - SIDE) // 2
    bg = bg.crop((left, top, left + SIDE, top + SIDE)).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new("RGB", bg.size, (40, 46, 60)), 0.35)
    bg.paste(fg, ((SIDE - fg.width) // 2, (SIDE - fg.height) // 2))
    bg.save(OUT / f"{out}.jpg", quality=84, optimize=True)
    print(out, bg.size, "область", region.size)


def phone_crop(name: str, box: tuple[int, int, int, int], out: str) -> None:
    part = Image.open(SRC / f"{name}.jpg").convert("RGB").crop(box)
    im = Image.new("RGB", (part.width + 80, part.height + 100), (255, 255, 255))
    im.paste(part, (40, 50))
    im.save(OUT / f"{out}.jpg", quality=84, optimize=True)
    print(out, im.size)


# Компьютер 1440×900: «было» — карточка партии (без «Изменить»),
# «стало» — окно правки партии со статусом.
square("v203-batch-units-was", (86, 252, 748, 816), "d-batch-edit-was")
square("v203-edit-status-now", (360, 36, 1080, 864), "d-batch-edit-now")

# Телефон 780×1688: «было» — сводка партии и единицы, «стало» — статус в окне.
phone_crop("v203-batch-units-m-was", (0, 780, 780, 1480), "m-batch-edit-was")
phone_crop("v203-edit-status-m-now", (0, 140, 780, 840), "m-batch-edit-now")
