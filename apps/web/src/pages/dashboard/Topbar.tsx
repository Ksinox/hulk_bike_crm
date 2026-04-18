import { Bell, Calendar, Search, Settings } from "lucide-react";

export function Topbar() {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-2.5 shadow-card-sm">
      <div className="flex min-w-[280px] items-center gap-2.5 rounded-full border border-transparent bg-surface-soft px-3.5 py-2 transition-colors focus-within:border-blue focus-within:bg-white">
        <Search size={16} className="text-muted-2" />
        <input
          type="text"
          placeholder="Поиск: клиент, скутер, № договора…"
          className="w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted-2"
        />
      </div>
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-semibold text-blue-700">
        <Calendar size={14} />
        Сегодня, пн 13 окт
      </div>
      <div className="flex-1" />
      <IconBtn aria-label="Настройки">
        <Settings size={18} />
      </IconBtn>
      <IconBtn aria-label="Уведомления">
        <Bell size={18} />
        <span
          className="absolute h-2 w-2 rounded-full border-2 border-surface bg-red"
          style={{ top: 8, right: 9 }}
        />
      </IconBtn>
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-[14px] text-sm font-bold text-white"
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        ВМ
      </button>
    </div>
  );
}

function IconBtn({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-surface-soft text-ink-2 transition-colors hover:bg-blue-50 hover:text-blue-600"
      {...rest}
    >
      {children}
    </button>
  );
}
