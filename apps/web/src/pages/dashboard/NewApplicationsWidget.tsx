import { Bell } from "lucide-react";
import { useApplications } from "@/lib/api/clientApplications";
import { KpiCard } from "./KpiCard";
import { useDashboardDrawer } from "./DashboardDrawer";

/**
 * Виджет «Новые заявки» на дашборде.
 *
 * v0.4.17: переведён на компонент KpiCard, чтобы геометрически
 * совпадать с соседними плашками (Поступит сегодня / Просрочено /
 * Активных аренд). Пульсация при наличии непросмотренных вынесена
 * на сам контейнер через JS-классы (не в KpiCard, чтобы не плодить
 * там специфичных пропсов).
 */
export function NewApplicationsWidget({ className }: { className?: string }) {
  const { data: items = [] } = useApplications();

  // v0.9.5 (#22): плашка считает заявки ЗА ТЕКУЩИЙ МЕСЯЦ (а не за всё время) —
  // отражает приток этого месяца, а не вечно растущий итог. Черновики (draft,
  // ещё не отправлены клиентом) в счёт не идут. Дата — submittedAt (когда
  // заявка пришла), c фолбэком на createdAt.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const monthName = now.toLocaleDateString("ru-RU", { month: "long" });
  const monthItems = items.filter((a) => {
    if (a.status === "draft") return false;
    const iso = a.submittedAt ?? a.createdAt;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= monthStart && t < monthEnd;
  });
  const total = monthItems.length;
  const newCount = monthItems.filter((a) => a.status === "new").length;
  const hasNew = newCount > 0;

  // v0.4.39: открываем drawer-список заявок (а не уводим на /clients).
  // Оператор не теряет контекст дашборда.
  const drawer = useDashboardDrawer();
  const goToList = () => drawer.openApplicationsList();

  return (
    <div
      // Пульсирующее кольцо вокруг карточки если есть новые — чтобы
      // менеджер не пропустил их при беглом взгляде.
      className={(hasNew ? "rounded-xl ring-2 ring-amber-400 animate-pulse " : "") + (className ?? "")}
    >
      <KpiCard
        title={
          <span className="inline-flex items-center gap-2">
            <Bell size={14} className={hasNew ? "text-amber-500" : undefined} />
            Новые заявки
          </span>
        }
        value={String(total)}
        onClick={goToList}
        delta={
          hasNew
            ? { tone: "up", label: `+${newCount} новых` }
            : undefined
        }
        foot={
          // v0.9.5 (#22): подпись подчёркивает, что счёт — за текущий месяц.
          // Конверсия «заявки → аренда» — в детальной статистике выручки.
          <span className="text-[11px] text-muted-2">
            {total === 0
              ? `За ${monthName} заявок пока нет`
              : hasNew
                ? "Нажмите, чтобы открыть →"
                : `За ${monthName} — все просмотрены`}
          </span>
        }
      />
    </div>
  );
}
