import type { RouteId } from "@/app/route";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Показ обновления сотрудникам (15.09) — согласованный концепт «Первый вход
 * после релиза» (v5), встроенный в CRM.
 *
 * Слои:
 *   1. Титул большой версии (2.0, 3.0): логотип переворачивается, «Смотреть,
 *      что нового» проваливает в карточки. Версия x.1 — сразу карточки.
 *   2. «Что изменилось» — до шести карточек по правам и устройству. «Позже»
 *      возвращает показ при следующем входе, но не больше трёх раз.
 *   3. Подсказка на месте — при первом заходе в раздел, «Понятно» — больше не
 *      покажется этому человеку.
 *   4. Метка «новое» в меню — пока человек не зашёл в раздел или 7 дней.
 *
 * Прогресс хранится на сервере (release_views). Новому сотруднику (директор
 * ответил «Новый сотрудник») прошлые обновления не показываем — сравнивать ему
 * не с чем; подсказки на месте и метки работают.
 *
 * Как собрать следующий релиз (правило заказчика с 16.09 — для КАЖДОГО
 * выпуска): новая запись в RELEASE_TOURS, карточка на каждое нововведение —
 * «было / стало» (кадры одного размера, «было» снимать до правок), коротко что
 * изменилось и `why` — зачем. Карточка должна быть понятна без пояснений.
 * Якоря подсказок — `data-tour` на кнопке или текст кнопки.
 *
 * Несколько выпусков подряд показываются по очереди, от старого к новому;
 * «Позже» откладывает все.
 */

export type TourDevice = "desktop" | "phone";

/**
 * Якорь подсказки: `data-tour` (первый найденный из списка — у пункта меню,
 * спрятанного за «Ещё», запасной якорь «Ещё»), текст кнопки или начало
 * placeholder поля.
 */
export type TourAnchor = { tour?: string[]; text?: string; placeholder?: string };

export type TourHint = { anchor: TourAnchor; title: string; text: string };

/** Кому карточка: всем, только сотрудникам или только управляющим людьми. */
export type TourAudience = "all" | "staff" | "managers";

export type TourItem = {
  id: string;
  kind: "new" | "changed";
  title: string;
  /** Раздел CRM, к которому относится карточка (подсказки, метка «новое»). */
  route: RouteId | null;
  headline: string;
  /** Зачем сделали — причина словами заказчика/сотрудника (с 2.0.1). */
  why?: string;
  /**
   * Пункт; с `perm` — только при этом праве, с `managers` — только директору
   * (закуп и прибыль при добавлении техники видит только он).
   */
  points: Array<string | { text: string; perm?: PermissionKey; managers?: boolean }>;
  audience: TourAudience;
  devices: TourDevice[];
  img: Partial<Record<TourDevice, string>>;
  before?: Partial<Record<TourDevice, string>>;
  imgPos?: Partial<Record<TourDevice, string>>;
  /**
   * «Крупно» (16.09): полные скриншоты того же места — во весь экран, чтобы
   * рассмотреть весь блок. Без них — те же кадры, что в слайде.
   */
  zoom?: Partial<Record<TourDevice, { before?: string; after: string }>>;
  /** «Где найти» — первая подсказка по кнопке «Показать где» у нового раздела. */
  path?: Partial<Record<TourDevice, { anchor: TourAnchor; text: string }>>;
  hints?: Partial<Record<TourDevice, TourHint[]>>;
  /**
   * Слайд добавлен в уже вышедший показ (17.09, «Прайс запчастей» в 2.0.2).
   * Кто досмотрел выпуск раньше этого момента, при следующем входе увидит
   * только такие слайды — «Дополнение к 2.0.2», без повтора остальных.
   * Время с поясом: «2026-09-17T14:30:00+03:00».
   */
  addedAt?: string;
};

export type ReleaseTourConfig = {
  version: string;
  label: string;
  major: boolean;
  /** День выкладки: от него считаются 7 дней метки «новое». */
  date: string;
  /**
   * Сколько карточек показать (по умолчанию 6). 2.0.2: восемь правок
   * заказчика, каждая — своим слайдом, чтобы показ был самодостаточным.
   */
  maxCards?: number;
  subtitle: string;
  items: TourItem[];
};

const R = "/release/2.0";

