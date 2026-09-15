import { useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Inbox,
  List,
  MessageCircle,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useApplications } from "@/lib/api/clientApplications";
import { saleFormUrl } from "@/pages/sales/saleForm";
import { Applications } from "./Applications";
import {
  copyToClipboard,
  RENT_FORM_URL,
  RENT_SHARE_INTRO,
  SendApplicationButton,
} from "./SendApplicationButton";

/**
 * Кнопка «Заявки» внутри раздела (правки 31.08).
 *
 * Наведение раскрывает меню: «Открыть список» и «Отправить анкету» с
 * каналами сразу — копирование ссылки, WhatsApp, Telegram, МАКС. Частое
 * действие (отправить ссылку) делается без единого перехода.
 *
 * Список открывается «погружением»: экран влетает вперёд, а слева —
 * кнопка «Назад». Раньше он выезжал сбоку и закрывался крестиком справа,
 * что читалось как случайно всплывшая панель.
 */

const SALE_INTRO =
  "Здравствуйте! Для оформления покупки скутера в Халк Байк заполните, пожалуйста, короткую анкету с паспортными данными: ";

export function ApplicationsButton({
  purpose,
  className,
}: {
  purpose: "rent" | "sale";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialogChannel, setDialogChannel] = useState<"wa" | "tg" | "max" | null>(
    null,
  );
  const closeTimer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /**
   * С какой стороны раскрывать меню (правка 31.08): кнопка «Заявки» в
   * «Продажах» стоит у правого края, и меню, раскрытое вправо, обрезалось
   * экраном. Считаем по месту: не влезает вправо — открываем влево.
   */
  const [alignRight, setAlignRight] = useState(false);

  const q = useApplications({ status: "active", poll: true });
  const fresh = (q.data ?? []).filter(
    (a) => (a.purpose ?? "rent") === purpose && a.status === "new",
  ).length;

  const isSale = purpose === "sale";
  const url = isSale ? saleFormUrl() : RENT_FORM_URL;
  const intro = isSale ? SALE_INTRO : RENT_SHARE_INTRO;
  const label = isSale ? "Анкета покупателя" : "Анкета аренды";

  const MENU_W = 236;
  const openMenu = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setAlignRight(r.left + MENU_W > window.innerWidth - 12);
    setMenu(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMenu(false), 220);
  };

  const copyLink = async () => {
    const ok = await copyToClipboard(url);
    toast[ok ? "success" : "error"](
      ok ? "Ссылка на анкету скопирована" : "Не удалось скопировать",
    );
    setMenu(false);
  };

  return (
    <>
      <div
        ref={wrapRef}
        className="relative"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <button
          type="button"
          onClick={() => {
            setMenu(false);
            setOpen(true);
          }}
          className={cn(
            "relative inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-card-sm transition-colors hover:bg-surface-soft",
            className,
          )}
        >
          <Inbox size={15} className="text-blue-600" />
          Заявки
          {fresh > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10.5px] font-bold text-white">
              {fresh}
            </span>
          )}
        </button>

        {menu && (
          // pt-1.5 — «мостик» под курсор между кнопкой и меню.
          <div
            className={cn(
              "absolute top-full z-[60] pt-1.5",
              alignRight ? "right-0" : "left-0",
            )}
          >
            <div className="w-[236px] overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-card-lg animate-slide-in-down">
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  setOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-surface-soft"
              >
                <List size={15} className="text-blue-600" />
                Открыть список
                {fresh > 0 && (
                  <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10.5px] font-bold text-white">
                    {fresh}
                  </span>
                )}
                <ChevronRight size={14} className="text-muted-2" />
              </button>

              <div className="mt-1 border-t border-border/70 px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
                Отправить анкету
              </div>
              <MenuItem
                icon={<Copy size={15} className="text-ink" />}
                label="Скопировать ссылку"
                onClick={copyLink}
              />
              <MenuItem
                icon={<MessageCircle size={15} className="text-green" />}
                label="WhatsApp"
                onClick={() => {
                  setMenu(false);
                  setDialogChannel("wa");
                }}
              />
              <MenuItem
                icon={<Send size={15} className="text-sky-600" />}
                label="Telegram"
                onClick={() => {
                  setMenu(false);
                  setDialogChannel("tg");
                }}
              />
              <MenuItem
                icon={
                  <span className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-violet-100 text-[9px] font-extrabold text-violet-600">
                    M
                  </span>
                }
                label="МАКС"
                onClick={() => {
                  setMenu(false);
                  setDialogChannel("max");
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Окно отправки — открывается сразу на выбранном канале. */}
      {dialogChannel && (
        <SendApplicationButton
          hideTrigger
          openWith={dialogChannel}
          label={label}
          text={intro}
          formUrl={url}
          onClosed={() => setDialogChannel(null)}
        />
      )}

      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-bg animate-dive-in">
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-soft hover:text-ink"
            >
              <ArrowLeft size={16} /> Назад
            </button>
            <div className="h-5 w-px bg-border" />
            <Inbox size={17} className="text-blue-600" />
            <div className="text-[15px] font-bold text-ink">
              {isSale ? "Заявки на покупку" : "Заявки на аренду"}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <Applications purpose={purpose} embedded />
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({
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
      className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold text-ink transition-colors hover:bg-surface-soft"
    >
      {icon}
      {label}
    </button>
  );
}
