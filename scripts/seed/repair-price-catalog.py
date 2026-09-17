"""
Прейскурант сторонних ремонтов (выпуск 2.0.2): запчасти и работы.

Заказчик (17.09): «приезжает клиент с поломкой — любую деталь скутера, даже
самую маленькую, мы должны найти в программе». Поэтому запчасти разложены
как скутер при разборке: зона (кузов, двигатель, трансмиссия…) → узел →
деталь; у детали — модели, на которые она подходит, где цена по моделям
разная — отдельная строка.

Модели из базы: Yamaha Gear 4T (UA06J/07J/08J), Yamaha Jog 4T (SA36J/39J),
Yamaha Vino 4T (SA26J/37J — мотор общий с Jog), Yamaha Jog AY01 (сделан
Honda, мотор и узлы как у Honda Dio/Tact 4T), Honda Dio AF62/68,
Tank T150 (китайский 150 см³, мотор GY6 157QMJ), электро (AIMA, U-5, U-2).

Закуп — розничные цены магазинов запчастей (Краснодар — oilshop55.ru,
СПб — scooter-online.ru, Москва — kupiscooter.ru), сентябрь 2026; где
точной цены нет — по аналогам. Цена клиенту — закуп + наценка сервиса
(около +35%, на дорогое меньше), округлено до 50 ₽. Работы — средние
расценки мотосервисов Краснодара. Цены правит директор в «Документах».

У каждой позиции — постоянный код (одинаковый на всех базах) и ключ
картинки: одна картинка на деталь, модели-варианты её делят. Для
генерации картинок — docs/parts-catalog/.

    python scripts/seed/repair-price-catalog.py
пишет apps/api/drizzle/0093_repair_price_seed.sql и docs/parts-catalog/*.csv
"""
import csv
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL_OUT = ROOT / "apps/api/drizzle/0093_repair_price_seed.sql"
DOC_DIR = ROOT / "docs/parts-catalog"

GEAR = "Yamaha Gear 4T"
JOG = "Yamaha Jog 4T"
AY01 = "Yamaha Jog AY01"
DIO = "Honda Dio AF62/68"
TANK = "Tank T150"
Y4T = "Yamaha 4T (Jog, Vino, Gear)"
H4T = "Honda 4T (Dio, Jog AY01)"
GY6 = "GY6 150 (Tank T150)"
YH = "Yamaha 4T, Honda 4T"
ALL = "все модели"
EV = "электро (AIMA, U-5, U-2)"

VCODE = {GEAR: "G", JOG: "J", AY01: "A", DIO: "D", TANK: "T", Y4T: "Y", H4T: "H", GY6: "C", YH: "YH", ALL: "U", EV: "E"}


def client_price(cost: int) -> int:
    m = 1.45 if cost < 500 else 1.35 if cost < 3000 else 1.3 if cost < 10000 else 1.2
    return int(math.ceil(cost * m / 50) * 50)


def r50(v: float) -> int:
    return max(50, int(round(v / 50) * 50))


def V5(base: int, g=1.0, j=0.85, a=1.05, d=1.05, t=0.55):
    """Кузовная деталь для пяти моделей — от цены для Gear."""
    return [(GEAR, r50(base * g)), (JOG, r50(base * j)), (AY01, r50(base * a)), (DIO, r50(base * d)), (TANK, r50(base * t))]


def M5(g, j, a, d, t):
    return [(GEAR, g), (JOG, j), (AY01, a), (DIO, d), (TANK, t)]


def E3(y, h, c):
    return [(Y4T, y), (H4T, h), (GY6, c)]


def U(cost):
    return [(ALL, cost)]


def EVc(cost):
    return [(EV, cost)]


def M(d: dict):
    return list(d.items())


# Зона → узлы → детали: (ключ картинки, название, English для картинки, варианты)
CATALOG = []


def zone(ru, code, en):
    z = {"ru": ru, "code": code, "en": en, "groups": []}
    CATALOG.append(z)
    return z


def grp(z, ru, code, where_en, parts):
    z["groups"].append({"ru": ru, "code": code, "where": where_en, "parts": parts})


# ================================================================= КУЗОВ
z = zone("Кузов", "BODY", "body")
grp(z, "Передняя часть", "FRONT", "front of the scooter: front fairing and leg shield", [
    ("front-cover", "Облицовка передняя (клюв)", "front fairing (nose cover)", V5(3300)),
    ("leg-shield", "Щиток передний внутренний (под колени)", "inner leg shield panel behind the front fairing", V5(2600)),
    ("front-lower-cover", "Подклювник (нижняя облицовка)", "lower front cover under the nose", V5(2000)),
    ("front-fender", "Крыло переднее", "front mudguard over the front wheel", V5(1800)),
    ("front-emblem", "Эмблема на облицовке", "brand emblem badge on the front fairing", V5(500)),
    ("front-grille", "Накладка (решётка) передней облицовки", "decorative grille trim on the front fairing", V5(700)),
    ("front-cover-bracket", "Кронштейн передней облицовки", "metal bracket that holds the front fairing", V5(600)),
    ("horn-cover", "Накладка звукового сигнала", "small plastic cover over the horn", U(300)),
])
grp(z, "Руль и приборная панель", "HANDLE", "handlebar covers at the top front of the scooter", [
    ("handle-cover-front", "Обтекатель руля передний", "front handlebar cover (headlight side)", V5(2200)),
    ("handle-cover-rear", "Обтекатель руля задний (крышка руля)", "rear handlebar cover facing the rider", V5(1500)),
    ("meter-frame", "Рамка приборной панели", "speedometer bezel frame", V5(900)),
    ("windscreen", "Ветровое стекло (козырёк)", "small transparent windscreen visor", M({GEAR: 1600, TANK: 1200})),
    ("windscreen-screws", "Крепёж ветрового стекла (комплект)", "windscreen mounting screws and rubber washers", U(200)),
])
grp(z, "Средняя часть и пол", "MIDDLE", "middle of the scooter: floorboard and inner panel", [
    ("floor-board", "Пол (подножка водителя)", "rider floorboard panel", V5(3000)),
    ("side-skirts", "Лыжи боковые нижние (пара)", "pair of lower side skirts under the floorboard", V5(2400)),
    ("floor-mat", "Коврик пола резиновый", "rubber floor mat on the floorboard", V5(700)),
    ("glovebox", "Карман (бардачок) внутреннего щитка", "glove box pocket in the inner leg shield", V5(4800)),
    ("glovebox-lid", "Крышка бардачка", "glove box lid", V5(700)),
    ("glovebox-lock", "Замок бардачка", "small glove box lock with key", U(450)),
    ("bag-hook", "Крючок для сумки", "folding bag hook under the handlebar", U(250)),
    ("battery-lid", "Лючок аккумулятора", "battery compartment lid in the floorboard", V5(600)),
    ("fuel-lid", "Лючок бензобака", "fuel filler flap", V5(500)),
    ("center-tunnel", "Накладка центрального тоннеля", "center tunnel cover between the rider's feet", V5(1300)),
])
grp(z, "Задняя часть", "REAR", "rear body of the scooter", [
    ("side-cover-left", "Боковина левая", "left side body panel", V5(2600)),
    ("side-cover-right", "Боковина правая", "right side body panel", V5(2600)),
    ("tail-cover", "Задний обтекатель (хвост)", "rear tail cover", V5(2200)),
    ("seat-under-trim", "Накладка под сиденьем", "trim panel under the seat", V5(1100)),
    ("rear-fender", "Крыло заднее", "rear inner mudguard over the rear wheel", V5(1200)),
    ("mud-flap", "Брызговик задний", "rear rubber mud flap", U(500)),
    ("plate-holder", "Кронштейн номерного знака", "license plate bracket", V5(700)),
    ("reflector", "Катафот (отражатель)", "red rear reflector", U(150)),
    ("grab-handle", "Ручка пассажира", "passenger grab handle", V5(1100)),
    ("rear-carrier", "Багажник задний", "rear luggage carrier rack", V5(1800)),
    ("top-box-plate", "Площадка под кофр", "top case mounting plate", U(800)),
    ("front-basket", "Корзина передняя", "front basket", M({GEAR: 1500})),
    ("basket-bracket", "Кронштейн передней корзины", "front basket mounting bracket", M({GEAR: 700})),
    ("pillion-pegs", "Подножки пассажира (пара)", "pair of passenger foot pegs", M({TANK: 900})),
])
grp(z, "Сиденье и багажный отсек", "SEAT", "seat and under-seat storage", [
    ("seat", "Сиденье в сборе", "complete rider seat", V5(2400)),
    ("seat-cover", "Чехол сиденья (под перетяжку)", "seat cover upholstery", U(700)),
    ("seat-hinge", "Петля сиденья", "seat hinge", V5(450)),
    ("seat-lock", "Замок сиденья", "seat latch lock", V5(600)),
    ("seat-lock-cable", "Трос замка сиденья", "seat lock release cable", U(250)),
    ("seat-bumper", "Резиновый упор сиденья", "small rubber seat bumper", U(80)),
    ("seat-strut", "Газовый упор сиденья", "seat gas strut", M({AY01: 700, TANK: 600})),
    ("storage-box", "Подсидельный бокс (багажник под сиденьем)", "under-seat storage box", V5(1900)),
    ("helmet-hook", "Крючок для шлема", "helmet hook", U(200)),
])
grp(z, "Рама и крепёж кузова", "FRAME", "frame and body fasteners", [
    ("frame", "Рама (контрактная)", "scooter steel frame", M5(9000, 8000, 10000, 9500, 7000)),
    ("plastic-clips", "Клипсы (пистоны) пластика, 10 шт", "plastic push rivet clips", U(200)),
    ("body-screws", "Саморезы облицовки, 10 шт", "body panel self-tapping screws", U(120)),
    ("body-bolts", "Болты облицовки M6 с шайбами, 10 шт", "M6 body bolts with washers", U(250)),
    ("clip-nuts", "Гайки-скобы закладные, 10 шт", "sheet metal clip nuts", U(150)),
    ("rubber-grommets", "Резиновые втулки крепления пластика, 10 шт", "rubber mounting grommets", U(200)),
    ("decals", "Наклейки (комплект)", "decal sticker set", V5(700)),
    ("body-kit", "Комплект пластика целиком (все окрашенные детали)", "complete set of painted body panels", V5(22000)),
    ("touch-up-paint", "Краска в цвет (баллон)", "touch-up spray paint can", U(600)),
])

