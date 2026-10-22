"""
Кадры выпуска 2.0.11 (партия правок заказчика 22.10):
  • показ обновления — apps/web/public/release/2.0.11 (компьютер: квадрат
    1350 на размытом фоне того же кадра; телефон/планшет: кадр с белыми полями);
  • пункты «Развития» — apps/web/public/progress/v2011-*.jpg.

Исходники — кадры проверки в scripts/shots/out (сценарии rel-2011-frames,
tab-rental-wizard, tab-client-wizard, tab-review, demo-director-*; «было» —
со старого кода через vite-прокси).

    python scripts/shots/release-frames-2.0.11.py
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "scripts/shots/out"
PUB = ROOT / "apps/web/public"
REL = PUB / "release/2.0.11"
PROG = PUB / "progress"
REL.mkdir(parents=True, exist_ok=True)
SIDE = 1350
INNER = 1190


def load(name: str) -> Image.Image:
    p = SRC / name
    if not p.exists():
        p = PROG / name
    return Image.open(p).convert("RGB")


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
    """Телефон/планшет: кадр с белыми полями, ширина ~820."""
    im = load(name)
    part = im.crop(box) if box else im
    k = (width - 80) / part.width
    part = part.resize((round(part.width * k), round(part.height * k)), Image.LANCZOS)
    canvas = Image.new("RGB", (part.width + 80, part.height + 100), (255, 255, 255))
    canvas.paste(part, (40, 50))
    canvas.save(REL / f"{out}.jpg", quality=84, optimize=True)
    print("release", out)


def prog(name: str, out: str, box=None, width=1000) -> None:
    """Кадр пункта «Развития»: ширина до 1000."""
    im = load(name)
    part = im.crop(box) if box else im
    if part.width > width:
        k = width / part.width
        part = part.resize((width, round(part.height * k)), Image.LANCZOS)
    part.save(PROG / f"{out}.jpg", quality=82, optimize=True)
    print("progress", out)


# ── Код директора ──
square("rel2011-code-desk-now.jpg", "d-code-now")
framed("rel2011-code-phone-now.jpg", "m-code-now", box=(0, 640, 780, 1688))
square("rel2011-settings-desk-was.jpg", "d-settings-was", box=(180, 1220, 1450, 1760))
square("rel2011-settings-desk-now.jpg", "d-settings-now", box=(180, 450, 2850, 1740))
prog("rel2011-settings-desk-was.jpg", "v2011-code-was", box=(180, 1220, 2850, 1760))
prog("rel2011-settings-desk-now.jpg", "v2011-code-now", box=(180, 450, 2850, 1740))
prog("rel2011-code-desk-now.jpg", "v2011-code-sheet-now", box=(820, 140, 2060, 1660))
prog("rel2011-code-phone-now.jpg", "v2011-code-phone-now", box=(0, 640, 780, 1688), width=600)

# ── Запрос директору ──
square("appr-6-desktop-panel.jpg", "d-approve-now", box=(860, 100, 2020, 1700))
framed("appr-3-phone-panel.jpg", "m-approve-now", box=(0, 200, 1170, 2532))
framed("appr-5-phone-reject-confirm.jpg", "m-reject-now", box=(0, 1200, 1170, 2532))
square("appr-1-admin-gate.jpg", "d-gate-staff-now", box=(980, 300, 1900, 1500))
prog("appr-3-phone-panel.jpg", "v2011-approve-phone-now", box=(0, 200, 1170, 2532), width=600)
prog("appr-5-phone-reject-confirm.jpg", "v2011-reject-phone-now", box=(0, 1200, 1170, 2532), width=600)
prog("appr-1-admin-gate.jpg", "v2011-gate-admin-now", box=(980, 300, 1900, 1500), width=700)

# ── Коды восстановления пароля ──
square("code-10-recover.jpg", "d-recover-now", box=(1000, 520, 1880, 1300))
prog("rel2011-settings-desk-now.jpg", "v2011-recovery-now", box=(180, 1370, 2850, 1740))
prog("code-10-recover.jpg", "v2011-recover-login-now", box=(1000, 520, 1880, 1300), width=700)

# ── Пункты 22.10 (кадры «Развития» уже есть) ──
square("v2011-notes-was.jpg", "d-notes-was")
square("v2011-notes-now.jpg", "d-notes-now")
square("v2011-breakdown-swap-now.jpg", "d-breakdown-now")
framed("v2011-breakdown-phone-now.jpg", "m-breakdown-now")
square("v2011-contract-was.jpg", "d-contract-was")
square("v2011-contract-now.jpg", "d-contract-now")
square("v2011-finance-admin-now.jpg", "d-finance-now")
square("v2011-key-swap-was.jpg", "d-key-was")
square("v2011-key-swap-now.jpg", "d-key-now")
framed("v2011-ipad-was.jpg", "m-ipad-was")
framed("v2011-ipad-now.jpg", "m-ipad-now")

# ── Планшет: главная, аренда, анкета ──
framed("was-rev-land-dashboard-1.jpg", "m-home-was", width=1000)
framed("rev-land-dashboard-1.jpg", "m-home-now", width=1000)
framed("was-walk-rental-2-land.jpg", "m-rental-was", width=1000)
framed("tabrent-4-land.jpg", "m-rental-now", width=1000)
framed("rel2011-client-land-was.jpg", "m-client-was", width=1000)
framed("micro-02-who-land.jpg", "m-client-now", width=1000)
prog("was-rev-land-dashboard-1.jpg", "v2011-home-was")
prog("rev-land-dashboard-1.jpg", "v2011-home-now")
prog("was-walk-rental-2-land.jpg", "v2011-rental-was")
prog("tabrent-1-land.jpg", "v2011-rental-now-1")
prog("tabrent-4-land.jpg", "v2011-rental-now-4")
prog("tabrent-5-land.jpg", "v2011-rental-now-5")
prog("tabrent-4-phone.jpg", "v2011-rental-phone-now", width=600)
prog("rel2011-client-land-was.jpg", "v2011-client-was")
prog("rel2011-client-phone-was.jpg", "v2011-client-phone-was", width=600)
prog("micro-01-photo-land.jpg", "v2011-client-now-1")
prog("micro-02-who-land.jpg", "v2011-client-now-2")
prog("micro-05-passport-land.jpg", "v2011-client-now-5")
prog("micro-10-review-land.jpg", "v2011-client-now-10")
prog("micro-03-contact-phone.jpg", "v2011-client-phone-now", width=600)

# ── «Развитие»: зашёл — прочитано ──
square("rel2011-progress-desk-was.jpg", "d-progress-was", box=(0, 950, 420, 1560))
square("rel2011-progress-desk-now.jpg", "d-progress-now", box=(0, 950, 420, 1560))
prog("rel2011-progress-desk-was.jpg", "v2011-progress-was", box=(0, 0, 280, 1300), width=280)
prog("rel2011-progress-desk-now.jpg", "v2011-progress-now", box=(0, 0, 280, 1300), width=280)
