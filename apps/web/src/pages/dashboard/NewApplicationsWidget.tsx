import { Bell } from "lucide-react";
import { useApplications } from "@/lib/api/clientApplications";
import { navigate } from "@/app/navigationStore";
import { KpiCard } from "./KpiCard";

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
  const newCount = items.filter((a) => a.status === "new").length;
  const total = items.length;
  const hasNew = newCount > 0;

  const goToList = () => navigate({ route: "clients" });

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
          <span>
            {total === 0
              ? "Поделитесь ссылкой с клиентом, чтобы он заполнил анкету сам."
              : hasNew
                ? "Нажмите, чтобы открыть →"
                : "Все просмотрены"}
          </span>
        }
      />
    </div>
  );
}