# ============================================================= УПРАВЛЕНИЕ
z = zone("Управление", "CTRL", "controls")
grp(z, "Руль и рычаги", "BAR", "handlebar", [
    ("handlebar", "Руль (труба)", "handlebar tube", M5(1900, 1600, 1800, 1700, 1500)),
    ("grips", "Грипсы (пара)", "pair of handlebar grips", U(350)),
    ("throttle-tube", "Ручка газа (втулка с грипсой)", "throttle tube with grip", U(450)),
    ("bar-ends", "Грузики руля (пара)", "pair of handlebar end weights", U(400)),
    ("lever-left", "Рычаг тормоза левый", "left brake lever", U(400)),
    ("lever-right", "Рычаг тормоза правый", "right brake lever", U(400)),
    ("levers-disc", "Рычаги под дисковый тормоз (пара)", "pair of brake levers for a disc brake", U(900)),
    ("lever-bracket", "Кронштейн рычага тормоза", "brake lever bracket", U(450)),
    ("lever-pivot", "Ось (болт) рычага тормоза", "brake lever pivot bolt", U(80)),
    ("handlebar-bolt", "Болт крепления руля с гайкой", "handlebar clamp bolt with nut", U(200)),
    ("mirrors", "Зеркала (пара)", "pair of rear-view mirrors", M({
        ALL: 700,
        "Yamaha Gear, Jog, Vino — оригинальной формы": 1100,
        "Honda Dio, Jog AY01 — оригинальной формы": 1200,
    })),
    ("mirror-adapter", "Переходник зеркала М8/М10", "mirror thread adapter", U(150)),
])
grp(z, "Приборы и переключатели", "SWITCH", "dashboard and handlebar switches", [
    ("speedometer", "Спидометр (приборная панель)", "speedometer instrument cluster", M5(3200, 2800, 3500, 3000, 1800)),
    ("meter-lens", "Стекло приборной панели", "speedometer lens", M5(600, 550, 650, 600, 400)),
    ("meter-bulb", "Лампа подсветки приборов 12V 1,7W", "tiny dashboard bulb", U(60)),
    ("switch-left", "Блок кнопок на руле левый", "left handlebar switch block", M5(900, 900, 1000, 1000, 700)),
    ("switch-right", "Блок кнопок на руле правый", "right handlebar switch block", M5(900, 900, 1000, 1000, 700)),
    ("starter-button", "Кнопка стартера", "starter push button", U(250)),
    ("ignition-switch", "Замок зажигания (комплект с ключами)", "ignition switch set with keys", M5(1900, 1900, 2200, 2200, 1200)),
    ("key-blank", "Ключ-заготовка", "key blank", U(200)),
    ("key-shutter", "Шторка замка зажигания (магнитная)", "magnetic ignition key shutter", M({AY01: 1500, DIO: 1400})),
])
grp(z, "Тросы и привод спидометра", "CABLE", "control cables along the frame", [
    ("throttle-cable", "Трос газа", "throttle cable", M5(450, 350, 450, 400, 300)),
    ("front-brake-cable", "Трос переднего тормоза", "front brake cable", M5(260, 250, 350, 300, 280)),
    ("rear-brake-cable", "Трос заднего тормоза", "rear brake cable", M5(350, 330, 400, 380, 350)),
    ("speedo-cable", "Трос спидометра", "speedometer cable", M5(430, 430, 480, 450, 350)),
    ("speedo-drive", "Привод спидометра (червяк)", "speedometer drive gear unit at the front hub", E3(450, 500, 350)),
    ("choke-cable", "Трос подсоса", "choke cable", M({GY6: 300})),
])

# ============================================================== ОСВЕЩЕНИЕ
z = zone("Освещение и сигналы", "LIGHT", "lighting")
grp(z, "Фары и фонари", "LAMP", "headlight at the front and taillight at the rear", [
    ("headlight", "Фара в сборе", "headlight assembly", M5(2400, 1600, 2600, 2200, 1500)),
    ("headlight-lens", "Стекло фары", "headlight lens", M5(900, 700, 1000, 900, 600)),
    ("headlight-reflector", "Отражатель фары", "headlight reflector", M5(1200, 900, 1300, 1100, 700)),
    ("headlight-socket", "Патрон лампы фары", "headlight bulb socket with wires", U(250)),
    ("position-light", "Габаритный огонь передний", "front position light", U(400)),
    ("taillight", "Стоп-сигнал в сборе", "taillight assembly", M5(2700, 2400, 2800, 2500, 1200)),
    ("taillight-lens", "Стекло стоп-сигнала", "red taillight lens", M5(900, 800, 950, 900, 500)),
    ("taillight-socket", "Патрон лампы стоп-сигнала", "taillight bulb socket", U(200)),
    ("plate-light", "Подсветка номера", "license plate light", U(400)),
])
grp(z, "Поворотники и сигнал", "TURN", "turn signals and horn", [
    ("turn-front", "Поворотник передний (1 шт)", "front turn signal", M5(600, 500, 650, 600, 350)),
    ("turn-rear", "Поворотник задний (1 шт)", "rear turn signal", M5(600, 500, 650, 600, 350)),
    ("turn-lenses", "Стёкла передних поворотников (пара)", "pair of amber front turn signal lenses", M({GEAR: 550, JOG: 550, DIO: 600})),
    ("turn-socket", "Патрон лампы поворотника", "turn signal bulb socket", U(150)),
    ("flasher-relay", "Реле поворотов", "turn signal flasher relay", U(250)),
    ("horn", "Звуковой сигнал", "12V horn", U(300)),
])
grp(z, "Лампы", "BULB", "bulbs inside the lights", [
    ("bulb-head", "Лампа фары 12V 35/35W", "headlight bulb 12V 35/35W", U(150)),
    ("bulb-head-led", "Лампа фары светодиодная", "LED headlight bulb", U(700)),
    ("bulb-turn", "Лампа поворота 12V 10W", "turn signal bulb 12V 10W", U(60)),
    ("bulb-position", "Лампа габарита 12V 5W (T10)", "small T10 position bulb", U(50)),
    ("bulb-stop", "Лампа стоп-сигнала 12V 21/5W", "brake light bulb 12V 21/5W", U(70)),
])

