import { useMemo, useState } from "react";
import { ShoppingBag, Plus, Repeat } from "lucide-react";
import { useApiScooters } from "@/lib/api/scooters";
import { AddScooterModal } from "@/pages/fleet/AddScooterModal";
import { ScooterStatusModal } from "@/pages/fleet/ScooterStatusModal";
import { MobileFab } from "../ui";
import type { ApiScooter, ScooterBaseStatus, ScooterModel } from "@/lib/api/types";
import { matchId, matchScooterName, normalizeQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import {
  DetailRow,
  MobileChips,
  MobileEmpty,
  MobileSearch,
  MobileSheet,
  type ChipOption,
} from "../ui";

type Filter = "all" | "ready" | "rental_pool" | "repair" | "sale";

const MODEL_LABEL: Record<ScooterModel, string> = {
  jog: "Yamaha Jog",
  gear: "Honda Gear",
  honda: "Honda",
  tank: "Tank",
};

const STATUS_META: Record<ScooterBaseStatus, { label: string; cls: string }> = {
  ready: { label: "Готов", cls: "bg-green-soft text-green-ink" },
  rental_pool: { label: "В прокате", cls: "bg-blue-50 text-blue-600" },
  repair: { label: "Ремонт", cls: "bg-orange-soft text-orange-ink" },
  buyout: { label: "Выкуп", cls: "bg-purple-soft text-purple-ink" },
  for_sale: { label: "Продажа", cls: "bg-purple-soft text-purple-ink" },
  sold: { label: "Продан", cls: "bg-surface-soft text-muted" },
  disassembly: { label: "Разбор", cls: "bg-red-soft text-red-ink" },
};

function num(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

export function MobileScooters() {
  const { data: scooters = [] } = useApiScooters();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  /** Скутер, для которого открыта смена статуса. */
  const [statusId, setStatusId] = useState<number | null>(null);

  const live = useMemo(
    () => scooters.filter((s) => !s.archivedAt && !s.deletedAt),
    [scooters],
  );

  const counts = useMemo(() => {
    const c = { ready: 0, rental_pool: 0, repair: 0, sale: 0 };
    for (const s of live) {
      if (s.baseStatus === "ready") c.ready++;
      else if (s.baseStatus === "rental_pool") c.rental_pool++;
      else if (s.baseStatus === "repair") c.repair++;
      else if (s.baseStatus === "for_sale" || s.baseStatus === "buyout") c.sale++;
    }
    return c;
  }, [live]);

  const filtered = useMemo(() => {
    const matchStatus = (s: ApiScooter): boolean => {
      if (filter === "all") return true;
      if (filter === "sale")
        return s.baseStatus === "for_sale" || s.baseStatus === "buyout";
      return s.baseStatus === filter;
    };
    const matchSearch = (s: ApiScooter): boolean => {
      if (!search.trim()) return true;
      const q = normalizeQuery(search);
      return (
        matchScooterName(s.name, q) ||
        matchId(s.id, q) ||
        matchScooterName(s.vin ?? undefined, q)
      );
    };
    return live
      .filter((s) => matchStatus(s) && matchSearch(s))
      .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }));
  }, [live, filter, search]);

  const chips: ChipOption<Filter>[] = [
    { id: "all", label: "Все", count: live.length },
    { id: "rental_pool", label: "В прокате", count: counts.rental_pool },
    { id: "ready", label: "Готовы", count: counts.ready },
    { id: "repair", label: "Ремонт", count: counts.repair },
    { id: "sale", label: "Продажа", count: counts.sale },
  ];

  const openScooter = live.find((s) => s.id === openId) ?? null;
  const statusScooter = statusId != null ? live.find((s) => s.id === statusId) ?? null : null;

  return (
    <div className="flex flex-col gap-3">
      <MobileSearch value={search} onChange={setSearch} placeholder="Номер, имя, VIN…" />
      <MobileChips options={chips} value={filter} onChange={setFilter} />

      {filtered.length === 0 ? (
        <MobileEmpty
          icon={<ShoppingBag size={26} />}
          title="Скутеров нет"
          hint={search ? "Ничего не нашлось" : "В этом фильтре пусто"}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((s) => (
            <ScooterCard key={s.id} scooter={s} onClick={() => setOpenId(s.id)} />
          ))}
        </div>
      )}

      <MobileSheet
        open={openScooter != null}
        onClose={() => setOpenId(null)}
        title={openScooter?.name ?? "Скутер"}
      >
        {openScooter && (
          <ScooterDetail
            scooter={openScooter}
            onChangeStatus={() => setStatusId(openScooter.id)}
          />
        )}
      </MobileSheet>

      {/* Добавление скутера и смена статуса — десктоп-модалки (адаптивны). */}
      {newOpen && <AddScooterModal onClose={() => setNewOpen(false)} />}
      {statusScooter && (
        <ScooterStatusModal
          scooter={statusScooter}
          onClose={() => setStatusId(null)}
        />
      )}

      <MobileFab
        onClick={() => setNewOpen(true)}
        icon={<Plus size={20} strokeWidth={2.5} />}
        label="Скутер"
      />
    </div>
  );
}

function ScooterCard({
  scooter,
  onClick,
}: {
  scooter: ApiScooter;
  onClick: () => void;
}) {
  const meta = STATUS_META[scooter.baseStatus];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 rounded-2xl bg-surface p-3 text-left shadow-card-sm active:scale-[0.99]"
    >
      <div className="flex items-start justify-between">
        <span className="font-display text-[16px] font-bold text-ink">
          {scooter.name}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>
          {meta.label}
        </span>
      </div>
      <div className="text-[12px] text-muted">{MODEL_LABEL[scooter.model]}</div>
      <div className="text-[11px] text-muted-2">{num(scooter.mileage)} км</div>
    </button>
  );
}

function ScooterDetail({
  scooter,
  onChangeStatus,
}: {
  scooter: ApiScooter;
  onChangeStatus: () => void;
}) {
  const meta = STATUS_META[scooter.baseStatus];
  return (
    <div>
      <div className="mb-2">
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", meta.cls)}>
          {meta.label}
        </span>
      </div>
      <div className="rounded-2xl bg-surface px-3.5 shadow-card-sm">
        <DetailRow label="Модель" value={MODEL_LABEL[scooter.model]} />
        <div className="border-t border-border" />
        <DetailRow label="Пробег" value={`${num(scooter.mileage)} км`} />
        {scooter.year && (
          <>
            <div className="border-t border-border" />
            <DetailRow label="Год" value={String(scooter.year)} />
          </>
        )}
        {scooter.color && (
          <>
            <div className="border-t border-border" />
            <DetailRow label="Цвет" value={scooter.color} />
          </>
        )}
        {scooter.vin && (
          <>
            <div className="border-t border-border" />
            <DetailRow label="VIN" value={<span className="font-mono text-[12px]">{scooter.vin}</span>} />
          </>
        )}
        {scooter.note && (
          <>
            <div className="border-t border-border" />
            <DetailRow label="Заметка" value={scooter.note} />
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onChangeStatus}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface py-3 text-[14px] font-bold text-ink shadow-card-sm active:scale-[0.99]"
      >
        <Repeat size={16} /> Сменить статус
      </button>
      <p className="mt-2 text-center text-[12px] text-muted-2">
        Обслуживание и документы — на компьютере
      </p>
    </div>
  );
}
