"""
Кадры выпуска 2.1 (партия правок 23.10: ущерб — в «Должниках», долг
аренды отдельно, «Должники» — рабочий модуль):
  • показ обновления — apps/web/public/release/2.1 (компьютер: квадрат
    1350 на размытом фоне того же кадра; телефон: кадр с белыми полями).

Исходники — кадры проверки в scripts/shots/out (сценарии b4-frames,
b4-client, b5-mixed; «было» — со старого кода: до деплоя превью или через vite-прокси).

    python scripts/shots/release-frames-2.1.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts/shots/out"
PUB = ROOT / "apps/web/public"
REL = PUB / "release/2.1"
REL.mkdir(parents=True, exist_ok=True)
SIDE = 1350
INNER = 1190


def load(name: str) -> Image.Image:
    return Image.open(SRC / name).convert("RGB")


def square(name: str, out: str, box=None) -> None:
    im = load(name)
    region = im.crop(box) if box else im
    k = min(INNER / region.width, INNER / region.height)
    fg = region.resize((round(region.width * k), round(region.height * k)), Image.LANCZOS)
    kb = max(SIDE / im.width, SIDE / im.height)
    bg = im.resize((round(im.width * kb), round(im.height * kb)), Image.LANCZOS)
    left = (bg.width - SIDE) // 2
    top = (bg.height - SIDE) // 2
    bg = bg.crop((left, top, left + SIDE, top + SIDE)).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new("RGB", bg.size, (40, 46, 60)), 0.35)
    bg.paste(fg, ((SIDE - fg.width) // 2, (SIDE - fg.height) // 2))
    bg.save(REL / f"{out}.jpg", quality=84, optimize=True)
    print("release", out)


def framed(name: str, out: str, box=None, width=820) -> None:
    """Телефон: кадр с белыми полями, ширина ~820."""
    im = load(name)
    part = im.crop(box) if box else im
    k = (width - 80) / part.width
    part = part.resize((round(part.width * k), round(part.height * k)), Image.LANCZOS)
    canvas = Image.new("RGB", (part.width + 80, part.height + 100), (255, 255, 255))
    canvas.paste(part, (40, 50))
    canvas.save(REL / f"{out}.jpg", quality=84, optimize=True)
    print("release", out)


# ── Карточка аренды: ущерб не в «Долге» ──
CARD = (1780, 380, 2880, 1560)
square("b4-rental-desk-was.jpg", "d-rental-was", box=CARD)
square("b4-rental-desk-now.jpg", "d-rental-now", box=CARD)
framed("b4-rental-phone-now.jpg", "m-rental-now")

# ── Ущерб — делом: срок оплаты в акте, «Пришла ли оплата?» ──
square("b4-act-desk-now.jpg", "d-act-now", box=(1540, 180, 2640, 1000))
square("b4-check-desk-now.jpg", "d-check-now", box=(160, 780, 1770, 1670))
framed("b4-check-phone-now.jpg", "m-check-now")

# ── Оплата видна в деле, где бы её ни приняли; убрать — с ключом ──
square("b4-history-desk-now.jpg", "d-history-now", box=(160, 240, 1780, 1720))
square("b4-remove-desk-now.jpg", "d-remove-now", box=(1780, 700, 2820, 1760))

# ── «Все должники» и карточка должника ──
PAGE = (170, 180, 2830, 1780)
square("b4-debtors-desk-was.jpg", "d-debtors-was", box=PAGE)
square("b4-debtors-desk-now.jpg", "d-debtors-now", box=PAGE)
framed("b4-debtors-phone-now.jpg", "m-debtors-now")
TOP = (170, 180, 2830, 1300)
square("b4-case-desk-was.jpg", "d-case-was", box=TOP)
square("b4-case-desk-now.jpg", "d-case-now", box=TOP)
framed("b4-case-phone-was.jpg", "m-case-was")
framed("b4-case-phone-now.jpg", "m-case-now")

# ── Дашборд → дело; клиент; закрытие аренды; выкуп; тариф ──
DASH = (170, 100, 1960, 960)
square("b4-dash-desk-was.jpg", "d-dash-was", box=DASH)
square("b4-dash-desk-now.jpg", "d-dash-now", box=DASH)
square("b4-client-desk.jpg", "d-client-now", box=(920, 480, 2850, 1460))
square("b4-complete-desk-now.jpg", "d-complete-now", box=(660, 90, 2220, 1720))
square("b4-buyout-dialog-desk-now.jpg", "d-buyout-now", box=(880, 520, 2000, 1280))
TAR = (1380, 620, 2620, 1260)
square("b4-rentals-desk-was.jpg", "d-tariff-was", box=TAR)
square("b4-rentals-desk-now.jpg", "d-tariff-now", box=TAR)

# ── «Смешанно» везде, где принимают деньги ──
TOPUP = (1000, 430, 1880, 1370)
square("b5-topup-desk-was.jpg", "d-mixed-was", box=TOPUP)
square("b5-topup-desk.jpg", "d-mixed-now", box=TOPUP)
framed("b5-topup-phone-was.jpg", "m-mixed-was", box=(0, 0, 780, 920))
framed("b5-topup-phone.jpg", "m-mixed-now", box=(0, 0, 780, 920))

# ── «Развитие»: тот же кадр для пункта bug-37 ──
for n in ("d-mixed-was", "d-mixed-now"):
    (PUB / "progress").mkdir(exist_ok=True)
    Image.open(REL / f"{n}.jpg").save(PUB / "progress" / f"v21-{n[2:]}.jpg", quality=84, optimize=True)