# ============================================================== ЭЛЕКТРИКА
z = zone("Электрика", "ELEC", "electrics")
grp(z, "Питание", "POWER", "battery compartment and main wiring", [
    ("battery", "Аккумулятор", "12V motorcycle battery", M({
        "12V 4Ah (YTX4L-BS) — Jog, Vino, Gear, Dio": 1800,
        "12V 5Ah (YTX5L-BS) — Jog AY01, Gear": 2100,
        "12V 7Ah (YTX7A-BS) — Tank T150": 2600,
    })),
    ("battery-terminals", "Клеммы аккумулятора с болтами (пара)", "battery terminal bolts and nuts", U(150)),
    ("ground-wire", "Провод массы", "ground (earth) wire", U(250)),
    ("battery-cable", "Провод аккумулятора плюсовой", "positive battery cable", U(300)),
    ("starter-relay", "Реле стартера", "starter relay", M({YH: 600, GY6: 350})),
    ("fuse-box", "Блок предохранителей", "fuse box", U(350)),
    ("fuses", "Предохранители (комплект)", "set of blade fuses", U(50)),
    ("regulator", "Реле-регулятор напряжения", "voltage regulator rectifier", E3(1100, 1200, 500)),
    ("wiring-harness", "Жгут проводки", "main wiring harness", M5(3000, 2800, 3500, 3200, 1800)),
    ("connectors", "Разъёмы и клеммы проводки (комплект)", "wire connectors and terminals", U(200)),
])
grp(z, "Зажигание и датчики", "IGN", "ignition and engine sensors", [
    ("spark-plug", "Свеча зажигания", "spark plug", M({
        "NGK CR7E — " + Y4T: 1100,
        "NGK CR7HSA — " + H4T: 450,
        "NGK C7HSA — " + GY6: 350,
    })),
    ("plug-cap", "Колпачок свечи", "spark plug cap", U(170)),
    ("ignition-coil", "Катушка зажигания", "ignition coil", E3(850, 1300, 450)),
    ("cdi", "Коммутатор (CDI)", "CDI ignition unit", M({GY6: 650})),
    ("ecu", "Блок управления инжектором (ЭБУ)", "fuel injection ECU", M({Y4T: 7500, H4T: 8500})),
    ("tps", "Датчик положения дросселя", "throttle position sensor", M({YH: 1500})),
    ("o2-sensor", "Датчик кислорода (лямбда-зонд)", "oxygen sensor", M({Y4T: 2200, H4T: 2600})),
    ("temp-sensor", "Датчик температуры двигателя", "engine temperature sensor", M({YH: 600})),
    ("map-sensor", "Датчик давления во впуске", "intake pressure sensor", M({YH: 1800})),
    ("pickup-coil", "Датчик положения коленвала", "crankshaft position pickup coil", E3(900, 1000, 500)),
    ("fuel-level-sensor", "Датчик уровня топлива", "fuel level sender in the tank", M5(800, 800, 900, 900, 600)),
    ("stop-switch", "Выключатель стоп-сигнала (на рычаге)", "brake light switch at the lever", U(150)),
    ("side-stand-switch", "Датчик боковой подножки", "side stand safety switch", M({AY01: 900, DIO: 800})),
])
grp(z, "Генератор и стартер", "GEN", "generator and starter on the engine", [
    ("stator", "Статор генератора", "generator stator coil", E3(3000, 3200, 1800)),
    ("rotor", "Ротор генератора (маховик)", "flywheel rotor", E3(2500, 2700, 1500)),
    ("flywheel-key", "Шпонка маховика", "flywheel woodruff key", U(80)),
    ("flywheel-nut", "Гайка маховика", "flywheel nut", U(120)),
    ("starter-motor", "Электростартер", "electric starter motor", E3(2100, 2400, 1600)),
    ("starter-brushes", "Щётки стартера", "starter motor brushes", U(350)),
    ("starter-bendix", "Бендикс стартера", "starter drive (bendix)", E3(800, 900, 600)),
    ("starter-idle-gear", "Шестерня стартера промежуточная", "starter idle gear", U(500)),
    ("starter-clutch", "Обгонная муфта стартера", "starter one-way clutch", E3(1500, 1600, 1000)),
])

