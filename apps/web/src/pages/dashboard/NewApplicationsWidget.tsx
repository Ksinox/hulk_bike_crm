import { Bell, Bike } from "lucide-react";
import {
  useApplications,
  useConvertedApplicationsCount,
} from "@/lib/api/clientApplications";
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
  // v0.9.7: накопительный счётчик «заявок, оформленных в аренду».
  const { data: convertedCount = 0 } = useConvertedApplicationsCount();
  const newCount = items.filter((a) => a.status === "new").length;
  const total = items.length;
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
          <span className="flex flex-col gap-0.5 leading-tight">
            {/* Накопительная сводка: сколько заявок с формы стали арендой. */}
            <span className="inline-flex items-center gap-1 font-bold text-green-ink">
              <Bike size={12} className="shrink-0" />
              {convertedCount} оформлено в аренду
            </span>
            <span className="text-[11px] text-muted-2">
              {total === 0
                ? "Поделитесь ссылкой — клиент заполнит анкету сам"
                : hasNew
                  ? "Нажмите, чтобы открыть →"
                  : "Все заявки просмотрены"}
            </span>
          </span>
        }
      />
    </div>
  );
}
