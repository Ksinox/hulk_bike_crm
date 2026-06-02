/**
 * Секция «Лента событий» — используется в ClientCard и в карточках скутера
 * (ScooterCard / ScooterQuickView). Раньше жила в RentalCardTabs.tsx, после
 * редизайна карточки таблицы убраны, секция выделена в самостоятельный файл.
 *
 * v0.4.7: каждая строка кликабельна — открывает соответствующую сущность
 * в drawer-стеке (если рендеримся внутри drawer-провайдера).
 *
 * v0.7.15: рендер событий унифицирован — используем общий
 * <ActivityEventRow> (визуальный формат «было → стало» с иконками),
 * тот же что в карточке аренды и на дашборде.
 */
import { History } from "lucide-react";
import { type ApiActivityItem } from "@/lib/api/activity";
import { ActivityEventRow } from "@/components/ActivityEventRow";
import { useDashboardDrawer } from "@/pages/dashboard/DashboardDrawer";

export function ActivityTimelineSection({
  items,
  loading,
}: {
  items: ApiActivityItem[];
  loading?: boolean;
}) {
  const drawer = useDashboardDrawer();
  const handleClick = (it: ApiActivityItem) => {
    if (it.entityId == null) return;
    if (it.entity === "rental") drawer.openRental(it.entityId);
    else if (it.entity === "scooter") drawer.openScooter(it.entityId);
    else if (it.entity === "client") drawer.openClient(it.entityId);
  };
  if (loading) {
    return (
      <div className="rounded-2xl bg-surface p-4 text-[12px] text-muted shadow-card-sm">
        Загружаем ленту событий…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-surface p-4 text-[12px] text-muted shadow-card-sm">
        События появятся здесь автоматически (создание, продления,
        смена статусов, начисления долга и т.д.).
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-surface p-3 shadow-card-sm">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        <History size={12} /> Лента событий
        <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[10px] text-muted">
          {items.length}
        </span>
      </div>
      <ol className="flex flex-col gap-1.5">
        {items.map((it) => {
          const clickable =
            it.entityId != null &&
            (it.entity === "rental" ||
              it.entity === "scooter" ||
              it.entity === "client");
          return (
            <li key={it.id}>
              <ActivityEventRow
                item={it}
                clickable={clickable}
                onOpen={() => clickable && handleClick(it)}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
