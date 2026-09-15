import { MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { whatsappLink, telegramLink, phoneDigits } from "@/lib/messengers";
import { toast } from "@/lib/toast";
import { openMaxChatViaHelper } from "@/lib/maxHelper";

/**
 * Пункт 3 — виджет мессенджеров у телефона клиента: WhatsApp · Telegram · MAX.
 * Один компонент для карточки аренды, заявки и карточки клиента
 * (десктоп + мобила).
 *
 * WhatsApp/Telegram — прямой чат по номеру (без сохранения контакта).
 *
 * MAX. Ссылки на чат по номеру у мессенджера нет: адрес вида
 * web.max.ru/202811141 при прямом открытии сбрасывается на список чатов
 * (проверено 01.09). Со страницы CRM «нажать» что-то внутри MAX нельзя —
 * браузер не даёт одному сайту трогать содержимое другого.
 *
 * Поэтому кнопка делает два дела сразу: копирует номер (это работает
 * всегда) и открывает web.max.ru/#hulk-max=<номер>. Если у оператора
 * установлен наш скрипт для MAX (public/max-autofind.user.js), он видит
 * номер в адресе и сам проделывает ручные шаги — вставляет в поиск,
 * жмёт «Найти по номеру», открывает чат. Не установлен — MAX просто
 * игнорирует хвост адреса, и всё работает как раньше.
 *
 * ОДНА ВКЛАДКА НА МЕССЕНДЖЕР (правка заказчика 24.08): каждый мессенджер
 * открывается в именованном окне (WA_TAB/TG_TAB/MAX_TAB). Второй и все
 * следующие клики из CRM переиспользуют ту же вкладку — новые не плодятся,
 * чат просто меняется в уже открытой. Браузер не позволяет «захватить»
 * вкладку, которую оператор открыл руками сам (это защита от подмены
 * страниц), поэтому первый клик из CRM создаёт свою вкладку — дальше она
 * и работает как постоянная.
 */

/** Имена окон: одна постоянная вкладка на каждый мессенджер. */
const TAB = {
  whatsapp: "hulk_whatsapp",
  telegram: "hulk_telegram",
  max: "hulk_max",
} as const;

/**
 * Открыть мессенджер в его постоянной вкладке. Если вкладка была закрыта —
 * браузер откроет новую с тем же именем; фокус переводим на неё.
 *
 * ВАЖНО (баг найден 01.09). Здесь стоял флаг "noopener" — с ним браузер
 * ИГНОРИРУЕТ имя вкладки, поэтому каждый клик открывал новую. Проверено
 * вживую: два клика с noopener → две вкладки, без него → одна и та же.
 * Обещание «одна вкладка на мессенджер» не работало ни для WhatsApp, ни
 * для Telegram, ни для MAX.
 *
 * Обнулять opener после открытия тоже нельзя, хотя и хотелось: связь
 * «мы открыли эту вкладку» — ровно то, что позволяет найти её по имени.
 * Тоже проверено: с opener=null снова две вкладки, без него — одна.
 * Поэтому opener оставляем. Риск здесь теоретический: адреса жёстко
 * заданы в коде и ведут на три известных мессенджера, а не на что попало.
 */
export function openMessengerTab(url: string, tab: keyof typeof TAB) {
  const win = window.open(url, TAB[tab]);
  win?.focus?.();
}
/** Страница разовой настройки помощника. */
export const MAX_SETUP_URL = "/max-setup.html";

/** Подсказку про настройку показываем один раз, дальше не мешаем. */
const MAX_HINT_KEY = "hulk-max-hint-shown";

function hintAlreadyShown(): boolean {
  try {
    return localStorage.getItem(MAX_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

function rememberHint() {
  try {
    localStorage.setItem(MAX_HINT_KEY, "1");
  } catch {
    /* приватный режим — покажем в другой раз */
  }
}

/**
 * MAX: открыть чат с клиентом по номеру.
 *
 * Если установлен наш помощник (дополнение к браузеру) — он находит УЖЕ
 * открытую вкладку MAX (даже ту, что оператор открыл сам), переключается
 * на неё и открывает чат. Это единственный способ: сама страница CRM до
 * чужой вкладки дотянуться не может — так устроена защита браузера.
 *
 * Без помощника работает прежний путь: открываем MAX в своей постоянной
 * вкладке и кладём номер в буфер — вставить в поиск руками.
 */
export async function openMaxChat(phone: string) {
  const viaHelper = openMaxChatViaHelper(phone);
  if (viaHelper) {
    const t = toast.info("Открываю чат в MAX…", phone);
    const res = await viaHelper;
    toast.dismiss(t);
    if (res.ok) return;
    // Помощник есть, но не справился (MAX не загрузился / не нашёл номер).
    toast.error(
      "MAX не открыл чат",
      res.error === "no_hint"
        ? "Номер не найден в MAX — проверьте его вручную."
        : "Попробуйте ещё раз: вкладка MAX могла не успеть загрузиться.",
    );
    return;
  }

  let copied = false;
  try {
    await navigator.clipboard.writeText(phone);
    copied = true;
  } catch {
    /* буфер недоступен — номер всё равно виден в карточке */
  }

  openMessengerTab(
    `https://web.max.ru/#hulk-max=${encodeURIComponent(phone)}`,
    "max",
  );

  if (!hintAlreadyShown()) {
    toast.action({
      kind: "info",
      title: "MAX открыт",
      message:
        "Чтобы чат клиента открывался сам, нужна разовая настройка — 2 минуты.",
      actionLabel: "Как настроить",
      ttl: 12000,
      onAction: () => {
        window.open(MAX_SETUP_URL, "_blank", "noopener");
        rememberHint();
      },
      onExpire: rememberHint,
    });
    return;
  }

  toast.success(
    "MAX открыт",
    copied
      ? "Найдите клиента по номеру — он скопирован в буфер."
      : "Найдите клиента по номеру в открытой вкладке MAX.",
  );
}

/** Иконка MAX (у lucide нет лого — буква M в кружке). */
export function MaxIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 15.5v-7l4 4.5 4-4.5v7" />
    </svg>
  );
}

export function MessengerButtons({
  phone,
  size = "md",
  className,
}: {
  phone: string | null | undefined;
  /** md — карточки (24px кнопки), lg — мобильные экраны (32px). */
  size?: "md" | "lg";
  className?: string;
}) {
  if (!phone || !phoneDigits(phone)) return null;
  const btn = cn(
    "flex items-center justify-center rounded-full transition-colors",
    size === "lg" ? "h-8 w-8" : "h-6 w-6",
  );
  const icon = size === "lg" ? 15 : 13;


  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <button
        type="button"
        onClick={() => openMessengerTab(whatsappLink(phone), "whatsapp")}
        title="Написать в WhatsApp (в той же вкладке мессенджера)"
        className={cn(btn, "text-green hover:bg-green/10")}
      >
        <MessageCircle size={icon} />
      </button>
      <button
        type="button"
        onClick={() => openMessengerTab(telegramLink(phone), "telegram")}
        title="Написать в Telegram (в той же вкладке мессенджера)"
        className={cn(btn, "text-sky-600 hover:bg-sky-50")}
      >
        <Send size={icon} />
      </button>
      <button
        type="button"
        onClick={() => openMaxChat(phone)}
        title="MAX: открыть чат с клиентом по номеру"
        className={cn(btn, "text-indigo-600 hover:bg-indigo-50")}
      >
        <MaxIcon size={icon} />
      </button>
    </span>
  );
}