const RELEASE_2_0: ReleaseTourConfig = {
  version: "2.0.0",
  label: "2.0",
  major: true,
  date: "2026-09-15",
  subtitle: "Большое обновление: продажи, выкуп, сторонние ремонты, аналитика и личные аккаунты.",
  items: [
    {
      id: "own-login",
      kind: "new",
      title: "Свой логин",
      route: null,
      headline: "Теперь каждый входит в CRM под своим именем.",
      points: [
        "На экране входа — плитка с вашим именем и должностью",
        "Пароль задаёт директор: за новым — к нему",
        "Всё, что вы делаете в CRM, записывается в журнал на вас",
      ],
      audience: "staff",
      devices: ["desktop", "phone"],
      img: { desktop: `${R}/d-login-sq.jpg`, phone: `${R}/m-login.jpg` },
      zoom: { desktop: { after: `${R}/d-login.jpg` } },
      imgPos: { desktop: "center center", phone: "center 40%" },
    },
    {
      id: "staff-rights",
      kind: "new",
      title: "Сотрудники и права",
      route: "staff",
      headline: "У каждого сотрудника свой аккаунт, пароль и права задаёте вы.",
      points: [
        "Должность словами, пароль генерируется и показывается один раз",
        "Прибыль, прибыль ремонтов и доли партнёров — переключателями",
        "Живой предпросмотр: как экран увидит сотрудник",
      ],
      audience: "managers",
      devices: ["desktop", "phone"],
      img: { desktop: `${R}/d-staff-sq.jpg`, phone: `${R}/m-staff.jpg` },
      zoom: { desktop: { after: `${R}/d-staff.jpg` } },
      imgPos: { desktop: "center center", phone: "center top" },
      path: {
        desktop: { anchor: { tour: ["nav-staff", "nav-more"] }, text: "Раздел «Сотрудники» — в меню слева." },
        phone: { anchor: { tour: ["tab-more"] }, text: "На телефоне — в меню «Ещё»." },
      },
      hints: {
        desktop: [{ anchor: { text: "Добавить сотрудника" }, title: "Новый аккаунт", text: "Имя, должность, пароль и права. Пароль CRM покажет один раз — передайте его лично." }],
        phone: [{ anchor: { text: "Новый сотрудник" }, title: "Новый аккаунт", text: "Заводится и с телефона: имя, должность, пароль и права." }],
      },
    },
    {
      id: "sales",
      kind: "new",
      title: "Продажи",
      route: "sales",
      headline: "Продажа скутера — от витрины до подписанного договора.",
      points: [
        "Витрина техники в продаже с ценой из карточки",
        "Мастер сделки: клиент, техника, цена, договор, подпись",
        { text: "Процент менеджера фиксируется при подписании", perm: "data.profit" },
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      img: { desktop: `${R}/d-sales-sq.jpg`, phone: `${R}/m-sales.jpg` },
      zoom: { desktop: { after: `${R}/d-sales.jpg` } },
      imgPos: { desktop: "center center", phone: "center top" },
      path: {
        desktop: { anchor: { tour: ["nav-sales", "nav-more"] }, text: "Новый раздел — в меню слева, иконка кошелька." },
        phone: { anchor: { tour: ["tab-more"] }, text: "На телефоне раздел живёт в меню «Ещё»." },
      },
      hints: {
        desktop: [{ anchor: { text: "В продаже" }, title: "Витрина", text: "Техника, которая сейчас продаётся. Продать — кнопкой «Новая сделка» в шапке." }],
        phone: [{ anchor: { tour: ["fab"] }, title: "Новая продажа", text: "Продажу заводят прямо из раздела — откроется тот же мастер, что и на компьютере." }],
      },
    },
    {
      id: "buyout",
      kind: "new",
      title: "Выкуп",
      route: "rassrochki",
      headline: "Аренда с выкупом: график платежей и контроль просрочек.",
      points: [
        "График и факт платежей раздельно — просрочка видна сразу",
        "Платёж гасит ближайшие строки графика",
        "Досрочное погашение и рейтинг клиентов",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      img: { desktop: `${R}/d-buyout-sq.jpg`, phone: `${R}/m-buyout.jpg` },
      zoom: { desktop: { after: `${R}/d-buyout.jpg` } },
      imgPos: { desktop: "center center", phone: "center top" },
      path: {
        desktop: { anchor: { tour: ["nav-rassrochki", "nav-more"] }, text: "Раздел — в меню слева, иконка чека." },
        phone: { anchor: { tour: ["tab-more"] }, text: "На телефоне — в меню «Ещё»." },
      },
      hints: {
        desktop: [{ anchor: { text: "Просрочки" }, title: "Просрочки", text: "Кто не внёс платёж по графику — отдельной вкладкой, с суммой и днями." }],
        phone: [{ anchor: { tour: ["fab"] }, title: "Новый выкуп", text: "Оформить выкуп можно прямо отсюда — те же шаги, что на компьютере." }],
      },
    },
    {
      id: "service",
      kind: "changed",
      title: "Ремонты",
      route: "service",
      headline: "Главная вкладка теперь — сторонний ремонт: заказ-наряд и прайс работ.",
      points: [
        "Чужую технику принимают в ремонт за минуту",
        { text: "Работы — из прайса, запчасти — с закупом, прибыль считается сама", perm: "data.repairProfit" },
        "Оплата подтверждается отдельно, можно смешанную",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      // «Было» и «стало» — одного размера окна (1600×950), иначе половинки
      // сравнения не совпадают.
      before: { desktop: `${R}/d-service-was-sq.jpg` },
      img: { desktop: `${R}/d-service-ba-sq.jpg`, phone: `${R}/m-service.jpg` },
      zoom: { desktop: { before: `${R}/d-service-was.jpg`, after: `${R}/d-service-ba.jpg` } },
      imgPos: { desktop: "center center", phone: "center top" },
      path: { phone: { anchor: { tour: ["tab-more"] }, text: "Раздел на прежнем месте — в «Ещё»." } },
      hints: {
        desktop: [
          { anchor: { text: "Сторонний ремонт" }, title: "Сторонний ремонт", text: "Чужая техника теперь здесь. Ремонты нашего парка — во второй вкладке, как раньше." },
          { anchor: { text: "Новый ремонт" }, title: "Новый ремонт", text: "Принять технику: марка, клиент, жалоба. Работы и запчасти добавляются в наряд." },
        ],
        phone: [{ anchor: { text: "Сторонний ремонт" }, title: "Сторонний ремонт", text: "Чужая техника теперь здесь, свой парк — во второй вкладке." }],
      },
    },
    {
      id: "analytics",
      kind: "new",
      title: "Аналитика",
      route: "analytics",
      headline: "Как идёт бизнес — на одном экране, с планом и советами.",
      points: [
        "Аренда, продажи, ремонты и выкуп: план и факт",
        "«Что делать»: кого обзвонить, чего не хватает до плана",
        "Период — хоть текущий расчётный, доска выводится на второй монитор",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      img: { desktop: `${R}/d-analytics-sq.jpg`, phone: `${R}/m-analytics.jpg` },
      zoom: { desktop: { after: `${R}/d-analytics.jpg` } },
      imgPos: { desktop: "center center", phone: "center top" },
      path: {
        desktop: { anchor: { tour: ["nav-analytics", "nav-more"] }, text: "Раздел — в меню слева." },
        phone: { anchor: { tour: ["tab-more"] }, text: "На телефоне — в меню «Ещё»." },
      },
      hints: {
        desktop: [
          { anchor: { text: "Расчётный период" }, title: "Расчётный период", text: "Цифры за текущий расчётный период. «Сделать по умолчанию» — и доска будет открываться с ним." },
          { anchor: { text: "Настройка стены" }, title: "Настройка стены", text: "Соберите доску для второго монитора: перетаскивайте плитки, задайте план." },
          { anchor: { text: "На второй монитор" }, title: "На второй монитор", text: "Откроет доску отдельным окном с выбранным периодом — перетащите на второй экран." },
        ],
        phone: [{ anchor: { text: "Настройка стены" }, title: "Настройка стены", text: "Порядок и размер плиток — кнопками, план — полем." }],
      },
    },
    {
      id: "search",
      kind: "changed",
      title: "Поиск",
      route: "dashboard",
      headline: "Строка в шапке находит всё: номер скутера, VIN, телефон, паспорт.",
      points: [
        "Номер скутера — как угодно: «7», «№7», «айма 01», «бывший 80»",
        "Под строкой видно, что именно совпало",
        "Ctrl+K ставит курсор в поиск из любого раздела",
      ],
      audience: "all",
      devices: ["desktop"],
      img: { desktop: `${R}/d-search-sq.jpg` },
      zoom: { desktop: { after: `${R}/d-search.jpg` } },
      imgPos: { desktop: "center center" },
      hints: {
        desktop: [{ anchor: { placeholder: "Поиск: клиент" }, title: "Поиск", text: "Вбейте номер скутера, VIN или телефон — CRM покажет, где совпало." }],
      },
    },
    {
      id: "deal",
      kind: "changed",
      title: "Новая сделка",
      route: "dashboard",
      headline: "С телефона оформляются продажа, выкуп и ремонт — не только аренда.",
      points: [
        "Все четыре типа сделки, как на компьютере",
        "«Ремонт» сразу открывает приём чужой техники",
        "Клиент подставится, если начали из его карточки",
      ],
      audience: "all",
      devices: ["phone"],
      // «Было» и «стало» — кадры одного кадрирования из «Развития» (п. 2.71),
      // иначе половинки сравнения не совпадают.
      before: { phone: "/progress/mb-was-deals.jpg" },
      img: { phone: "/progress/mb-now-deals.jpg" },
      imgPos: { phone: "center top" },
      hints: {
        phone: [{ anchor: { tour: ["fab"] }, title: "Сделка", text: "Продажа, выкуп и ремонт теперь заводятся и с телефона." }],
      },
    },
  ],
};

const R201 = "/release/2.0.1";
const R202 = "/release/2.0.2";
/** Полные скриншоты «Развития» — для «Крупно». */
const P = "/progress";

/**
 * 2.0.1 (правки заказчика 16.09): добавление техники — сначала категория,
 * партия таблицей; модели «сдаём / продаём».
 */
const RELEASE_2_0_1: ReleaseTourConfig = {
  version: "2.0.1",
  label: "2.0.1",
  major: false,
  date: "2026-09-16",
  subtitle: "Добавление техники: сначала категория, партия — таблицей, сводка по партиям.",
  items: [
    {
      id: "add-category",
      kind: "changed",
      title: "Новая техника: сначала — куда",
      route: "fleet",
      headline: "Первым шагом выбираете: в аренду, на продажу, в выкуп или пока не решили.",
      why:
        "Раньше была одна длинная форма: скутер на продажу получал арендный номер, а форма спрашивала тарифы, которые продаже не нужны.",
      points: [
        "На продажу — без арендного номера и тарифов, сразу цена продажи",
        "В аренду — номер из свободных, видно, сколько останется",
        "В «Продажи → В продаже» — кнопка «Добавить на продажу»",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R201}/d-add-was.jpg`, phone: `${R201}/m-add-was.jpg` },
      img: { desktop: `${R201}/d-add-now.jpg`, phone: `${R201}/m-add-now.jpg` },
      zoom: {
        desktop: { before: `${P}/addsc-was-3-sale-number.jpg`, after: `${P}/addsc-now-1-category.jpg` },
        phone: { before: `${P}/addsc-was-m1.jpg`, after: `${P}/addsc-now-m1-category.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
      hints: {
        desktop: [
          {
            anchor: { text: "Добавить скутер" },
            title: "Новая техника",
            text: "Сначала выберите, куда добавляете, — дальше окно спросит только нужное.",
          },
        ],
        phone: [
          {
            anchor: { tour: ["fab"] },
            title: "Новая техника",
            text: "Сначала — куда добавляете: в аренду, на продажу или в выкуп.",
          },
        ],
      },
    },
    {
      id: "add-batch",
      kind: "new",
      title: "Партия за один раз",
      route: "fleet",
      headline: "Модель, количество и номер партии — один раз, дальше таблица на все единицы.",
      why:
        "Пришла поставка из пяти Jog — раньше пять раз открывали форму и заново выбирали модель, дату и цену закупа.",
      points: [
        "Строка «Для всех»: год, цвет, цена — подставятся в каждую единицу",
        "Номера рам и двигателей вставляются столбцом из Excel",
        "Повтор рамы подсвечивается сразу, до сохранения",
        { text: "Директору на проверке — закуп партии и прибыль", managers: true },
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R201}/d-batch-was.jpg`, phone: `${R201}/m-batch-was.jpg` },
      img: { desktop: `${R201}/d-batch-now.jpg`, phone: `${R201}/m-batch-now.jpg` },
      zoom: {
        desktop: { before: `${P}/addsc-was-1-top.jpg`, after: `${P}/addsc-now-3-table.jpg` },
        phone: { before: `${P}/addsc-was-m1.jpg`, after: `${P}/addsc-now-m3-cards.jpg` },
      },
      // Телефон: в кадре — «Одинаковое для всех» и карточка единицы.
      imgPos: { desktop: "center center", phone: "center 58%" },
    },
    {
      id: "fewer-errors",
      kind: "changed",
      title: "Меньше ошибок при добавлении",
      route: "fleet",
      headline: "Ошиблись — «Отменить», рама не похожа на обычные — предупредим, цена — из прошлой.",
      why:
        "Ошибка в партии раньше означала архив для каждой единицы через ключ директора, а опечатка в раме уходила в договор.",
      points: [
        "«Отменить» 10 секунд после добавления — данные вернутся в черновик",
        "Рама — латиницей при любой раскладке; необычная для модели — предупреждение",
        "Цена подставляется из последней по модели — поправьте, если изменилась",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R201}/d-errors-was.jpg`, phone: `${R201}/m-errors-was.jpg` },
      img: { desktop: `${R201}/d-errors-now.jpg`, phone: `${R201}/m-errors-now.jpg` },
      zoom: {
        desktop: { before: `${P}/addsc2-was-table.jpg`, after: `${P}/vinfmt-now-table.jpg` },
        phone: { before: `${P}/errors-was-m.jpg`, after: `${P}/errors-now-m.jpg` },
      },
      // Телефон: в кадре — пометка о цене и предупреждение под рамой.
      imgPos: { desktop: "center center", phone: "center 39%" },
    },
    {
      id: "batches",
      kind: "new",
      title: "Партии",
      route: "fleet",
      headline: "Как отбилась поставка: сколько продано, сколько на витрине и на какую сумму.",
      why:
        "Номер партии записывали, но посмотреть, как разошлась поставка, было негде — только искать единицы по номеру.",
      points: [
        "«Скутеры → Партии», на телефоне — кнопка «Партии»",
        "Продано на — по сделкам, на витрине на — по ценам из карточек",
        { text: "Директору — закуп партии и прибыль по проданным", managers: true },
        "Нажмите на единицу — откроется её карточка",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R201}/d-batches-was.jpg`, phone: `${R201}/m-batches-was.jpg` },
      img: { desktop: `${R201}/d-batches-now.jpg`, phone: `${R201}/m-batches-now.jpg` },
      zoom: {
        desktop: { before: `${P}/batch-was-search.jpg`, after: `${P}/batch-now-d.jpg` },
        phone: { before: `${P}/batch-was-m.jpg`, after: `${P}/batch-now-m.jpg` },
      },
      // Телефон: в кадре — суммы партии.
      imgPos: { desktop: "center center", phone: "center 67%" },
      hints: {
        desktop: [
          {
            anchor: { text: "Партии" },
            title: "Партии",
            text: "Сводка по каждой поставке: продано, на витрине, суммы.",
          },
        ],
        phone: [
          {
            anchor: { tour: ["batches-m"] },
            title: "Партии",
            text: "Сводка по каждой поставке — здесь.",
          },
        ],
      },
    },
    {
      id: "model-purpose",
      kind: "changed",
      title: "Модели: сдаём или продаём",
      route: "fleet",
      headline: "У модели две отметки — «Сдаём в аренду» и «Продаём».",
      why:
        "Модель, заведённая под продажу, появлялась в аренде: на сайте, в анкете клиента и в калькуляторе — с тарифами, которых у неё нет.",
      points: [
        "Тарифы — только у моделей, которые сдаём",
        "Модель только для продажи не видна клиентам в аренде",
        "В «Модели» — фильтр «Сдаём / Продаём»",
      ],
      audience: "managers",
      devices: ["desktop"],
      before: { desktop: `${R201}/d-models-was.jpg` },
      img: { desktop: `${R201}/d-models-now.jpg` },
      zoom: {
        desktop: { before: `${P}/models-was-2-form.jpg`, after: `${P}/models-now-2-form.jpg` },
      },
      imgPos: { desktop: "center center" },
    },
  ],
};

const RELEASE_2_0_2: ReleaseTourConfig = {
  version: "2.0.2",
  label: "2.0.2",
  major: false,
  date: "2026-09-17",
  maxCards: 9,
  subtitle: "Ремонты: аванс, остаток, накладная и прайс запчастей; смешанная оплата аренды; загрузка парка без разборки.",
  items: [
    {
      id: "repair-form",
      kind: "changed",
      title: "Новый ремонт — сразу с работами",
      route: "service",
      headline: "Клиент, техника, работы, запчасти и аванс — в одном окне. Кнопка «Сохранить — в работе».",
      why:
        "Раньше окно приёма спрашивало только технику и клиента, работы добавлялись потом в карточке — было непонятно, сохранён ли ремонт, пока его не оплатили.",
      points: [
        "Работы — из прайса, можно выбрать несколько подряд",
        "Ремонт остаётся «в работе»: работы и запчасти меняются по ходу, до оплаты",
        "Черновик не пропадёт, если обновить страницу",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-repair-form-was.jpg`, phone: `${R202}/m-repair-form-was.jpg` },
      img: { desktop: `${R202}/d-repair-form-now.jpg`, phone: `${R202}/m-repair-form-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-sv-new-was.jpg`, after: `${P}/v202-sv-form-now.jpg` },
        phone: { before: `${P}/v202-sv-new-m-was.jpg`, after: `${P}/v202-sv-form-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center bottom" },
      hints: {
        desktop: [
          {
            anchor: { text: "Новый ремонт" },
            title: "Новый ремонт",
            text: "Работы, запчасти и аванс — сразу в окне приёма. Править можно до оплаты.",
          },
        ],
        phone: [
          {
            anchor: { text: "Новый ремонт" },
            title: "Новый ремонт",
            text: "Всё в одном окне — и кнопка «Сохранить — в работе».",
          },
        ],
      },
    },
    {
      id: "repair-advance",
      kind: "new",
      title: "Аванс и остаток",
      route: "service",
      headline: "Клиент платит часть — в ремонте видно аванс и сколько осталось.",
      why:
        "Клиенты часто вносят часть денег вперёд, а отметить это было негде: только «оплачено» целиком. Меньшая сумма при оплате молча становилась скидкой.",
      points: [
        "Кнопка «Аванс» в ремонте и переключатель «Клиент вносит аванс» при приёме",
        "Остаток считается сам: к оплате минус аванс",
        "Платят меньше остатка — окно прямо пишет «скидка»",
        "Ошиблись — «Отменить» в уведомлении",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-repair-advance-was.jpg`, phone: `${R202}/m-repair-advance-was.jpg` },
      img: { desktop: `${R202}/d-repair-advance-now.jpg`, phone: `${R202}/m-repair-advance-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-sv-pay-was.jpg`, after: `${P}/v202-sv-settle-now.jpg` },
        phone: { before: `${P}/v202-sv-card-m2-was.jpg`, after: `${P}/v202-sv-card-money-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center bottom" },
    },
    {
      id: "repair-revenue",
      kind: "changed",
      title: "Выручка ремонтов — по деньгам",
      route: "service",
      headline: "Сумма попадает в выручку, только когда деньги приняли. Аванс — в день аванса.",
      why:
        "Выручка блока считала и ремонты «в работе»: за сентябрь на превью показывала 20 950 ₽, хотя приняли 12 100 ₽.",
      points: [
        "«Ждём оплату» — остатки по ремонтам в работе",
        { text: "Прибыль — по ремонтам, оплаченным полностью", perm: "data.repairProfit" },
        "Так же считает «Аналитика»",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-repair-revenue-was.jpg`, phone: `${R202}/m-repair-revenue-was.jpg` },
      img: { desktop: `${R202}/d-repair-revenue-now.jpg`, phone: `${R202}/m-repair-revenue-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-sv-list-was.jpg`, after: `${P}/v202-sv-list-now.jpg` },
        phone: { before: `${P}/v202-sv-list-m-was.jpg`, after: `${P}/v202-sv-list-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center 25%" },
    },
    {
      id: "repair-invoice",
      kind: "new",
      title: "Накладная по ремонту",
      route: "service",
      headline: "Кнопка «Накладная» в ремонте: работы, запчасти, к оплате, аванс и остаток — на печать.",
      why: "Клиенту нечего было отдать на руки: что делали и сколько он должен.",
      points: [
        "Пока ремонт в работе — помечена как предварительная",
        "Закупочных цен в накладной нет",
        "Печать и Word — как у договора",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-repair-invoice-was.jpg`, phone: `${R202}/m-repair-invoice-was.jpg` },
      img: { desktop: `${R202}/d-repair-invoice-now.jpg`, phone: `${R202}/m-repair-invoice-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-sv-card-was.jpg`, after: `${P}/v202-sv-invoice-now.jpg` },
        phone: { before: `${P}/v202-sv-card-m-was.jpg`, after: `${P}/v202-sv-invoice-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "repair-client",
      kind: "changed",
      title: "Имя и телефон — правятся",
      route: "service",
      headline: "В ремонте кнопка «Изменить»: клиент, телефон, техника, с чем приехали.",
      why: "Ошиблись в телефоне при приёме — исправить было нельзя, только завести ремонт заново.",
      points: [
        "Телефон в ремонте — нажмите, чтобы позвонить",
        "Правка записывается в журнал: было → стало",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-repair-client-was.jpg`, phone: `${R202}/m-repair-client-was.jpg` },
      img: { desktop: `${R202}/d-repair-client-now.jpg`, phone: `${R202}/m-repair-client-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-sv-card-was.jpg`, after: `${P}/v202-sv-edit-now.jpg` },
        phone: { before: `${P}/v202-sv-card-m-was.jpg`, after: `${P}/v202-sv-edit-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "repair-reopen",
      kind: "changed",
      title: "Отменённый ремонт — снова в работу",
      route: "service",
      headline: "В отменённом ремонте кнопка «Вернуть в работу».",
      why: "Отменили по ошибке или клиент передумал — ремонт приходилось заводить заново.",
      points: [
        "Вернётся тот статус, что был до отмены",
        "Был аванс — спросим: деньги у нас или клиент их забрал",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-repair-reopen-was.jpg`, phone: `${R202}/m-repair-reopen-was.jpg` },
      img: { desktop: `${R202}/d-repair-reopen-now.jpg`, phone: `${R202}/m-repair-reopen-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-sv-cancelled-was.jpg`, after: `${P}/v202-sv-reopen-now.jpg` },
        phone: { before: `${P}/v202-sv-cancelled-m-was.jpg`, after: `${P}/v202-sv-reopen-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "rent-split",
      kind: "changed",
      title: "Новая аренда: разделить оплату",
      route: "rentals",
      headline: "Третья кнопка «Разделить»: часть наличными, часть переводом.",
      why: "Клиент платит за аренду частями разными способами — при открытии можно было выбрать только один.",
      points: [
        "Вводите наличную часть — перевод посчитается сам",
        "Пройдут два платежа — касса и переводы сходятся",
        "Откат создания убирает оба",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-rent-split-was.jpg`, phone: `${R202}/m-rent-split-was.jpg` },
      img: { desktop: `${R202}/d-rent-split-now.jpg`, phone: `${R202}/m-rent-split-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-rent-pay-was.jpg`, after: `${P}/v202-rent-pay-now.jpg` },
        phone: { before: `${P}/v202-rent-pay-m-was.jpg`, after: `${P}/v202-rent-pay-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center 45%" },
    },
    {
      id: "repair-parts",
      kind: "new",
      addedAt: "2026-09-17T14:30:00+03:00",
      title: "Прайс запчастей",
      route: "service",
      headline: "766 запчастей по узлам скутера — выбираются в ремонте, как работы. Своя деталь сама сохраняется в прайс.",
      why:
        "Запчасти вписывали вручную и каждый раз вспоминали цену и закуп. Теперь любая деталь — от клюва до сальника — находится за пару нажатий.",
      points: [
        "Зоны: кузов, двигатель, трансмиссия, тормоза… Модель подставляется из ремонта",
        "Поиск по словам: «ремень gear»; подсказки с ценой при вводе",
        "Новая деталь — в «Добавлено из ремонтов»; цены правятся в «Документах»",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-repair-parts-was.jpg`, phone: `${R202}/m-repair-parts-was.jpg` },
      img: { desktop: `${R202}/d-repair-parts-now.jpg`, phone: `${R202}/m-repair-parts-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-sv-card-was.jpg`, after: `${P}/v202-parts-picker-now.jpg` },
        phone: { before: `${P}/v202-sv-card-m2-was.jpg`, after: `${P}/v202-parts-picker-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "park-load",
      kind: "changed",
      title: "Загрузка парка — без разборки",
      route: "dashboard",
      headline: "Скутеры в разборке больше не входят в «из N в парке».",
      why: "Техника на запчасти в аренду не вернётся, а процент загрузки из-за неё был ниже настоящего.",
      points: [
        "Ремонт и ДТП по-прежнему считаются — они короткие",
        "Так же — на телефоне и в «Аналитике»",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R202}/d-park-load-was.jpg`, phone: `${R202}/m-park-load-was.jpg` },
      img: { desktop: `${R202}/d-park-load-now.jpg`, phone: `${R202}/m-park-load-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v202-load-was.jpg`, after: `${P}/v202-load-now.jpg` },
        phone: { before: `${P}/v202-load-m-was.jpg`, after: `${P}/v202-load-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center 30%" },
    },
  ],
};

const R203 = "/release/2.0.3";

const RELEASE_2_0_3: ReleaseTourConfig = {
  version: "2.0.3",
  label: "2.0.3",
  major: false,
  date: "2026-09-18",
  subtitle: "Правка партии целиком; меню короче — «Что нового» теперь в «Развитии».",
  items: [
    {
      id: "batch-edit",
      kind: "new",
      title: "Правка партии",
      route: "fleet",
      headline: "«Скутеры → Партии» → «Изменить»: номер, дата, закуп и статус — сразу у всей партии.",
      why: "Раньше партию меняли по одной единице, а статус — ещё и с ключом директора на каждую.",
      points: [
        "Статус раскладкой: выбрали корзину — нажимаете на единицы, на корзине счётчик",
        "Не хватает арендных номеров — «Добавить номера» прямо в окне",
        "Ключ директора — один раз на всё сохранение",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R203}/d-batch-edit-was.jpg`, phone: `${R203}/m-batch-edit-was.jpg` },
      img: { desktop: `${R203}/d-batch-edit-now.jpg`, phone: `${R203}/m-batch-edit-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v203-batch-units-was.jpg`, after: `${P}/v203-edit-spread-now.jpg` },
        phone: { before: `${P}/v203-batch-units-m-was.jpg`, after: `${P}/v203-edit-spread-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "menu-shorter",
      kind: "changed",
      title: "Меню короче",
      route: "progress",
      headline: "«Что нового» — вкладка «Что уже сделано» в «Развитии», «Хранилище» — вкладка «Настроек».",
      why: "В меню — то, чем пользуются каждый день; справочное — внутри разделов.",
      points: [
        "«Развитие»: «Текущие работы» и «Что уже сделано»",
        "«Выкуп» и «Аналитика» вернулись из «Ещё»",
        "Уведомление о новой версии — одна кнопка «Обновить»",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R203}/d-menu-was.jpg`, phone: `${R203}/m-menu-was.jpg` },
      img: { desktop: `${R203}/d-menu-now.jpg`, phone: `${R203}/m-menu-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v203-nav-was.jpg`, after: `${P}/v203-nav-now.jpg` },
        phone: { before: `${P}/v203-more-m-was.jpg`, after: `${P}/v203-more-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
  ],
};

const R204 = "/release/2.0.4";

const RELEASE_2_0_4: ReleaseTourConfig = {
  version: "2.0.4",
  label: "2.0.4",
  major: false,
  date: "2026-09-20",
  subtitle: "Механики ремонтов, своя нумерация электро, планы с премией и оплата без оглядки на долг.",
  // Правок много — показываем семь карточек вместо шести.
  maxCards: 7,
  items: [
    {
      id: "mechanic",
      kind: "new",
      title: "Механик в ремонте",
      route: "service",
      headline: "У механика свой процент с прибыли ремонта — в расчёте видно его долю и нашу прибыль.",
      why: "Долю мастера считали в голове, а «прибыль» блока показывала её как нашу.",
      points: [
        "«Механики» — справочник директора: имя и процент",
        "Механик выбирается в наряде, процент запоминается в ремонте",
        "На главном экране блока «Прибыль» — уже наша, за вычетом механиков",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R204}/d-mech-was.jpg`, phone: `${R204}/m-mech-was.jpg` },
      img: { desktop: `${R204}/d-mech-now.jpg`, phone: `${R204}/m-mech-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v204-repair-ready-was.jpg`, after: `${P}/v204-repair-mech-now.jpg` },
        phone: { before: `${P}/v204-repair-ready-m-was.jpg`, after: `${P}/v204-repair-mech-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "repairs-money",
      kind: "new",
      title: "Откуда выручка и прибыль",
      route: "service",
      headline: "Нажмите на «Выручку» или «Прибыль» — таблица по ремонтам с итогом.",
      why: "Плашки показывали только итог: чтобы понять, из чего он, приходилось открывать ремонты по одному.",
      points: [
        "Ремонт · выручка · общая прибыль · процент механика · наша прибыль",
        "Строка открывает сам ремонт",
        "Ремонт не оплачен целиком — так и написано",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R204}/d-money-was.jpg`, phone: `${R204}/m-money-was.jpg` },
      img: { desktop: `${R204}/d-money-now.jpg`, phone: `${R204}/m-money-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v204-repairs-was.jpg`, after: `${P}/v204-repairs-money-now.jpg` },
        phone: { before: `${P}/v204-repairs-m-was.jpg`, after: `${P}/v204-repairs-money-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "repair-lock",
      kind: "changed",
      title: "Готовый ремонт зафиксирован",
      route: "service",
      headline: "«Готов к выдаче» — правки закрыты; вернуть в работу может директор.",
      why: "Работы и цены правились уже после того, как клиенту назвали сумму.",
      points: [
        "Работы, запчасти и данные клиента не меняются",
        "Кнопка «В работу» — только у директора, с подтверждением",
        "Деньги принимаются как обычно: выдача и расчёт не блокируются",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R204}/d-lock-was.jpg`, phone: `${R204}/m-lock-was.jpg` },
      img: { desktop: `${R204}/d-lock-now.jpg`, phone: `${R204}/m-lock-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v204-repair-ready-was.jpg`, after: `${P}/v204-repair-ready-now.jpg` },
        phone: { before: `${P}/v204-repair-ready-m-was.jpg`, after: `${P}/v204-repair-ready-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "electro-numbers",
      kind: "changed",
      title: "Свои номера у электро",
      route: "fleet",
      headline: "У электро нумерация с №1 и зелёный кружок, у бензина — свой ряд и чёрный.",
      why: "Электровелосипед получал следующий номер общего ряда и на глаз не отличался от скутера.",
      points: [
        "Один и тот же номер может быть у бензина и у электро — ряды не пересекаются",
        "Прежний номер остаётся «бывшим» и находится поиском",
        "«Добавить номера» добавляет в нужный ряд",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R204}/d-numbers-was.jpg`, phone: `${R204}/m-numbers-was.jpg` },
      img: { desktop: `${R204}/d-numbers-now.jpg`, phone: `${R204}/m-numbers-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v204-partner-numbers-was.jpg`, after: `${P}/v204-partner-numbers-now.jpg` },
        phone: { before: `${P}/v204-dash-numbers-m-was.jpg`, after: `${P}/v204-dash-numbers-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "plan-bonus",
      kind: "changed",
      title: "План, факт и премия",
      route: "analytics",
      headline: "Вместо процента — «3/10», цвет по порогам, а рядом с планом задаётся премия.",
      why: "Процент не мотивирует: «3 из 10» понятнее, а премия видна прямо на экране-стене.",
      points: [
        "До 50% красный, от 50 жёлтый, от 90 зелёный",
        "«Выполнишь план — получишь 5 000 ₽» прямо в плитке",
        "Премия задаётся кнопкой-мишенью там же, где план",
      ],
      audience: "managers",
      devices: ["desktop"],
      before: { desktop: `${R204}/d-plan-was.jpg` },
      img: { desktop: `${R204}/d-plan-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v204-wall-setup-was.jpg`, after: `${P}/v204-plan-bonus-now.jpg` },
      },
      imgPos: { desktop: "center center" },
    },
    {
      id: "ignore-debt",
      kind: "new",
      title: "Оплата продления при долге",
      route: "rentals",
      headline: "Переключатель «Игнорировать долг»: к приёму — только продление.",
      why: "С клиентом договорились о долге, а окно всё равно требовало сначала закрыть ущерб.",
      points: [
        "Долг остаётся за клиентом, деньги идут в новые дни",
        "В платеже — пометка о договорённости",
        "Просрочку переключатель не прячет: для неё есть прощение",
      ],
      audience: "all",
      devices: ["desktop", "phone"],
      before: { desktop: `${R204}/d-debt-was.jpg`, phone: `${R204}/m-debt-was.jpg` },
      img: { desktop: `${R204}/d-debt-now.jpg`, phone: `${R204}/m-debt-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v204-pay-01-open-was.jpg`, after: `${P}/v204-pay-02-ignore-now.jpg` },
        phone: { before: `${P}/v204-pay-01-open-m-was.jpg`, after: `${P}/v204-pay-04-pay-m-now.jpg` },
      },
      imgPos: { desktop: "center center", phone: "center top" },
    },
    {
      id: "deal-edit",
      kind: "new",
      title: "Правка проданной сделки",
      route: "sales",
      headline: "У директора — «Исправить»: цена, закуп, менеджер и его процент.",
      why: "После подписания ошибку в закупе или менеджере можно было убрать только отменой сделки.",
      points: [
        "Прибыль и вознаграждение пересчитываются на глазах",
        "Подтверждение со списком изменений",
        "В журнале — «было → стало» по каждому полю",
      ],
      audience: "managers",
      devices: ["desktop"],
      before: { desktop: `${R204}/d-deal-was.jpg` },
      img: { desktop: `${R204}/d-deal-now.jpg` },
      zoom: {
        desktop: { before: `${P}/v204-sale-deal-was.jpg`, after: `${P}/v204-sale-edit-now.jpg` },
      },
      imgPos: { desktop: "center center" },
    },
    {
      id: "mobile-parity",
      kind: "changed",
      title: "Всё то же — с телефона",
      route: "service",
      headline: "Дело должника, ремонт, прейскурант, модели и архив — теперь и с телефона.",
      why: "Часть работы упиралась в компьютер: карточка ремонта на телефоне была только для чтения, дело должника и справочники — тоже.",
      points: [
        "Ремонт: отметки, заметка, фото с камеры, «Готов к аренде»",
        "Должники: дело с заметками, звонками, платежами",
        "Документы, прейскурант, модели, экипировка, архив",
      ],
      audience: "all",
      devices: ["phone"],
      before: { phone: `${R204}/m-parity-was.jpg` },
      img: { phone: `${R204}/m-parity-now.jpg` },
      zoom: {
        phone: { before: `${P}/v204-debtors-m-was.jpg`, after: `${P}/v204-debtor-case-m-now.jpg` },
      },
      imgPos: { phone: "center top" },
    },
    {
      id: "tablet-keyboard",
      kind: "changed",
      title: "Клавиатура планшета",
      route: null,
      headline: "На планшете сумму вводит родная клавиатура, а не мелкая телефонная.",
      why: "На iPad своя цифровая клавиатура выглядела телефонной, а родная не открывалась.",
      points: [
        "Крупное поле вверху экрана — клавиатура его не закрывает",
        "«Готово» подставляет сумму, как раньше",
        "На телефоне всё осталось как было",
      ],
      audience: "all",
      devices: ["phone"],
      before: { phone: `${R204}/m-pad-was.jpg` },
      img: { phone: `${R204}/m-pad-now.jpg` },
      zoom: {
        phone: { before: `${P}/v204-pad-port-was.jpg`, after: `${P}/v204-pad-port-now.jpg` },
      },
      imgPos: { phone: "center top" },
    },
  ],
};

/** Все выпуски с показом — от старого к новому. */
export const RELEASE_TOURS: ReleaseTourConfig[] = [
  RELEASE_2_0,
  RELEASE_2_0_1,
  RELEASE_2_0_2,
  RELEASE_2_0_3,
  RELEASE_2_0_4,
];

/** Последний выпуск — для «кто посмотрел» и меток. */
export const RELEASE_TOUR: ReleaseTourConfig = RELEASE_TOURS[RELEASE_TOURS.length - 1]!;

/** Сколько дней держится метка «новое» у раздела. */
export const NEW_LABEL_DAYS = 7;

/** Разделы с меткой «новое»: новые разделы релиза. */
export function newSectionRoutes(cfg: ReleaseTourConfig = RELEASE_TOUR): RouteId[] {
  // Метка «новое» — только у НОВЫХ разделов. Новая возможность внутри
  // старого раздела (партия в «Скутерах») метку разделу не ставит.
  return cfg.items
    .filter((i) => i.kind === "new" && i.route && i.audience === "all" && cfg.major)
    .map((i) => i.route as RouteId);
}
