import { useState } from "react";
import { FileText, Tags } from "lucide-react";
import { cn } from "@/lib/utils";
import { Topbar } from "@/pages/dashboard/Topbar";
import { PriceListView } from "@/pages/rentals/PriceListView";

type DocsTab = "price" | "templates";

const TABS: { id: DocsTab; label: string; icon: typeof FileText }[] = [
  { id: "price", label: "Прейскурант", icon: Tags },
  // Шаблоны договоров — заглушка под будущий редактор. Пока ничего не
  // показываем, но место зарезервировано чтобы пользователь видел
  // структуру раздела.
  { id: "templates", label: "Шаблоны договоров", icon: FileText },
];

/**
 * Раздел «Документы» — глобальный (один на всю CRM).
 *
 * Сейчас содержит:
 *  - Прейскурант: справочник цен на детали / штрафы / повреждения /
 *    экипировку с привязкой групп к моделям скутеров. Используется
 *    при фиксации ущерба.
 *
 * В планах:
 *  - Шаблоны договоров с WYSIWYG-редактором и переменными.
 */
export function Documents() {
  const [tab, setTab] = useState<DocsTab>("price");

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <header className="flex items-baseline gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
          Документы
        </h1>
        <span className="text-[13px] text-muted-2">
          справочники и шаблоны
        </span>
      </header>

      <div className="inline-flex w-fit rounded-[10px] bg-surface-soft p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition",
                tab === t.id
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted-2 hover:text-ink",
              )}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      <section className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface p-5 shadow-card-sm">
        {tab === "price" && <PriceListView />}
        {tab === "templates" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
            <FileText size={32} className="text-muted-2" />
            <div className="text-[14px] font-semibold text-ink">
              Редактор шаблонов договоров — в разработке
            </div>
            <div className="max-w-[460px] text-[12px] text-muted-2">
              В следующих релизах здесь появится визуальный редактор
              договоров с возможностью drag-and-drop переменных
              (клиент, скутер, аренда), таблицами и автосохранением.
              Сейчас системные шаблоны (договор + акты) подставляются
              автоматически из карточки аренды → таб «Документы».
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