# ============================================================== ДВИГАТЕЛЬ
z = zone("Двигатель", "ENG", "engine")
grp(z, "Цилиндр и поршень", "CYL", "cylinder and piston inside the engine", [
    ("piston-kit", "ЦПГ в сборе (цилиндр, поршень, кольца)", "cylinder kit with piston and rings", E3(4790, 4500, 3900)),
    ("cylinder", "Цилиндр", "engine cylinder", E3(3000, 2800, 2200)),
    ("piston", "Поршень с кольцами и пальцем", "piston with rings and pin", E3(2000, 1800, 1400)),
    ("piston-rings", "Кольца поршневые (комплект)", "set of piston rings", E3(700, 650, 450)),
    ("piston-pin", "Палец поршня", "piston pin", E3(200, 200, 180)),
    ("pin-clips", "Стопорные кольца пальца (пара)", "piston pin circlips", U(50)),
    ("cylinder-gasket", "Прокладка под цилиндр", "cylinder base gasket", E3(150, 150, 120)),
    ("head-gasket", "Прокладка ГБЦ", "cylinder head gasket", E3(200, 200, 180)),
    ("cylinder-studs", "Шпильки цилиндра (комплект)", "cylinder studs set", E3(600, 600, 500)),
    ("cylinder-nuts", "Гайки шпилек цилиндра с шайбами (комплект)", "cylinder head nuts and washers", U(200)),
    ("dowel-pins", "Центровочные втулки цилиндра (пара)", "cylinder dowel pins", U(100)),
])
grp(z, "Головка и ГРМ", "HEAD", "cylinder head and timing chain", [
    ("cylinder-head", "Головка цилиндра в сборе", "complete cylinder head", E3(5500, 5200, 3500)),
    ("valves", "Клапаны (комплект)", "intake and exhaust valves", E3(1280, 1200, 650)),
    ("valve-springs", "Пружины клапанов (комплект)", "valve springs set", E3(400, 400, 350)),
    ("valve-keepers", "Сухари клапанов (комплект)", "valve collet keepers", U(100)),
    ("valve-seals", "Сальники клапанов (комплект)", "valve stem seals", U(300)),
    ("valve-guides", "Направляющие клапанов (пара)", "valve guides", U(500)),
    ("camshaft", "Распредвал", "camshaft", E3(1500, 1600, 1200)),
    ("rocker-arms", "Коромысла клапанов (пара)", "valve rocker arms", E3(900, 900, 600)),
    ("rocker-shafts", "Оси коромысел (пара)", "rocker arm shafts", U(400)),
    ("valve-adjusters", "Регулировочные винты клапанов с гайками (пара)", "valve adjusting screws with nuts", U(200)),
    ("cam-sprocket", "Звезда распредвала", "camshaft sprocket", E3(500, 500, 400)),
    ("cam-chain", "Цепь ГРМ", "timing chain", E3(900, 900, 700)),
    ("chain-tensioner", "Натяжитель цепи ГРМ", "timing chain tensioner", E3(900, 900, 600)),
    ("tensioner-gasket", "Прокладка натяжителя", "tensioner gasket", U(60)),
    ("chain-guide", "Успокоитель цепи ГРМ", "timing chain guide", U(450)),
    ("tensioner-blade", "Башмак натяжителя цепи ГРМ", "timing chain tensioner blade", U(450)),
    ("valve-cover", "Крышка клапанов", "valve cover", E3(900, 900, 600)),
    ("valve-cover-gasket", "Прокладка клапанной крышки", "valve cover gasket", U(250)),
    ("tappet-caps", "Крышки регулировочных окон с кольцами (пара)", "valve adjustment caps with o-rings", M({GY6: 250})),
])
grp(z, "Картер и коленвал", "CRANK", "crankcase and crankshaft", [
    ("crankshaft", "Коленвал", "crankshaft with connecting rod", E3(6500, 6200, 4500)),
    ("crank-bearings", "Подшипники коленвала (пара)", "crankshaft main bearings", E3(900, 900, 800)),
    ("crank-seals", "Сальники коленвала (пара)", "crankshaft oil seals", M({YH: 200, GY6: 250})),
    ("crankcase", "Картер (половинка)", "engine crankcase half", E3(6000, 6000, 3500)),
    ("crankcase-gasket", "Прокладка картера", "crankcase gasket", E3(150, 150, 120)),
    ("crankcase-bolts", "Болты картера (комплект)", "crankcase bolts", U(300)),
    ("generator-cover", "Крышка генератора", "generator (magneto) cover", E3(1500, 1600, 900)),
    ("generator-cover-gasket", "Прокладка крышки генератора", "generator cover gasket", U(120)),
    ("generator-seals", "Сальники двигателя со стороны генератора (комплект)", "engine oil seals on the generator side", M({Y4T: 220})),
    ("engine-gaskets", "Прокладки двигателя (полный комплект)", "complete engine gasket set", E3(900, 900, 650)),
    ("top-end-gaskets", "Прокладки ЦПГ (верхний комплект)", "top end gasket set", E3(330, 350, 300)),
    ("engine-assembly", "Двигатель в сборе (контрактный)", "complete scooter engine", E3(25000, 26000, 18000)),
])
grp(z, "Смазка", "OIL", "engine oil system", [
    ("oil-pump", "Масляный насос", "oil pump", E3(900, 1000, 700)),
    ("oil-pump-drive", "Шестерня (цепь) привода маслонасоса", "oil pump drive gear or chain", U(400)),
    ("oil-strainer", "Сетка маслоприёмника", "oil strainer screen", U(200)),
    ("drain-plug", "Пробка сливная с прокладкой", "oil drain plug with gasket", U(200)),
    ("drain-washer", "Шайба сливной пробки медная", "copper drain plug washer", U(40)),
    ("dipstick", "Щуп масляный", "oil dipstick", U(200)),
    ("oil-orings", "Кольца уплотнительные масляные (комплект)", "oil o-rings set", U(150)),
    ("oil-filter-cap", "Крышка масляного фильтра с пружиной", "oil filter cap with spring", M({GY6: 400})),
])
grp(z, "Кикстартер и подвеска двигателя", "KICK", "kick starter and engine mount", [
    ("kick-shaft", "Вал кикстартера с шестернёй", "kick start shaft with gear", M({Y4T: 900, GY6: 700})),
    ("kick-spring", "Пружина кикстартера", "kick start return spring", U(150)),
    ("kick-ratchet", "Шестерня кикстартера (трещотка)", "kick start ratchet gear", M({Y4T: 600, GY6: 450})),
    ("kick-lever", "Ножка кикстартера", "kick start lever", U(450)),
    ("engine-mount-bushings", "Сайлентблоки подвески двигателя (комплект)", "engine mount rubber bushings", U(900)),
    ("engine-mount-bolt", "Болт подвески двигателя с гайкой", "engine mount bolt with nut", U(250)),
])

# ============================================================ ТРАНСМИССИЯ
z = zone("Трансмиссия", "TRANS", "transmission")
grp(z, "Вариатор", "CVT", "CVT variator on the left side of the engine", [
    ("drive-belt", "Ремень вариатора", "CVT drive belt", M({
        "810×17,5 — Yamaha Gear 4T": 890,
        "660×16,5 — Yamaha Jog 4T, Vino 4T": 790,
        "670×17,7 — Honda Dio AF62/68, Jog AY01": 900,
        "оригинальный Honda 23100-GFC — Dio, Jog AY01": 4990,
        "842×20 — " + GY6: 890,
    })),
    ("variator-rollers", "Ролики вариатора (6 шт)", "set of six variator rollers", M({
        "15×12 — " + Y4T: 240,
        "16×13 — " + H4T: 300,
        "18×14 — " + GY6: 350,
    })),
    ("variator-sliders", "Слайдеры вариатора (комплект)", "variator sliders", U(250)),
    ("variator", "Передний вариатор в сборе", "complete front variator (drive pulley)", E3(2200, 1700, 1650)),
    ("fan-pulley", "Щёчка вариатора неподвижная (крыльчатка)", "fixed drive face with cooling fins", E3(800, 700, 600)),
    ("ramp-plate", "Опорная шайба (кулиса) вариатора", "variator ramp plate", U(350)),
    ("variator-bushing", "Втулка переднего вариатора", "variator bushing", U(350)),
    ("variator-washer", "Шайба вариатора", "variator washer", U(80)),
    ("variator-nut", "Гайка вариатора", "variator nut", U(100)),
    ("cvt-cover", "Крышка вариатора", "CVT side cover", E3(2500, 2500, 1500)),
    ("cvt-cover-seal", "Уплотнитель крышки вариатора", "CVT cover seal", U(250)),
    ("cvt-filter", "Фильтр вариатора", "CVT air filter sponge", U(300)),
    ("cvt-cover-bearing", "Подшипник крышки вариатора", "CVT cover bearing", U(250)),
    ("cvt-duct", "Патрубок охлаждения вариатора", "CVT cooling air duct", U(500)),
    ("cvt-cover-bolts", "Болты крышки вариатора (комплект)", "CVT cover bolts", U(250)),
])
grp(z, "Сцепление и задний шкив", "CLUTCH", "clutch and rear pulley behind the CVT cover", [
    ("rear-pulley", "Задний шкив в сборе со сцеплением", "complete rear pulley with clutch", E3(3500, 3200, 2500)),
    ("clutch-shoes", "Колодки сцепления", "centrifugal clutch shoes", E3(1500, 1300, 1200)),
    ("clutch-bell", "Колокол сцепления", "clutch bell", E3(1300, 1200, 1000)),
    ("torque-spring", "Пружина сцепления (торк-драйвера)", "torque spring", U(400)),
    ("torque-driver", "Торк-драйвер (подвижная половина шкива)", "torque driver movable pulley half", E3(1800, 1700, 1300)),
    ("torque-pins", "Направляющие торк-драйвера с роликами", "torque driver guide pins with rollers", U(250)),
    ("torque-needle-bearing", "Подшипник игольчатый торк-драйвера", "needle bearing of the torque driver", U(300)),
    ("torque-seals", "Сальники торк-драйвера (комплект)", "torque driver seals", U(250)),
    ("clutch-springs", "Пружины колодок сцепления (3 шт)", "clutch shoe springs", U(200)),
    ("clutch-nut", "Гайка сцепления", "clutch nut", U(150)),
    ("bell-nut", "Гайка колокола", "clutch bell nut", U(100)),
])
grp(z, "Редуктор", "GEARBOX", "final drive gearbox at the rear wheel", [
    ("gear-set", "Шестерни редуктора (комплект)", "final drive gear set", E3(2500, 2500, 2200)),
    ("rear-axle", "Вал заднего колеса", "rear wheel axle shaft", M({YH: 1500, GY6: 1200})),
    ("drive-shaft", "Первичный вал редуктора", "gearbox input shaft", E3(1200, 1200, 1000)),
    ("gearbox-bearings", "Подшипники редуктора (комплект)", "gearbox bearings", U(800)),
    ("gearbox-seals", "Сальники редуктора (комплект)", "gearbox oil seals", U(250)),
    ("gearbox-gasket", "Прокладка редуктора", "gearbox cover gasket", U(150)),
    ("gearbox-cover", "Крышка редуктора", "gearbox cover", E3(2000, 2000, 1500)),
    ("gearbox-fill-bolt", "Болт заливной с шайбой", "gearbox oil fill bolt", U(150)),
    ("gearbox-bolts", "Болты крышки редуктора (комплект)", "gearbox cover bolts", U(200)),
])

