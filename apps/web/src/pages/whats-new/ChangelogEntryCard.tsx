import { cn } from "@/lib/utils";
import type { ChangelogCategory } from "@/data/changelog";

const CATEGORY_STYLE: Record<ChangelogCategory, string> = {
  "Новое": "bg-green-soft text-green-ink",
  "Улучшение": "bg-blue-50 text-blue-700",
  "Исправление": "bg-orange-soft text-orange-ink",
  "Дизайн": "bg-purple-soft text-purple-ink",
  "Расчёты": "bg-surface-soft text-ink-2",
};

export function CategoryBadge({
  category,
  size = "md",
}: {
  category: ChangelogCategory;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-bold uppercase tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]",
        CATEGORY_STYLE[category],
      )}
    >
      {category}
    </span>
  );
}
