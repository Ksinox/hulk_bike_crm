import { Topbar } from "@/pages/dashboard/Topbar";

export function Clients() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex items-baseline gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Клиенты
        </h1>
        <span className="rounded-full bg-surface-soft px-3 py-1 text-[13px] font-semibold text-muted">
          44 клиента
        </span>
      </header>

      <div className="flex flex-1 items-center justify-center rounded-2xl bg-surface py-24 shadow-card">
        <div className="text-center">
          <div className="text-[15px] font-semibold text-ink-2">
            Страница «Клиенты» в разработке
          </div>
          <div className="mt-1 text-[13px] text-muted">
            Скоро здесь появится список и карточки клиентов
          </div>
        </div>
      </div>
    </main>
  );
}
