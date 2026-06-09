import { useState } from "react";
import { ArrowLeft, MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { whatsappLink, telegramLink } from "@/lib/messengers";

// Hash-route (#/apply) — vite собирает бандл с base "./".
const PUBLIC_FORM_URL =
  (import.meta.env.VITE_PUBLIC_FORM_URL as string | undefined) ??
  (typeof window !== "undefined"
    ? `${window.location.origin}/#/apply`
    : "/#/apply");

const SHARE_TEXT = `Здравствуйте! Для оформления аренды скутера в Халк Байк заполните, пожалуйста, короткую анкету: ${PUBLIC_FORM_URL}`;

type Messenger = "wa" | "tg";

/**
 * «Отправить анкету» — кнопка в разделе «Заявки».
 *
 * Flow по умолчанию: выбрать мессенджер (WhatsApp/Telegram) → ввести номер
 * получателя → «Отправить» → открывается чат прямо с этим номером (без
 * сохранения в контакты) с уже вписанным текстом-ссылкой на анкету.
 */
export function SendApplicationButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [messenger, setMessenger] = useState<Messenger | null>(null);
  const [phone, setPhone] = useState("");

  const close = () => {
    setOpen(false);
    setMessenger(null);
    setPhone("");
  };

  const send = () => {
    if (!phone.trim() || !messenger) return;
    const link =
      messenger === "wa"
        ? whatsappLink(phone, SHARE_TEXT)
        : telegramLink(phone, SHARE_TEXT);
    if (link) window.open(link, "_blank", "noopener");
    close();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700",
          className,
        )}
      >
        <Send size={15} /> Отправить анкету
      </button>

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
                  Отправить анкету
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
              /* Шаг 1 — выбор мессенджера */
              <>
                <div className="mb-3 text-[13px] text-muted">
                  Куда отправить ссылку на анкету?
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMessenger("wa")}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface py-4 transition-colors hover:border-green-400 hover:bg-green-50 active:scale-[0.98]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green/10 text-green">
                      <MessageCircle size={20} />
                    </span>
                    <span className="text-[13px] font-semibold text-ink">
                      WhatsApp
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessenger("tg")}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface py-4 transition-colors hover:border-sky-400 hover:bg-sky-50 active:scale-[0.98]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                      <Send size={19} />
                    </span>
                    <span className="text-[13px] font-semibold text-ink">
                      Telegram
                    </span>
                  </button>
                </div>
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