# ======================================================== ТОПЛИВО И ВЫПУСК
z = zone("Топливо, впуск и выпуск", "FUEL", "fuel system")
grp(z, "Бак и подача топлива", "TANK", "fuel tank under the seat or floor", [
    ("fuel-tank", "Бензобак", "fuel tank", M5(3500, 3000, 3500, 3200, 2200)),
    ("fuel-cap", "Крышка бензобака", "fuel tank cap", U(450)),
    ("fuel-pump", "Бензонасос", "electric fuel pump", M({Y4T: 1950, H4T: 2800})),
    ("fuel-pump-seal", "Уплотнитель бензонасоса", "fuel pump seal ring", M({YH: 250})),
    ("fuel-filter", "Фильтр топливный", "inline fuel filter", U(100)),
    ("fuel-hose", "Шланг топливный (1 м)", "fuel hose", U(100)),
    ("hose-clamps", "Хомуты шлангов (10 шт)", "hose clamps", U(150)),
    ("fuel-valve", "Бензокран вакуумный", "vacuum fuel petcock", M({GY6: 350})),
    ("vacuum-hose", "Шланг вакуумный (1 м)", "vacuum hose", U(80)),
    ("fuel-line", "Топливопровод высокого давления", "high-pressure fuel line", M({Y4T: 900, H4T: 1000})),
])
grp(z, "Инжектор и карбюратор", "INJ", "throttle body or carburetor behind the engine", [
    ("injector", "Форсунка инжектора", "fuel injector", M({Y4T: 1600, H4T: 2200})),
    ("injector-seals", "Уплотнители форсунки (комплект)", "fuel injector seals", M({YH: 200})),
    ("throttle-body", "Дроссельный узел", "throttle body", M({Y4T: 4500, H4T: 5000})),
    ("idle-valve", "Регулятор холостого хода", "idle air control valve", M({YH: 1800})),
    ("carburetor", "Карбюратор PD24J", "PD24J carburetor", M({GY6: 1800})),
    ("carb-kit", "Ремкомплект карбюратора", "carburetor rebuild kit", M({GY6: 450})),
    ("carb-diaphragm", "Мембрана с плунжером карбюратора", "carburetor vacuum diaphragm with slide", M({GY6: 400})),
    ("carb-jets", "Жиклёры карбюратора (комплект)", "carburetor jets", M({GY6: 300})),
    ("carb-float", "Поплавок карбюратора с иглой", "carburetor float with needle", M({GY6: 250})),
    ("auto-choke", "Электроподсос (автоматический)", "electric auto choke", M({GY6: 450})),
])
grp(z, "Впуск", "INTAKE", "intake: air filter box on the left of the engine", [
    ("intake-manifold", "Впускной коллектор", "intake manifold", M({
        "Yamaha Gear 4T": 1100,
        "Yamaha Jog 4T, Vino 4T": 1050,
        H4T: 900,
        GY6: 450,
    })),
    ("intake-gasket", "Прокладка впускного коллектора", "intake manifold gasket", U(80)),
    ("airbox", "Воздушный фильтр в сборе (корпус)", "complete air filter box", M5(2200, 2000, 2200, 2000, 1200)),
    ("air-filter", "Элемент воздушного фильтра", "air filter element", M({
        "Yamaha Gear 4T": 600,
        "Yamaha Jog 4T, Vino 4T": 650,
        H4T: 550,
        GY6: 350,
    })),
    ("air-duct", "Патрубок воздушного фильтра", "air filter intake duct", E3(500, 500, 350)),
    ("airbox-screws", "Винты крышки воздушного фильтра (комплект)", "air filter cover screws", U(100)),
])
grp(z, "Выпуск", "EXHAUST", "exhaust muffler on the right side", [
    ("muffler", "Глушитель", "exhaust muffler", M5(4500, 4000, 4800, 4200, 3200)),
    ("exhaust-gasket", "Прокладка глушителя", "exhaust gasket ring", U(80)),
    ("exhaust-studs", "Шпильки глушителя (комплект)", "exhaust studs", U(150)),
    ("exhaust-nuts", "Гайки глушителя (комплект)", "exhaust nuts", U(100)),
    ("heat-shield", "Защитный экран глушителя", "muffler heat shield", U(900)),
    ("muffler-bolts", "Болты крепления глушителя (комплект)", "muffler mounting bolts", U(200)),
])

# ============================================================== ОХЛАЖДЕНИЕ
z = zone("Охлаждение", "COOL", "cooling")
grp(z, "Жидкостное (Yamaha 4T)", "LIQ", "liquid cooling: radiator next to the engine", [
    ("radiator", "Радиатор в сборе", "radiator", M({"Yamaha Jog 4T, Vino 4T": 3750, "Yamaha Gear 4T": 3900})),
    ("radiator-cover", "Кожух (защита) радиатора", "radiator cover guard", M({Y4T: 1100})),
    ("radiator-cap", "Крышка радиатора", "radiator cap", M({Y4T: 400})),
    ("coolant-tank", "Расширительный бачок", "coolant reservoir tank", M({Y4T: 700})),
    ("water-pump-kit", "Ремкомплект помпы", "water pump repair kit", M({Y4T: 1250})),
    ("water-pump-seal", "Сальник помпы", "water pump seal", M({Y4T: 300})),
    ("water-pump-impeller", "Крыльчатка помпы", "water pump impeller", M({Y4T: 600})),
    ("thermostat", "Термостат", "thermostat", M({Y4T: 900})),
    ("coolant-hoses", "Патрубки охлаждения (комплект)", "coolant hoses", M({Y4T: 800})),
    ("coolant-clamps", "Хомуты патрубков (комплект)", "coolant hose clamps", U(150)),
])
grp(z, "Воздушное (Honda 4T, GY6)", "AIR", "air cooling shroud around the cylinder", [
    ("cooling-fan", "Крыльчатка охлаждения на генераторе", "engine cooling fan on the flywheel", M({H4T: 400, GY6: 350})),
    ("cooling-shroud", "Кожух охлаждения цилиндра", "cylinder cooling shroud", M({H4T: 1200, GY6: 900})),
    ("cooling-shroud-lower", "Кожух охлаждения нижний", "lower cooling shroud", M({H4T: 800, GY6: 600})),
    ("shroud-screws", "Винты кожухов охлаждения (комплект)", "cooling shroud screws", U(100)),
])

