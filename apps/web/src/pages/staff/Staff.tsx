import { Construction, Plus, UserCog } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";

/**
 * Placeholder для будущего управления сотрудниками.
 * Сейчас юзеры заводятся через seed. Скоро — добавление/редактирование
 * прямо в этой вкладке: имя, логин, пароль, роль, активность.
 */
export function Staff() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
            Сотрудники
          </h1>
          <span className="rounded-full bg-orange-soft px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-orange-ink">
            скоро
          </span>
        </div>
        <button
          type="button"
          disabled
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full bg-surface-soft px-4 py-2 text-[13px] font-semibold text-muted-2"
          title="Доступно в ближайшем обновлении"
        >
          <Plus size={16} /> Добавить сотрудника
        </button>
      </header>

      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface p-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-700">
          <UserCog size={28} />
        </div>
        <h2 className="font-display text-[20px] font-extrabold text-ink">
          Управление учётными записями
        </h2>
        <p className="max-w-[520px] text-[13px] leading-relaxed text-muted">
          Скоро здесь можно будет завести новых сотрудников (механиков,
          бухгалтеров, дополнительных администраторов), задать им роли и
          персональные права. Каждый получит свой тайл на экране входа с
          персональным паролем.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-full bg-surface-soft px-3 py-1.5 text-[11px] font-semibold text-muted">
          <Construction size={12} /> В разработке
        </div>
      </div>
    </main>
  );
}
