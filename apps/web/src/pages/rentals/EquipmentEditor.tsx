import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiEquipment, type ApiEquipmentItem } from "@/lib/api/equipment";

/** Снимок позиции экипировки в аренде (itemId+name+price+free). */
export type EquipmentSnapshot = {
  itemId?: number | null;
  name: string;
  price: number;
  free: boolean;
};

/**
 * Редактор экипировки аренды. Multi-select из каталога /api/equipment.
 * Если позиция уже в аренде, но удалена из каталога — отображаем её как
 * «вне каталога» и сохраняем в снимке. Снимок (name/price/free) важен:
 * если каталог изменят позже, у аренды останется честная цена выдачи.
 *
 * v0.8.x: вынесен в отдельный файл из бывшего RentalEditModal (тот удалён —
 * сырую правку аренды заменили безопасные кнопки в карточке).
 *
 * NB: единственным потребителем был старый диалог продления (удалён) —
 * сейчас компонент нигде не используется, кандидат на удаление.
 */
export function EquipmentEditor({
  value,
  onChange,
}: {
  value: EquipmentSnapshot[];
  onChange: (next: EquipmentSnapshot[]) => void;
}) {
  const { data: catalog = [] } = useApiEquipment();
  const selectedIds = new Set(
    value.map((v) => v.itemId).filter((x): x is number => typeof x === "number"),
  );
  const toggle = (item: ApiEquipmentItem) => {
    if (selectedIds.has(item.id)) {
      onChange(value.filter((v) => v.itemId !== item.id));
    } else {
      onChange([
        ...value,
        {
          itemId: item.id,
          name: item.name,
          price: item.price,
          free: item.isFree,
        },
      ]);
    }
  };
  // Снимки, которых нет в каталоге (legacy/удалены) — показываем как
  // отдельные «вне каталога» чипсы, чтобы оператор мог их снять.
  const orphans = value.filter(
    (v) => v.itemId == null || !catalog.find((c) => c.id === v.itemId),
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {catalog.length === 0 && (
          <span className="text-[11px] text-muted-2">
            Каталог пуст — добавьте позиции в Парк → Экипировка.
          </span>
        )}
        {catalog.map((item) => {
          const on = selectedIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                on
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-border bg-white text-ink-2 hover:border-blue-400",
              )}
              title={
                item.isFree
                  ? "Бесплатно (входит в стоимость)"
                  : `${item.price} ₽`
              }
            >
              {item.name}
              {item.isFree ? (
                <span className="text-[10px] text-green-700">бесплатно</span>
              ) : item.price > 0 ? (
                <span className="text-[10px] text-muted-2">
                  +{item.price}₽
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {orphans.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {orphans.map((o, i) => (
            <button
              key={`orphan-${i}`}
              type="button"
              onClick={() => onChange(value.filter((v) => v !== o))}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-900"
              title="Вне текущего каталога — нажмите чтобы снять"
            >
              {o.name}
              <X size={10} />
            </button>
          ))}
        </div>
      )}
      <div className="text-[11px] text-muted-2">
        Изменения сохранятся атомарно. Сумма аренды не пересчитывается
        автоматически — поправьте «Тариф/Дни» если экипировка влияет на
        итог.
      </div>
    </div>
  );
}