# ================================================================= ТОРМОЗА
z = zone("Тормоза", "BRAKE", "brakes")
grp(z, "Барабанные", "DRUM", "drum brake inside the wheel hub", [
    ("drum-shoes", "Колодки барабанные", "drum brake shoes", M({
        "d150 — Yamaha Gear 4T": 630,
        "d130 — Yamaha Jog 4T, Vino 4T": 470,
        DIO: 400,
        AY01: 450,
        GY6: 450,
    })),
    ("shoe-springs", "Пружины тормозных колодок (пара)", "brake shoe springs", U(150)),
    ("brake-cam", "Кулачок тормоза с рычагом", "brake cam with lever arm", U(500)),
    ("brake-arm-spring", "Возвратная пружина рычага тормоза", "brake arm return spring", U(100)),
    ("brake-adjuster", "Гайка регулировки тормоза", "brake adjusting nut", U(60)),
    ("brake-panel", "Тормозной щит переднего колеса", "front brake panel", V5(1200)),
    ("brake-equalizer", "Уравнитель комбинированного тормоза", "combined brake equalizer", M({YH: 900})),
])
grp(z, "Дисковые", "DISC", "front disc brake", [
    ("disc-pads", "Колодки дисковые передние", "disc brake pads", M({
        "Yamaha Jog, Gear (с дисковым тормозом)": 450,
        "Honda Dio": 450,
        GY6: 450,
    })),
    ("brake-disc", "Тормозной диск передний", "front brake disc rotor", M({"Yamaha Jog, Gear (с дисковым тормозом)": 1800, GY6: 1500})),
    ("caliper", "Суппорт передний", "front brake caliper", U(1900)),
    ("caliper-piston", "Поршень суппорта", "brake caliper piston", U(400)),
    ("caliper-kit", "Ремкомплект суппорта", "caliper seal kit", U(400)),
    ("caliper-pins", "Направляющие суппорта с пыльниками", "caliper slide pins with boots", U(300)),
    ("master-cylinder", "Главный тормозной цилиндр", "brake master cylinder", U(1600)),
    ("master-cylinder-kit", "Ремкомплект главного цилиндра", "master cylinder rebuild kit", U(450)),
    ("reservoir-cap", "Крышка бачка тормозной жидкости с мембраной", "brake fluid reservoir cap with diaphragm", U(250)),
    ("brake-hose", "Тормозной шланг", "brake hose", U(700)),
    ("banjo-bolt", "Болт-банжо с медными шайбами", "banjo bolt with copper washers", U(200)),
    ("bleeder", "Штуцер прокачки", "brake bleeder screw", U(100)),
    ("disc-bolts", "Болты тормозного диска (комплект)", "brake disc bolts", U(200)),
])

# ================================================================= ХОДОВАЯ
z = zone("Ходовая", "CHAS", "chassis")
grp(z, "Передняя подвеска", "FORK", "front fork and steering", [
    ("front-fork", "Вилка передняя в сборе", "complete front fork", M5(6500, 5500, 6500, 6000, 4500)),
    ("fork-leg", "Амортизатор передний (перо, 1 шт)", "front fork leg", M5(1800, 1350, 1800, 1600, 1300)),
    ("fork-pair", "Амортизаторы передние (пара)", "pair of front shock absorbers", M({
        "Yamaha Jog (с дисковым тормозом)": 4410,
        "Honda Dio": 3060,
        TANK: 2500,
    })),
    ("fork-seals", "Сальники вилки (пара)", "fork oil seals", U(300)),
    ("fork-boots", "Пыльники вилки (пара)", "fork dust boots", U(300)),
    ("fork-bushings", "Втулки вилки (комплект)", "fork bushings", U(400)),
    ("steering-bearings", "Подшипники рулевой колонки (комплект)", "steering head bearings", U(650)),
    ("steering-nut", "Гайка рулевой колонки", "steering stem nut", U(250)),
    ("steering-stem", "Траверса (рулевая колонка)", "steering stem", V5(2500)),
])
grp(z, "Задняя подвеска", "SHOCK", "rear shock absorber and engine swing arm", [
    ("rear-shock", "Амортизатор задний", "rear shock absorber", M5(1300, 900, 1500, 1280, 1310)),
    ("rear-shock-adjustable", "Амортизатор задний регулируемый", "adjustable rear shock absorber", U(1540)),
    ("shock-bushings", "Втулки амортизатора (комплект)", "shock absorber bushings", U(200)),
    ("shock-bolts", "Болты крепления амортизатора (комплект)", "shock absorber bolts", U(250)),
    ("engine-hanger", "Кронштейн (маятник) двигателя", "engine hanger link bracket", U(1500)),
    ("hanger-bushings", "Сайлентблоки маятника (комплект)", "engine hanger bushings", U(600)),
    ("hanger-stopper", "Резиновый отбойник маятника", "rubber hanger stopper", U(200)),
])
grp(z, "Подножки", "STAND", "center and side stand under the scooter", [
    ("center-stand", "Подножка центральная", "center stand", M5(1600, 1400, 1600, 1500, 1200)),
    ("side-stand", "Подножка боковая", "side stand", U(800)),
    ("stand-springs", "Пружины подножки (комплект)", "stand springs", U(150)),
    ("stand-pivot", "Ось подножки с шайбами", "stand pivot bolt with washers", U(250)),
    ("stand-rubber", "Резиновый упор подножки", "rubber stand stopper", U(100)),
])
grp(z, "Колёса", "WHEEL", "front and rear wheels", [
    ("front-rim", "Диск колёсный передний", "front wheel rim", M5(3000, 2000, 2500, 2200, 2500)),
    ("rear-rim", "Диск колёсный задний", "rear wheel rim", M5(2800, 2000, 2500, 2200, 2600)),
    ("wheel-bearing", "Подшипник колеса 6201 / 6301 (1 шт)", "wheel bearing", U(180)),
    ("hub-seal", "Пыльник (сальник) ступицы", "wheel hub dust seal", U(150)),
    ("front-axle", "Ось переднего колеса с гайкой", "front wheel axle with nut", U(250)),
    ("axle-spacers", "Втулки распорные оси (комплект)", "axle spacers", U(200)),
    ("rear-wheel-nut", "Гайка заднего колеса", "rear wheel nut", U(100)),
    ("cotter-pin", "Шплинт гайки колеса", "cotter pin", U(20)),
    ("tire-valve", "Ниппель бескамерный", "tubeless tire valve", U(50)),
    ("valve-caps", "Колпачки ниппеля (пара)", "tire valve caps", U(50)),
])
grp(z, "Шины и камеры", "TIRE", "tires and tubes", [
    ("tire", "Шина", "scooter tire", M({
        "80/90-10 — Yamaha Jog, Vino": 1800,
        "90/90-10 — Honda Dio, Jog AY01, электро": 1900,
        "90/90-12 передняя — Yamaha Gear 4T": 2300,
        "100/90-10 задняя — Yamaha Gear 4T": 2200,
        "3.50-10 — Honda Dio, китайские 50": 1800,
        "120/70-12 — китайские 125–150": 2800,
        "130/70-12 — Tank T150": 3000,
        "130/60-13 — китайские 150": 3200,
    })),
    ("inner-tube", "Камера", "inner tube", M({
        "3.00-10 (80/90-10)": 450,
        "3.50-10 (90/90-10)": 500,
        "90/90-12": 550,
        "120/70-12, 130/70-12": 650,
    })),
    ("rim-tape", "Ободная лента", "rim tape", U(100)),
])

