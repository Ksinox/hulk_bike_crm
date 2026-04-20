import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusFilter = "all" | "active" | "debt" | "black";
export type SourceFilter = "all" | "avito" | "repeat" | "ref";

export type FiltersState = {
  search: string;
  status: StatusFilter;
  source: SourceFilter;
};

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные" },
  { id: "debt", label: "С долгом" },
  { id: "black", label: "Ч/С" },
];

const SOURCE_TABS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "avito", label: "Авито" },
  { id: "repeat", label: "Повторный" },
  { id: "ref", label: "Реком." },
];

export function ClientsFilters({
  value,
  onChange,
}: {
  value: FiltersState;
  onChange: (next: FiltersState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-card-sm">
      <div className="relative min-w-[220px] flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
        />
        <input
          type="text"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Имя или телефон…"
          className="h-9 w-full rounded-full bg-surface-soft pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <Segmented
        label="Статус"
        tabs={STATUS_TABS}
        active={value.status}
        onSelect={(id) => onChange({ ...value, status: id })}
      />
      <Segmented
        label="Источник"
        tabs={SOURCE_TABS}
        active={value.source}
        onSelect={(id) => onChange({ ...value, source: id })}
      />
    </div>
  );
}

function Segmented<T extends string>({
  label,
  tabs,
  active,
  onSelect,
}: {
  label: string;
  tabs: { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
        {label}
      </span>
      <div className="inline-flex rounded-full bg-surface-soft p-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
              active === t.id
                ? "bg-white text-ink shadow-card-sm"
                : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
