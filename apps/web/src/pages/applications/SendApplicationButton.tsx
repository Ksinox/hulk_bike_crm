import { useState } from "react";
import { ArrowLeft, Check, Copy, Link2, MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { whatsappLink, telegramLink } from "@/lib/messengers";

// Hash-route (#/apply) — vite собирает бандл с base "./".
const PUBLIC_FORM_URL =
  (import.meta.env.VITE_PUBLIC_FORM_URL as string | undefined) ??
  (typeof window !== "undefined"
    ? `${window.location.origin}/#/apply`
    : "/#/apply");

const SHARE_INTRO =
  "Здравствуйте! Для оформления аренды скутера в Халк Байк заполните, пожалуйста, короткую анкету: ";

/** Адрес арендной анкеты — нужен и меню «Заявки». */
export const RENT_FORM_URL = PUBLIC_FORM_URL;
export const RENT_SHARE_INTRO = SHARE_INTRO;

/** Копирование с запасным путём для старых браузеров. */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

type Messenger = "wa" | "tg" | "max";

/**
 * «Отправить анкету» — кнопка в «Заявках» и в мастере продажи.
 *
 * WhatsApp и Telegram умеют открывать чат ПО НОМЕРУ без сохранения контакта —
 * там спрашиваем номер и открываем переписку с уже вписанным текстом.
 *
 * У МАКС такой ссылки нет (мессенджер её не даёт), поэтому для него — и для
 * любого другого канала — есть «Скопировать ссылку»: текст с адресом анкеты
 * ложится в буфер, останется вставить в нужный чат.
 */
export function SendApplicationButton({
  className,
  label,
  text,
  formUrl,
  openWith,
  hideTrigger,
  onClosed,
}: {
  className?: string;
  /** Подпись кнопки (по умолчанию «Отправить анкету»). */
  label?: string;
  /** Вступление сообщения; ссылка на анкету дописывается сама.
   *  В продаже оно про покупку, а не про аренду. */
  text?: string;
  /** Адрес анкеты, если он не стандартный (напр. анкета покупателя). */
  formUrl?: string;
  /** Открыть сразу на конкретном канале (из меню «Заявки»). */
  openWith?: Messenger | null;
  /** Управляемый режим: кнопку не рисуем, окно показывает родитель. */
  hideTrigger?: boolean;
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(!!hideTrigger);
  const [messenger, setMessenger] = useState<Messenger | null>(openWith ?? null);
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState<"link" | "text" | null>(null);

  const url = formUrl ?? PUBLIC_FORM_URL;
  const body = `${text ?? SHARE_INTRO}${url}`;

  const close = () => {
    setOpen(false);
    setMessenger(null);
    setPhone("");
    setCopied(null);
    onClosed?.();
  };

  const copy = async (what: "link" | "text") => {
    const value = what === "link" ? url : body;
    const ok = await copyToClipboard(value);
    if (!ok) {
      toast.error("Не удалось скопировать — выделите ссылку вручную");
      return;
    }
    setCopied(what);
    toast.success(what === "link" ? "Ссылка скопирована" : "Текст скопирован");
    window.setTimeout(() => setCopied(null), 2000);
  };

  const send = () => {
    if (!phone.trim() || !messenger || messenger === "max") return;
    const link =
      messenger === "wa" ? whatsappLink(phone, body) : telegramLink(phone, body);
    if (link) window.open(link, "_blank", "noopener");
    close();
  };

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700",
            className,
          )}
        >
          <Send size={15} /> {label ?? "Отправить анкету"}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="w-full max-w-sm animate-modal-in rounded-2xl bg-surface p-5 shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {messenger && (
                  <button
                    type="button"
                    onClick={() => setMessenger(null)}
                    aria-label="Назад"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft"
                  >
                    <ArrowLeft size={16} />
                  </button>
                )}
                <div className="text-[15px] font-bold text-ink">
                  {label ?? "Отправить анкету"}
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Закрыть"
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft"
              >
                <X size={16} />
              </button>
            </div>

            {!messenger ? (
              /* Шаг 1 — куда отправить */
              <>
                <div className="mb-3 text-[13px] text-muted">
                  Куда отправить ссылку на анкету?
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <ChannelTile
                    label="WhatsApp"
                    onClick={() => setMessenger("wa")}
                    hover="hover:border-green-400 hover:bg-green-50"
                    iconWrap="bg-green/10 text-green"
                    icon={<MessageCircle size={20} />}
                  />
                  <ChannelTile
                    label="Telegram"
                    onClick={() => setMessenger("tg")}
                    hover="hover:border-sky-400 hover:bg-sky-50"
                    iconWrap="bg-sky-100 text-sky-600"
                    icon={<Send size={19} />}
                  />
                  <ChannelTile
                    label="МАКС"
                    onClick={() => setMessenger("max")}
                    hover="hover:border-violet-400 hover:bg-violet-50"
                    iconWrap="bg-violet-100 text-violet-600"
                    icon={<span className="text-[15px] font-extrabold">M</span>}
                  />
                </div>

                {/* Ссылку можно просто скопировать — для почты, Авито,
                    объявления или любого другого канала. */}
                <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-surface-soft p-3">
                  <div className="flex items-center gap-2 text-[12px] text-muted">
                    <Link2 size={14} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate" title={url}>
                      {url}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => copy("link")}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 text-[12.5px] font-bold text-white transition-transform active:scale-[0.98]"
                    >
                      {copied === "link" ? <Check size={14} /> : <Copy size={14} />}
                      {copied === "link" ? "Скопировано" : "Скопировать ссылку"}
                    </button>
                    <button
                      type="button"
                      onClick={() => copy("text")}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-surface px-3 text-[12.5px] font-semibold text-ink shadow-card-sm transition-transform active:scale-[0.98]"
                      title="Скопировать сообщение целиком"
                    >
                      {copied === "text" ? <Check size={14} /> : <Copy size={14} />}
                      С текстом
                    </button>
                  </div>
                </div>
              </>
            ) : messenger === "max" ? (
              /* МАКС не умеет открывать чат по номеру — копируем сообщение */
              <>
                <div className="text-[13px] leading-relaxed text-muted">
                  МАКС не открывает чат по номеру телефона — такой ссылки
                  мессенджер не даёт. Скопируйте сообщение и вставьте его в чат
                  с клиентом.
                </div>
                <div className="mt-3 rounded-xl bg-surface-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
                  {body}
                </div>
                <button
                  type="button"
                  onClick={() => copy("text")}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-[14px] font-bold text-white transition-colors hover:bg-violet-700"
                >
                  {copied === "text" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "text" ? "Скопировано" : "Скопировать сообщение"}
                </button>
                <button
                  type="button"
                  onClick={() => window.open("https://web.max.ru/", "_blank", "noopener")}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-surface-soft py-2.5 text-[13px] font-semibold text-ink"
                >
                  Открыть МАКС
                </button>
              </>
            ) : (
              /* Шаг 2 — номер получателя + отправка */
              <>
                <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-2">
                  Номер получателя ·{" "}
                  {messenger === "wa" ? "WhatsApp" : "Telegram"}
                </div>
                <input
                  type="tel"
                  inputMode="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                  placeholder="+7 999 123-45-67"
                  className="h-11 w-full rounded-xl border border-border bg-surface-soft px-3 text-[15px] tabular-nums text-ink outline-none focus:border-blue-500"
                />
                <div className="mt-1.5 text-[11px] leading-tight text-muted-2">
                  Откроется чат с этим номером — добавлять в контакты не нужно.
                  Текст анкеты уже вписан, останется нажать «Отправить» в самом
                  мессенджере.
                </div>
                <button
                  type="button"
                  onClick={send}
                  disabled={!phone.trim()}
                  className={cn(
                    "mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold transition-colors",
                    !phone.trim()
                      ? "cursor-not-allowed bg-surface-soft text-muted-2"
                      : messenger === "wa"
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-sky-500 text-white hover:bg-sky-600",
                  )}
                >
                  <Send size={16} /> Отправить
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ChannelTile({
  label,
  onClick,
  hover,
  iconWrap,
  icon,
}: {
  label: string;
  onClick: () => void;
  hover: string;
  iconWrap: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface py-3.5 transition-colors active:scale-[0.98]",
        hover,
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          iconWrap,
        )}
      >
        {icon}
      </span>
      <span className="text-[12.5px] font-semibold text-ink">{label}</span>
    </button>
  );
}
