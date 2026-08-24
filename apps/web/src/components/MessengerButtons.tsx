import { MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { whatsappLink, telegramLink, phoneDigits } from "@/lib/messengers";
import { toast } from "@/lib/toast";

/**
 * Пункт 3 — виджет мессенджеров у телефона клиента: WhatsApp · Telegram · MAX.
 * Один компонент для карточки аренды, заявки и карточки клиента
 * (десктоп + мобила).
 *
 * WhatsApp/Telegram — прямой чат по номеру (без сохранения контакта).
 * MAX — прямой ссылки на чат по номеру НЕ существует (ограничение самого
 * мессенджера), поэтому кнопка копирует номер и открывает web.max.ru:
 * оператор вставляет номер в поиск — два клика вместо нуля, честно и работает.
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
 */
export function openMessengerTab(url: string, tab: keyof typeof TAB) {
  const win = window.open(url, TAB[tab], "noopener");
  win?.focus?.();
}
/** MAX: копирует номер и открывает веб-версию (прямых чат-ссылок у MAX нет).
 *  Экспорт — для крупных кнопок мобильной карточки клиента. */
export async function openMaxChat(phone: string) {
  try {
    await navigator.clipboard.writeText(phone);
    toast.success(
      "Номер скопирован для MAX",
      "Вставьте его в поиск — прямых ссылок на чат у MAX нет.",
    );
  } catch {
    toast.info("MAX", "Скопируйте номер клиента и вставьте в поиск MAX.");
  }
  openMessengerTab("https://web.max.ru/", "max");
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
        title="MAX: скопировать номер и открыть поиск"
        className={cn(btn, "text-indigo-600 hover:bg-indigo-50")}
      >
        <MaxIcon size={icon} />
      </button>
    </span>
  );
}
