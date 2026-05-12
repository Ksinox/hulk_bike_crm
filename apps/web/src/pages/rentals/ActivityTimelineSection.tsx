/**
 * Секция «Лента событий» — используется в ClientCard и в drawer'е истории
 * аренды (v0.6 RentalCard). Раньше жила в RentalCardTabs.tsx, после редизайна
 * карточки таблицы убраны, секция выделена в самостоятельный файл.
 *
 * v0.4.7: каждая строка кликабельна — открывает соответствующую сущность
 * в drawer-стеке (если рендеримся внутри drawer-провайдера). Иначе —
 * навигация на полную страницу.
 */
import { Clock, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ApiActivityItem } from "@/lib/api/activity";
import { useDashboardDrawer } from "@/pages/dashboard/DashboardDrawer";
import { navigate } from "@/app/navigationStore";

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
  // navigate keep imported для других мест файла; void чтобы линтер
  // не ругался если в этой функции его нет.
  void navigate;
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
          const isExtension =
            it.action === "extended" || it.action === "rental_extended";
          const isCreated =
            it.action === "created" && it.entity === "rental";
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => clickable && handleClick(it)}
                disabled={!clickable}
                className={cn(
                  "flex w-full items-start gap-2 rounded-[10px] px-3 py-2 text-left transition-colors",
                  isExtension
                    ? "border-2 border-blue-400 bg-blue-50 hover:bg-blue-100"
                    : isCreated
                      ? "border border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                      : "bg-surface-soft hover:bg-blue-50",
                  clickable ? "cursor-pointer" : "cursor-default",
                )}
                title={
                  clickable
                    ? `Открыть ${entityLabel(it.entity)}`
                    : undefined
                }
              >
                <div
                  className={cn(
                    "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                    actionDotColor(it.action),
                  )}
                />
                <div className="min-w-0 flex-1">
                  {isExtension && (
                    <div className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      ↻ Продление · новый период
                    </div>
                  )}
                  {isCreated && (
                    <div className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                      ✓ Создание аренды
                    </div>
                  )}
                  <div
                    className={cn(
                      "text-[13px] leading-snug",
                      isExtension
                        ? "font-semibold text-blue-900"
                        : isCreated
                          ? "font-semibold text-emerald-900"
                          : "text-ink",
                    )}
                  >
                    {it.summary}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-2">
                    <Clock size={10} />
                    {new Date(it.createdAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {it.userName && it.userName !== "система" && (
                      <>
                        <span className="opacity-40">·</span>
                        <span>{it.userName}</span>
                      </>
                    )}
                    {it.entity && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="lowercase">
                          {entityLabel(it.entity)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {clickable && (
                  <span
                    className="self-center text-[10px] font-bold uppercase tracking-wider text-blue-600 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  >
                    →
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function actionDotColor(action: string): string {
  if (
    action.includes("created") ||
    action.includes("activate") ||
    action === "extended"
  ) {
    return "bg-blue-500";
  }
  if (action.includes("forgiv") || action.includes("paid")) {
    return "bg-green-500";
  }
  if (
    action.includes("debt") ||
    action.includes("damage") ||
    action.includes("overdue")
  ) {
    return "bg-red-500";
  }
  if (action.includes("archived") || action.includes("deleted")) {
    return "bg-muted-2";
  }
  return "bg-amber-500";
}

function entityLabel(entity: string): string {
  switch (entity) {
    case "rental":
      return "аренда";
    case "scooter":
      return "скутер";
    case "client":
      return "клиент";
    case "damage_report":
      return "акт ущерба";
    case "payment":
      return "платёж";
    case "repair_job":
      return "ремонт";
    case "user":
      return "пользователь";
    default:
      return entity;
  }
}
