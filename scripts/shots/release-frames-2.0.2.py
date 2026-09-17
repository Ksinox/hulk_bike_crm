"""
Кадры слайдов выпуска 2.0.2 (public/release/2.0.2) из кадров «Развития».

Компьютер: нужная область целиком в квадрате 1350×1350 на размытом фоне того
же кадра; «было» и «стало» одного слайда — одной областью, чтобы ползунок
сравнивал одно и то же место. Телефон — кадр целиком.

    python scripts/shots/release-frames-2.0.2.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/web/public/progress"
OUT = ROOT / "apps/web/public/release/2.0.2"
OUT.mkdir(parents=True, exist_ok=True)
SIDE = 1350
# Слайд обрезает квадрат по краям (object-fit: cover): на 1440 — по бокам,
# на 1366 — сверху и снизу. Область кладём с полями, чтобы край не срезался.
INNER = 1190


def square(name: str, box: tuple[int, int, int, int], out: str, region=None) -> None:
    im = Image.open(SRC / f"{name}.jpg").convert("RGB")
    region = region or im.crop(box)
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


def stacked(name: str, parts: list[tuple[int, int, int, int]]) -> Image.Image:
    """Куски кадра одной колонкой — широкий ряд плиток в два ряда, чтобы
    суммы читались на слайде."""
    im = Image.open(SRC / f"{name}.jpg").convert("RGB")
    crops = [im.crop(b) for b in parts]
    w = max(c.width for c in crops)
    h = sum(c.height for c in crops)
    out = Image.new("RGB", (w, h), im.getpixel((parts[0][0] + 2, parts[0][1] + 2)))
    y = 0
    for c in crops:
        out.paste(c, (0, y))
        y += c.height
    return out


def phone_crop(name: str, box: tuple[int, int, int, int], out: str) -> None:
    """Кусок кадра телефона — когда нужное место не в начале экрана."""
    im = Image.open(SRC / f"{name}.jpg").convert("RGB").crop(box)
    im.save(OUT / f"{out}.jpg", quality=84, optimize=True)
    print(out, im.size)


def pair(was: str, now: str, box, out: str, box_now=None) -> None:
    square(was, box, f"{out}-was")
    square(now, box_now or box, f"{out}-now")


def phone(name: str, out: str) -> None:
    im = Image.open(SRC / f"{name}.jpg").convert("RGB")
    im.save(OUT / f"{out}.jpg", quality=84, optimize=True)
    print(out, im.size)


# Кадры компьютера — 1440×900.
DRAWER = (680, 0, 1440, 900)  # карточка ремонта справа
FORM = (290, 27, 1150, 873)  # окно «Новый ремонт» (старое окно — внутри той же области)
LIST = (86, 20, 1422, 700)  # цифры за период и список
RENT = (330, 24, 1110, 826)  # окно «Новая аренда»
LOAD = (80, 80, 760, 330)  # круги загрузки парка
INVOICE = (240, 16, 1200, 862)  # предпросмотр накладной

pair("v202-sv-new-was", "v202-sv-form-top-now", FORM, "d-repair-form")
pair("v202-sv-card-was", "v202-sv-card-money-now", DRAWER, "d-repair-advance")
# Выручка: заголовок и период, плитки 1–2, плитки 3–4 (строки списка по
# ширине не влезают — их видно в «Крупно»).
REV_PARTS = [(86, 20, 752, 180), (86, 190, 752, 298), (760, 190, 1426, 298)]
square("v202-sv-list-was", (0, 0, 1, 1), "d-repair-revenue-was", stacked("v202-sv-list-was", REV_PARTS))
square("v202-sv-list-now", (0, 0, 1, 1), "d-repair-revenue-now", stacked("v202-sv-list-now", REV_PARTS))
pair("v202-sv-card-was", "v202-sv-invoice-now", DRAWER, "d-repair-invoice", INVOICE)
pair("v202-sv-card-was", "v202-sv-edit-now", DRAWER, "d-repair-client")
pair("v202-sv-cancelled-was", "v202-sv-cancelled-now", DRAWER, "d-repair-reopen")
pair("v202-rent-pay-was", "v202-rent-pay-now", RENT, "d-rent-split")
pair("v202-load-was", "v202-load-now", LOAD, "d-park-load")
pair("v202-sv-card-was", "v202-parts-picker-now", DRAWER, "d-repair-parts")

for was, now, out in [
    ("v202-sv-new-m-was", "v202-sv-form-m-now", "m-repair-form"),
    ("v202-sv-pay-m-was", "v202-sv-advance-m-now", "m-repair-advance"),
    ("v202-sv-list-m-was", "v202-sv-list-m-now", "m-repair-revenue"),
    ("v202-sv-card-m-was", "v202-sv-invoice-m-now", "m-repair-invoice"),
    ("v202-sv-card-m-was", "v202-sv-edit-m-now", "m-repair-client"),
    ("v202-sv-cancelled-m-was", "v202-sv-cancelled-m-now", "m-repair-reopen"),
    ("v202-rent-pay-m-was", "v202-rent-pay-m-now", "m-rent-split"),
    ("v202-load-m-was", "v202-load-m-now", "m-park-load"),
]:
    phone(was, f"{out}-was")
    phone(now, f"{out}-now")

# Прайс запчастей: «было» — раздел «Запчасти» старой карточки (без «Из
# прайса»), «стало» — начало окна выбора: поиск, модели, зоны.
phone_crop("v202-sv-card-m2-was", (0, 365, 780, 1065), "m-repair-parts-was")
phone_crop("v202-parts-picker-m-now", (0, 0, 780, 700), "m-repair-parts-now")
