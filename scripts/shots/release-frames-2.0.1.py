"""
Кадры слайдов выпуска 2.0.1 (public/release/2.0.1) из кадров «Развития».

Медиа слайда на компьютере почти квадратное (57% ширины листа × высота),
на телефоне — верх экрана. Поэтому компьютерные кадры приводятся к квадрату
1350×1350: нужная область целиком, по краям — размытый тот же кадр.
«Было» и «стало» одного слайда — одного размера (иначе ползунок не совпадает).

    python scripts/shots/release-frames-2.0.1.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/web/public/progress"
OUT = ROOT / "apps/web/public/release/2.0.1"
OUT.mkdir(parents=True, exist_ok=True)
SIDE = 1350


def square(name: str, box: tuple[int, int, int, int], out: str) -> None:
    """box — область кадра (x0, y0, x1, y1) в пикселях исходника."""
    im = Image.open(SRC / f"{name}.jpg").convert("RGB")
    region = im.crop(box)
    k = min(SIDE / region.width, SIDE / region.height)
    fg = region.resize((round(region.width * k), round(region.height * k)), Image.LANCZOS)
    # Фон — тот же кадр, растянутый на квадрат и размытый.
    kb = max(SIDE / im.width, SIDE / im.height)
    bg = im.resize((round(im.width * kb), round(im.height * kb)), Image.LANCZOS)
    left = (bg.width - SIDE) // 2
    top = (bg.height - SIDE) // 2
    bg = bg.crop((left, top, left + SIDE, top + SIDE)).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new("RGB", bg.size, (40, 46, 60)), 0.35)
    bg.paste(fg, ((SIDE - fg.width) // 2, (SIDE - fg.height) // 2))
    bg.save(OUT / f"{out}.jpg", quality=84, optimize=True)
    print(out, bg.size)


def offset(name: str, box: tuple[int, int, int, int], at_x: int, out: str) -> None:
    """Область без масштаба, левым краем в точке at_x квадрата: справа от
    линии сравнения (она стоит посередине) сразу видно главное."""
    im = Image.open(SRC / f"{name}.jpg").convert("RGB")
    region = im.crop(box)
    kb = max(SIDE / im.width, SIDE / im.height)
    bg = im.resize((round(im.width * kb), round(im.height * kb)), Image.LANCZOS)
    left = (bg.width - SIDE) // 2
    top = (bg.height - SIDE) // 2
    bg = bg.crop((left, top, left + SIDE, top + SIDE)).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new("RGB", bg.size, (40, 46, 60)), 0.35)
    bg.paste(region, (at_x, (SIDE - region.height) // 2))
    bg.save(OUT / f"{out}.jpg", quality=84, optimize=True)
    print(out, bg.size)


def phone(name: str, out: str) -> None:
    im = Image.open(SRC / f"{name}.jpg").convert("RGB")
    im.save(OUT / f"{out}.jpg", quality=84, optimize=True)
    print(out, im.size)


# Категория: старая форма и первый шаг мастера — оба окна по центру кадра.
CENTER = (405, 0, 1755, 1350)
square("addsc-was-3-sale-number", CENTER, "d-add-was")
square("addsc-now-1-category", CENTER, "d-add-now")

# Партия: одна форма → таблица на все единицы (окно шире — вписываем).
square("addsc-was-1-top", CENTER, "d-batch-was")
# Номер строки и рамы — сразу справа от линии, дальше двигатель, год, цвет.
offset("addsc-now-3-table", (216, 300, 1080, 1040), 600, "d-batch-now")

# Модели: форма с тарифами → «Продаём» без тарифов.
MODEL_FORM = (360, 80, 1800, 1350)
square("models-was-2-form", MODEL_FORM, "d-models-was")
square("models-now-2-form", MODEL_FORM, "d-models-now")

phone("addsc-was-m1", "m-add-was")
phone("addsc-now-m1-category", "m-add-now")
phone("addsc-was-m1", "m-batch-was")
phone("addsc-now-m3-cards", "m-batch-now")
