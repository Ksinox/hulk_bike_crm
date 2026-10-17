"""
Кадры показа выпуска 2.0.9 (public/release/2.0.9) — исправления по
замечаниям заказчика 13–17.10: пробег при приёмке, номера по порядку,
парк рядами, пробег снятого при замене.

Исходники — кадры проверки в scripts/shots/out (сценарии chk-mileage-intake,
chk-scooter-sort, chk-park-pools, chk-swap-mileage; «было» снято со старого
кода). Компьютер: область кадра в квадрате 1350×1350 на размытом фоне того
же кадра. Телефон: кусок кадра с белыми полями.

    python scripts/shots/release-frames-2.0.9.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts/shots/out"
OUT = ROOT / "apps/web/public/release/2.0.9"
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


# ── 1. Пробег при приёмке (компьютер 1440×900, телефон 780×1688) ──
square("mil-d-was-2-lower", (345, 120, 715, 660), "d-intake-was")
square("mil-d-now-2-lower", (345, 120, 715, 660), "d-intake-now")
phone_crop("mil-m-was-2-lower", (0, 560, 780, 1160), "m-intake-was")
phone_crop("mil-m-now-2-lower", (0, 560, 780, 1160), "m-intake-now")

# ── 2. Скутеры по порядку номеров ──
square("sort-fleet-desk-was", (86, 370, 846, 830), "d-sort-was")
square("sort-fleet-desk-now", (86, 370, 846, 830), "d-sort-now")
phone_crop("sort-fleet-phone-was", (0, 1000, 780, 1560), "m-sort-was")
phone_crop("sort-fleet-phone-now", (0, 1000, 780, 1560), "m-sort-now")

# ── 3. Парк на главной рядами ──
# Одинаковая высота области — шторка «было/стало» без прыжка карточки.
square("park-desk-was", (80, 64, 977, 515), "d-park-was")
square("park-desk-now", (80, 6, 977, 457), "d-park-now")
phone_crop("park-phone-was", (20, 102, 760, 798), "m-park-was")
phone_crop("park-phone-now", (20, 102, 760, 798), "m-park-now")

# ── 4. Пробег снятого при замене ──
# Одна рамка на оба кадра: большое окно «было» и окно шага 1 «стало».
square("swap-desk-was-1", (180, 27, 1260, 873), "d-swap-was")
square("swap-desk-now-4-ok", (180, 27, 1260, 873), "d-swap-now")
phone_crop("swap-phone-was-1", (0, 250, 780, 1150), "m-swap-was")
phone_crop("swap-phone-now-4-ok", (0, 250, 780, 1150), "m-swap-now")
