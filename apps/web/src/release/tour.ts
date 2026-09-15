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
 * Как собрать следующий релиз: новая версия, карточки из пунктов «Развития»,
 * якоря подсказок — `data-tour` на кнопке или текст кнопки.
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
  /** Пункт и право, без которого пункт не показываем. */
  points: Array<string | { text: string; perm: PermissionKey }>;
  audience: TourAudience;
  devices: TourDevice[];
  img: Partial<Record<TourDevice, string>>;
  before?: Partial<Record<TourDevice, string>>;
  imgPos?: Partial<Record<TourDevice, string>>;
  /** «Где найти» — первая подсказка по кнопке «Показать где» у нового раздела. */
  path?: Partial<Record<TourDevice, { anchor: TourAnchor; text: string }>>;
  hints?: Partial<Record<TourDevice, TourHint[]>>;
};

export type ReleaseTourConfig = {
  version: string;
  label: string;
  major: boolean;
  /** День выкладки: от него считаются 7 дней метки «новое». */
  date: string;
  subtitle: string;
  items: TourItem[];
};

const R = "/release/2.0";

export const RELEASE_TOUR: ReleaseTourConfig = {
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
      img: { desktop: `${R}/d-login.jpg`, phone: `${R}/m-login.jpg` },
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
      img: { desktop: `${R}/d-staff.jpg`, phone: `${R}/m-staff.jpg` },
      imgPos: { desktop: "left top", phone: "center top" },
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
      img: { desktop: `${R}/d-sales.jpg`, phone: `${R}/m-sales.jpg` },
      imgPos: { desktop: "left top", phone: "center top" },
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
      img: { desktop: `${R}/d-buyout.jpg`, phone: `${R}/m-buyout.jpg` },
      imgPos: { desktop: "left top", phone: "center top" },
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
      before: { desktop: `${R}/d-service-was.jpg` },
      img: { desktop: `${R}/d-service-ba.jpg`, phone: `${R}/m-service.jpg` },
      imgPos: { desktop: "left top", phone: "center top" },
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
      img: { desktop: `${R}/d-analytics.jpg`, phone: `${R}/m-analytics.jpg` },
      imgPos: { desktop: "left top", phone: "center top" },
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
      img: { desktop: `${R}/d-search.jpg` },
      imgPos: { desktop: "left top" },
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

/** Сколько дней держится метка «новое» у раздела. */
export const NEW_LABEL_DAYS = 7;

/** Разделы с меткой «новое»: новые разделы релиза. */
export function newSectionRoutes(cfg: ReleaseTourConfig = RELEASE_TOUR): RouteId[] {
  return cfg.items
    .filter((i) => i.kind === "new" && i.route && i.audience === "all")
    .map((i) => i.route as RouteId);
}
