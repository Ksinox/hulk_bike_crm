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


def modal_box(name: str, pad: int = 24) -> tuple[int, int, int, int]:
    """Белое окно поверх затемнённой страницы: строки и столбцы, где больше
    трети точек почти белые."""
    im = Image.open(SRC / f"{name}.jpg").convert("L")
    small = im.resize((im.width // 4, im.height // 4))
    w, h = small.size
    px = small.load()
    rows = [y for y in range(h) if sum(1 for x in range(w) if px[x, y] >= 246) > w * 0.3]
    y0, y1 = rows[0], rows[-1]
    cols = [x for x in range(w) if sum(1 for y in range(y0, y1 + 1) if px[x, y] >= 246) > (y1 - y0) * 0.5]
    x0, x1 = cols[0], cols[-1]
    return (
        max(0, x0 * 4 - pad),
        max(0, y0 * 4 - pad),
        min(im.width, (x1 + 1) * 4 + pad),
        min(im.height, (y1 + 1) * 4 + pad),
    )


def union(*boxes: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def pair(was: str, now: str, out: str, shift_now: int = 0) -> None:
    """«Было» и «стало» — окно целиком, одна и та же область у обоих кадров."""
    box = union(modal_box(was), modal_box(now))
    print(out, "окно", box)
    square(was, box, f"{out}-was")
    square(now, (box[0], box[1] + shift_now, box[2], box[3] + shift_now), f"{out}-now")


def phone(name: str, out: str) -> None:
    im = Image.open(SRC / f"{name}.jpg").convert("RGB")
    im.save(OUT / f"{out}.jpg", quality=84, optimize=True)
    print(out, im.size)


# 16.09 (заказчик: «кадр сдвинут вбок, весь блок не рассмотреть»): окна —
# целиком, одной областью для «было» и «стало»; читать мелкое — «Крупно».
pair("addsc-was-3-sale-number", "addsc-now-1-category", "d-add")
pair("addsc-was-1-top", "addsc-now-3-table", "d-batch")
# В «стало» пометка о цене сдвигает таблицу на 15 px — выравниваем строки.
pair("addsc2-was-table", "vinfmt-now-table", "d-errors", shift_now=15)
MODEL_FORM = (360, 80, 1800, 1350)
square("models-was-2-form", MODEL_FORM, "d-models-was")
square("models-now-2-form", MODEL_FORM, "d-models-now")

# Партии — не окно, а страница: первая карточка целиком.
BATCH_BOX = (110, 200, 1140, 1320)
square("batch-was-search", BATCH_BOX, "d-batches-was")
square("batch-now-d", BATCH_BOX, "d-batches-now")

phone("errors-was-m", "m-errors-was")
phone("errors-now-m", "m-errors-now")
phone("batch-was-m", "m-batches-was")
phone("batch-now-m", "m-batches-now")

phone("addsc-was-m1", "m-add-was")
phone("addsc-now-m1-category", "m-add-now")
phone("addsc-was-m1", "m-batch-was")
phone("addsc-now-m3-cards", "m-batch-now")
