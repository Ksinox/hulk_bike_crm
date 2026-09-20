"""
Кадры слайдов выпуска 2.0.4 (public/release/2.0.4) из кадров «Развития».

Компьютер: область кадра в квадрате 1350×1350 на размытом фоне того же
кадра. Телефон и планшет: кусок кадра с белыми полями.

    python scripts/shots/release-frames-2.0.4.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "apps/web/public/progress"
OUT = ROOT / "apps/web/public/release/2.0.4"
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


# ── 1. Механик в ремонте (компьютер 1440×900, телефон 780×1688) ──
square("v204-repair-ready-was", (680, 60, 1430, 700), "d-mech-was")
square("v204-repair-mech-now", (680, 330, 1430, 830), "d-mech-now")
phone_crop("v204-repair-ready-m-was", (0, 380, 780, 1180), "m-mech-was")
phone_crop("v204-repair-mech-m-now", (0, 380, 780, 1180), "m-mech-now")

# ── 2. Разбивка выручки и прибыли ──
square("v204-repairs-was", (86, 180, 1430, 560), "d-money-was")
square("v204-repairs-money-now", (270, 190, 1180, 710), "d-money-now")
phone_crop("v204-repairs-m-was", (0, 400, 780, 1100), "m-money-was")
phone_crop("v204-repairs-money-m-now", (0, 240, 780, 1040), "m-money-now")

# ── 3. Замок готового ремонта и откат ──
square("v204-repair-ready-was", (680, 240, 1430, 640), "d-lock-was")
square("v204-repair-ready-now", (680, 60, 1430, 560), "d-lock-now")
phone_crop("v204-repair-ready-m-was", (0, 0, 780, 800), "m-lock-was")
phone_crop("v204-repair-ready-m-now", (0, 0, 780, 800), "m-lock-now")

# ── 4. Своя нумерация электро ──
square("v204-partner-numbers-was", (95, 355, 900, 590), "d-numbers-was")
square("v204-partner-numbers-now", (95, 355, 900, 590), "d-numbers-now")
phone_crop("v204-dash-numbers-m-was", (0, 700, 780, 1500), "m-numbers-was")
phone_crop("v204-dash-numbers-m-now", (0, 700, 780, 1500), "m-numbers-now")

# ── 5. План и факт: 5/15 и премия ──
square("v204-wall-setup-was", (86, 235, 1130, 810), "d-plan-was")
square("v204-plan-bonus-now", (86, 235, 1130, 810), "d-plan-now")

# ── 6. «Игнорировать долг» ──
square("v204-pay-01-open-was", (955, 0, 1440, 900), "d-debt-was")
square("v204-pay-02-ignore-now", (955, 0, 1440, 900), "d-debt-now")
phone_crop("v204-pay-01-open-m-was", (0, 100, 780, 900), "m-debt-was")
phone_crop("v204-pay-02-debt-ignore-m-now", (0, 100, 780, 900), "m-debt-now")

# ── 7. Правка проданной сделки ──
square("v204-sale-deal-was", (855, 140, 1430, 700), "d-deal-was")
square("v204-sale-edit-now", (855, 140, 1430, 700), "d-deal-now")

# ── 8. Ремонт нашей техники с телефона ──
phone_crop("v204-job-m-was", (0, 60, 780, 900), "m-job-was")
phone_crop("v204-job-m-now", (0, 60, 780, 900), "m-job-now")

# ── 10. Новый блок «Финансы» ──
square("fin-overview-now", (86, 140, 1430, 700), "d-finance-now")
phone_crop("fin-overview-m-now", (0, 100, 780, 1000), "m-finance-now")

# ── 8б. Паритет: дело должника с телефона ──
phone_crop("v204-debtors-m-was", (0, 60, 780, 900), "m-parity-was")
phone_crop("v204-debtor-case-m-now", (0, 60, 780, 900), "m-parity-now")

# ── 9. Планшет: родная клавиатура (кадры 820×1180) ──
phone_crop("v204-pad-port-was", (0, 380, 820, 1180), "m-pad-was")
phone_crop("v204-pad-port-now", (0, 0, 820, 800), "m-pad-now")