# ============================================================== РАСХОДНИКИ
z = zone("Расходники", "CONS", "consumables")
grp(z, "Масла и жидкости", "FLUID", "service fluids", [
    ("engine-oil-1l", "Масло моторное 4T 10W-40 (1 л)", "4T engine oil bottle 1 liter", U(700)),
    ("engine-oil-change", "Масло моторное 4T 10W-40 (0,8 л — одна замена)", "4T engine oil bottle 0.8 liter", U(600)),
    ("gear-oil", "Масло трансмиссионное 80W-90 (0,12 л — одна замена)", "gear oil small bottle", U(150)),
    ("coolant", "Антифриз (1 л)", "coolant bottle", U(350)),
    ("brake-fluid", "Тормозная жидкость DOT4 (0,5 л)", "DOT4 brake fluid bottle", U(350)),
    ("fork-oil", "Масло для вилки 10W (0,5 л)", "fork oil bottle", U(500)),
])
grp(z, "Химия и мелочи", "MISC", "workshop consumables", [
    ("grease", "Смазка для вариатора и подшипников", "grease tube", U(250)),
    ("copper-grease", "Смазка медная (графитовая)", "copper grease", U(300)),
    ("carb-cleaner", "Очиститель карбюратора и дросселя", "carburetor cleaner spray can", U(450)),
    ("gasket-maker", "Герметик-прокладка", "gasket maker sealant tube", U(350)),
    ("thread-locker", "Фиксатор резьбы", "thread locker bottle", U(300)),
    ("fasteners-kit", "Хомуты, шплинты, крепёж (комплект)", "assorted fasteners kit", U(100)),
    ("wiring-consumables", "Изолента, термоусадка, клеммы", "electrical tape and heat shrink", U(150)),
    ("tire-plug-kit", "Жгут для ремонта бескамерной шины", "tubeless tire plug strip", U(150)),
])

# ======================================================== ЭЛЕКТРОТРАНСПОРТ
z = zone("Электротранспорт", "EV", "electric scooter")
grp(z, "Аккумулятор и зарядка", "BAT", "battery pack under the seat of an electric scooter", [
    ("ev-battery", "Аккумулятор литиевый", "lithium battery pack", M({
        "60V 20Ah — " + EV: 25000,
        "60V 30Ah — " + EV: 34000,
        "72V 20Ah — " + EV: 30000,
        "48V 20Ah — " + EV: 20000,
    })),
    ("ev-bms", "Плата BMS аккумулятора", "battery management board", EVc(2500)),
    ("ev-charger", "Зарядное устройство", "battery charger", M({"60V — " + EV: 3000, "72V — " + EV: 3500})),
    ("ev-charge-port", "Разъём зарядки на корпусе", "charging port socket", EVc(500)),
    ("ev-battery-connector", "Разъём аккумулятора (Anderson, XT90)", "battery power connector", EVc(300)),
    ("ev-breaker", "Автомат (предохранитель) аккумулятора", "battery circuit breaker", EVc(450)),
    ("ev-battery-strap", "Крепление аккумулятора", "battery holding strap", EVc(300)),
])
grp(z, "Мотор и контроллер", "MOTOR", "hub motor in the rear wheel and controller", [
    ("ev-controller", "Контроллер", "motor controller", M({"60V 1000–1500 W — " + EV: 4500, "72V 2000 W — " + EV: 6000})),
    ("ev-hub-motor", "Мотор-колесо", "rear hub motor wheel", M({'1000–1500 W, 10" — ' + EV: 12000, '2000 W, 12" — ' + EV: 15000})),
    ("ev-hall-sensors", "Датчики Холла мотора (3 шт)", "motor hall sensors", EVc(400)),
    ("ev-phase-wires", "Фазные провода и кабель питания", "motor phase wires", EVc(600)),
    ("ev-motor-bearing", "Подшипник мотор-колеса", "hub motor bearing", EVc(300)),
])
grp(z, "Управление и приборы", "EVCTRL", "electric scooter controls", [
    ("ev-throttle", "Ручка газа", "electric throttle grip", EVc(800)),
    ("ev-brake-sensors", "Датчики тормоза (пара)", "brake cut-off sensors", EVc(500)),
    ("ev-dcdc", "Преобразователь DC-DC 60/72V → 12V", "DC-DC converter", EVc(1200)),
    ("ev-display", "Дисплей (спидометр)", "electric scooter display", EVc(2500)),
    ("ev-ignition", "Замок зажигания", "ignition lock", EVc(1200)),
    ("ev-alarm", "Сигнализация с брелоком", "alarm with remote", EVc(1800)),
    ("ev-mode-switch", "Кнопки режимов и реверса", "mode and reverse switch", EVc(600)),
])

# ================================================================== РАБОТЫ
WORKS = [
    ("Диагностика и ТО", [
        ("Диагностика общая", 700),
        ("Компьютерная диагностика (инжектор)", 1000),
        ("ТО: масло, фильтр, свеча, регулировки (50 см³)", 1500),
        ("ТО: масло, фильтр, свеча, регулировки (125–150 см³)", 2000),
        ("Замена масла в двигателе", 400),
        ("Замена масла в редукторе", 400),
        ("Замена свечи зажигания", 150),
        ("Замена или чистка воздушного фильтра", 250),
        ("Регулировка клапанов", 1200),
        ("Мойка скутера", 400),
    ]),
    ("Двигатель", [
        ("Замена ЦПГ (50 см³)", 3000),
        ("Замена ЦПГ (125–150 см³)", 3500),
        ("Замена поршневых колец", 2500),
        ("Ремонт ГБЦ с притиркой клапанов", 2500),
        ("Замена клапанов", 2800),
        ("Замена сальников клапанов", 1800),
        ("Замена распредвала", 1800),
        ("Замена цепи ГРМ", 2500),
        ("Замена натяжителя цепи ГРМ", 900),
        ("Замена коленвала", 4000),
        ("Замена подшипников коленвала", 4500),
        ("Замена сальников коленвала", 1600),
        ("Капремонт двигателя (50 см³)", 7000),
        ("Капремонт двигателя (125–150 см³)", 9000),
        ("Снятие и установка двигателя", 2000),
        ("Замена прокладки клапанной крышки", 700),
        ("Замена масляного насоса", 2000),
        ("Замена сайлентблоков подвески двигателя", 1500),
    ]),
    ("Вариатор и редуктор", [
        ("Замена ремня вариатора", 800),
        ("Замена роликов вариатора", 1000),
        ("Замена переднего вариатора в сборе", 1200),
        ("Замена сцепления (колодок)", 1300),
        ("Замена пружины или торк-драйвера", 1300),
        ("Чистка и смазка вариатора", 800),
        ("Ремонт редуктора (подшипники, шестерни)", 2500),
        ("Замена сальника вала заднего колеса", 1200),
    ]),
    ("Топливная система и выпуск", [
        ("Чистка и регулировка карбюратора", 1500),
        ("Ремонт карбюратора с ремкомплектом", 1800),
        ("Замена карбюратора", 800),
        ("Чистка форсунки инжектора", 1200),
        ("Чистка дроссельного узла", 800),
        ("Замена бензонасоса", 1200),
        ("Замена топливного фильтра и шлангов", 300),
        ("Чистка бензобака", 1500),
        ("Замена глушителя", 500),
        ("Замена впускного коллектора", 600),
    ]),
    ("Охлаждение", [
        ("Замена антифриза", 600),
        ("Ремонт помпы (ремкомплект)", 2000),
        ("Замена радиатора", 1200),
        ("Замена термостата", 900),
        ("Замена патрубков охлаждения", 600),
    ]),
    ("Тормоза", [
        ("Замена передних колодок", 500),
        ("Замена задних колодок", 700),
        ("Регулировка тормоза", 150),
        ("Прокачка тормозов с заменой жидкости", 700),
        ("Замена тормозного диска", 700),
        ("Замена суппорта или главного цилиндра", 800),
        ("Замена троса тормоза", 450),
    ]),
    ("Ходовая и колёса", [
        ("Замена покрышки или камеры (переднее колесо)", 600),
        ("Замена покрышки или камеры (заднее колесо)", 900),
        ("Ремонт прокола", 400),
        ("Правка колёсного диска", 700),
        ("Замена подшипников колеса", 600),
        ("Замена заднего амортизатора", 500),
        ("Замена передних амортизаторов", 1500),
        ("Замена сальников вилки", 1500),
        ("Замена подшипников рулевой колонки", 1800),
        ("Регулировка рулевой колонки", 600),
        ("Замена подножки", 500),
        ("Замена троса газа", 450),
        ("Замена троса спидометра", 400),
    ]),
    ("Электрика", [
        ("Диагностика электрики", 800),
        ("Замена аккумулятора", 150),
        ("Зарядка аккумулятора", 300),
        ("Замена лампы", 150),
        ("Замена фары или стоп-сигнала", 600),
        ("Замена поворотника", 300),
        ("Замена катушки или коммутатора", 500),
        ("Замена реле-регулятора", 500),
        ("Замена стартера", 600),
        ("Ремонт стартера", 800),
        ("Замена статора генератора", 1500),
        ("Замена замка зажигания", 700),
        ("Замена блока кнопок на руле", 500),
        ("Замена спидометра", 800),
        ("Ремонт проводки (час)", 1200),
        ("Установка сигнализации", 2000),
    ]),
    ("Кузов и пластик", [
        ("Снятие и установка пластика (частично)", 600),
        ("Снятие и установка пластика (полностью)", 1800),
        ("Замена детали пластика", 400),
        ("Ремонт пластика пайкой (1 место)", 800),
        ("Замена зеркал", 150),
        ("Замена или перетяжка сиденья", 1200),
        ("Установка багажника или кофра", 500),
        ("Наклейка комплекта наклеек", 800),
    ]),
    ("Электротранспорт", [
        ("Диагностика электроскутера", 800),
        ("Замена контроллера", 1500),
        ("Замена мотор-колеса", 1500),
        ("Замена покрышки мотор-колеса", 1500),
        ("Ремонт и балансировка аккумулятора", 2500),
        ("Замена датчиков Холла", 2000),
        ("Замена ручки газа", 500),
        ("Замена преобразователя DC-DC", 700),
    ]),
    ("Прочее", [
        ("Эвакуация по городу", 1500),
        ("Хранение (сутки)", 100),
        ("Срочный ремонт — надбавка", 1000),
        ("Час работы мастера", 1500),
    ]),
]


