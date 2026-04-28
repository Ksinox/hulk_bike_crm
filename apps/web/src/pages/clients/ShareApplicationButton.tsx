import { useEffect, useRef, useState } from "react";
import { Check, Copy, MessageCircle, Send, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

/**
 * Кнопка «Поделиться формой» в шапке /clients.
 *
 * При клике — popover с тремя мессенджерами + «Скопировать ссылку».
 * Telegram/WhatsApp открываются через deep-link (window.open),
 * Max — копируется в буфер (нет стандартного share-link).
 */

// Используем hash-route (#/apply): vite собирает бандл с base: "./",
// и на path /apply скрипты бы грузились с /apply/assets/... → 404.
// Hash оставляет pathname = "/" и не ломает загрузку бандла.
const PUBLIC_FORM_URL =
  (import.meta.env.VITE_PUBLIC_FORM_URL as string | undefined) ??
  (typeof window !== "undefined"
    ? `${window.location.origin}/#/apply`
    : "/#/apply");

const SHARE_TEXT = `Здравствуйте! Для оформления аренды скутера в Халк Байк заполните, пожалуйста, короткую анкету: ${PUBLIC_FORM_URL}`;

export function ShareApplicationButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Закрываем popover по клику вне
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const openWhatsapp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(SHARE_TEXT)}`,
      "_blank",
      "noopener",
    );
    setOpen(false);
  };

  const openTelegram = () => {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(PUBLIC_FORM_URL)}&text=${encodeURIComponent("Анкета для оформления аренды скутера")}`,
      "_blank",
      "noopener",
    );
    setOpen(false);
  };

  const copyForMax = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_TEXT);
      toast.success("Текст скопирован", "Вставьте в Max и отправьте клиенту");
    } catch {
      toast.error("Не получилось скопировать");
    }
    setOpen(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_FORM_URL);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не получилось скопировать");
    }
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-soft"
      >
        <Share2 size={16} />
        Поделиться анкетой
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[280px] overflow-hidden rounded-2xl border border-border bg-surface shadow-card-lg">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">
              Отправить ссылку клиенту
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-muted-2">
              {PUBLIC_FORM_URL}
            </div>
          </div>
          <div className="flex flex-col p-2">
            <ShareItem
              icon={<MessageCircle size={16} className="text-emerald-600" />}
              label="WhatsApp"
              onClick={openWhatsapp}
            />
            <ShareItem
              icon={<Send size={16} className="text-sky-600" />}
              label="Telegram"
              onClick={openTelegram}
            />
            <ShareItem
              icon={<Check size={16} className="text-violet-600" />}
              label="Max (скопировать текст)"
              onClick={copyForMax}
            />
            <div className="my-1 h-px bg-border" />
            <ShareItem
              icon={<Copy size={16} className="text-muted" />}
              label="Скопировать ссылку"
              onClick={copyLink}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ShareItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-ink transition-colors hover:bg-surface-soft",
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-soft">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