def q(s):
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


items = []  # для SQL и CSV
images = []  # одна картинка на деталь
seen_names = set()
seen_keys = set()
seen_codes = set()
gsort = 0
for z in CATALOG:
    for g in z["groups"]:
        gsort += 10
        gname = f"{z['ru']} · {g['ru']}"
        isort = 0
        for n, (key, ru, en, variants) in enumerate(g["parts"], start=1):
            assert key not in seen_keys, key
            seen_keys.add(key)
            images.append({
                "image_key": key,
                "zone": z["ru"],
                "group": g["ru"],
                "part_ru": ru,
                "part_en": en,
                "where_en": g["where"],
                "zone_en": z["en"],
                "applies_to": "; ".join(v for v, _ in variants),
                "variants": len(variants),
            })
            used_vc = set()
            for vi, (label, cost) in enumerate(variants):
                vc = VCODE.get(label) or f"V{vi + 1}"
                while vc in used_vc:
                    vc += "X"
                used_vc.add(vc)
                code = f"{z['code']}-{g['code']}-{n:02d}-{vc}"
                assert code not in seen_codes, code
                seen_codes.add(code)
                name = f"{ru} — {label}"
                assert name.lower() not in seen_names, name
                seen_names.add(name.lower())
                items.append({
                    "kind": "part", "group": gname, "gsort": gsort, "isort": isort,
                    "name": name, "price": client_price(cost), "cost": cost,
                    "code": code, "image_key": key,
                    "zone": z["ru"], "subgroup": g["ru"], "part": ru, "applies_to": label,
                })
                isort += 1
for gi, (gname, rows) in enumerate(WORKS):
    for ii, (name, price) in enumerate(rows):
        assert ("w", name.lower()) not in seen_names, name
        seen_names.add(("w", name.lower()))
        items.append({
            "kind": "service", "group": gname, "gsort": (gi + 1) * 10, "isort": ii,
            "name": name, "price": price, "cost": None, "code": f"WORK-{gi + 1:02d}-{ii + 1:02d}", "image_key": None,
        })

parts = [i for i in items if i["kind"] == "part"]
works = [i for i in items if i["kind"] == "service"]
n_groups = sum(len(z["groups"]) for z in CATALOG)

values = ",\n".join(
    f"      ({q(i['kind'])}, {q(i['group'])}, {i['gsort']}, {i['isort']}, {q(i['name'])}, {i['price']}, "
    f"{'NULL' if i['cost'] is None else i['cost']}, {q(i['code'])}, {q(i['image_key'])})"
    for i in items
)
sql = f"""-- Выпуск 2.0.2 (17.09): прейскурант сторонних ремонтов — запчасти ({len(parts)} позиций,
-- {len(images)} деталей, {n_groups} узлов) и работы ({len(works)}). Сгенерировано
-- scripts/seed/repair-price-catalog.py — правки делать там. Заливается ОДИН раз
-- (ключ repair_price_seed_v1): группы с тем же именем и видом дополняются,
-- позиции с тем же названием (без учёта регистра) в этом виде прайса не
-- дублируются. Дальше прайс ведёт директор в «Документах → Прейскурант».
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'repair_price_seed_v1') THEN
    CREATE TEMP TABLE "seed_price" (
      "kind" text, "grp" text, "gsort" integer, "isort" integer,
      "name" text, "price" integer, "cost" integer, "code" text, "image_key" text
    ) ON COMMIT DROP;
    INSERT INTO "seed_price" VALUES
{values};

    INSERT INTO "price_groups" ("name", "kind", "sort_order", "price_a_label")
    SELECT DISTINCT s."grp", s."kind", s."gsort", 'Цена'
    FROM "seed_price" s
    WHERE NOT EXISTS (
      SELECT 1 FROM "price_groups" g WHERE g."kind" = s."kind" AND g."name" = s."grp"
    );

    INSERT INTO "price_items" ("group_id", "name", "price_a", "cost", "code", "image_key", "sort_order")
    SELECT g."id", s."name", s."price", s."cost", s."code", s."image_key", 100 + s."isort"
    FROM "seed_price" s
    JOIN LATERAL (
      SELECT "id" FROM "price_groups" g
      WHERE g."kind" = s."kind" AND g."name" = s."grp"
      ORDER BY g."id" LIMIT 1
    ) g ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM "price_items" i
      JOIN "price_groups" pg ON pg."id" = i."group_id"
      WHERE pg."kind" = s."kind" AND lower(trim(i."name")) = lower(s."name")
    );

    INSERT INTO "app_settings" ("key", "value") VALUES ('repair_price_seed_v1', 'done');
  END IF;
END $$;
"""
SQL_OUT.write_text(sql, encoding="utf-8")

DOC_DIR.mkdir(parents=True, exist_ok=True)
with open(DOC_DIR / "catalog.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["code", "image_key", "zone", "group", "part", "applies_to", "name_in_crm", "cost_rub", "price_rub"])
    for i in parts:
        w.writerow([i["code"], i["image_key"], i["zone"], i["subgroup"], i["part"], i["applies_to"], i["name"], i["cost"], i["price"]])
with open(DOC_DIR / "images.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["image_key", "zone", "group", "part_ru", "part_en", "location_en", "applies_to", "price_from_rub", "price_to_rub"])
    for im in images:
        ps = [i["price"] for i in parts if i["image_key"] == im["image_key"]]
        w.writerow([im["image_key"], im["zone"], im["group"], im["part_ru"], im["part_en"], im["where_en"], im["applies_to"], min(ps), max(ps)])
with open(DOC_DIR / "works.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow(["code", "group", "work", "price_rub"])
    for i in works:
        w.writerow([i["code"], i["group"], i["name"], i["price"]])

print(f"запчастей {len(parts)} ({len(images)} деталей, {n_groups} узлов в {len(CATALOG)} зонах), работ {len(works)}")
