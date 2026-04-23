import { Activity, Bike, CreditCard, Tag, Package, User, UserCog, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import { useActivityLog, type ApiActivityItem } from "@/lib/api/activity";

const ENTITY_ICON: Record<string, typeof Bike> = {
  client: User,
  scooter: Bike,
  rental: Bike,
  payment: CreditCard,
  user: UserCog,
  model: Tag,
  equipment: Package,
  maintenance: Wrench,
};

const ENTITY_COLOR: Record<string, string> = {
  client: "bg-blue-50 text-blue-700",
  scooter: "bg-emerald-50 text-emerald-700",
  rental: "bg-indigo-50 text-indigo-700",
  payment: "bg-green-soft text-green-ink",
  user: "bg-purple-soft text-purple-ink",
  model: "bg-amber-100 text-amber-700",
  equipment: "bg-pink-50 text-pink-700",
  maintenance: "bg-orange-soft text-orange-ink",
};

export function ActivityFeed({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { data: items = [], isLoading } = useActivityLog(compact ? 12 : 24);

  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className={compact ? "m-0 text-base font-bold" : "m-0 text-base font-bold tracking-[-0.005em]"}>
          Последние действия
        </h3>
        {items.length > 0 && (
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2">
            обновляется каждые 30 с
          </span>
        )}
      </div>

      {isLoading && items.length === 0 ? (
        <div className="py-8 text-center text-muted text-[13px]">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-muted-2">
            <Activity size={22} />
          </div>
          <div className="text-[13px] text-muted max-w-[260px]">
            Пока никаких действий не зафиксировано. Они появятся здесь, как только кто-то начнёт работать в системе.
          </div>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {items.map((it) => (
            <Row key={it.id} it={it} />
          ))}
        </div>
      )}
    </Card>
  );
}

function Row({ it }: { it: ApiActivityItem }) {
  const Icon = ENTITY_ICON[it.entity] ?? Activity;
  const cls = ENTITY_COLOR[it.entity] ?? "bg-surface-soft text-muted-2";
  const dt = new Date(it.createdAt);
  const timeAgo = formatAgo(dt);

  return (
    <div className="flex items-start gap-2.5 py-2">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          cls,
        )}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink">{it.summary}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
          <UserBadge name={it.userName} role={it.userRole} />
          <span>·</span>
          <span title={dt.toLocaleString("ru-RU")}>{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}

function UserBadge({ name, role }: { name: string; role: string | null }) {
  const cls =
    role === "creator"
      ? "bg-purple-soft text-purple-ink"
      : role === "director"
        ? "bg-blue-50 text-blue-700"
        : role === "admin"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-surface-soft text-muted-2";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
        cls,
      )}
    >
      {name}
    </span>
  );
}

function formatAgo(d: Date): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return "только что";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)
    return `${diffMin} ${plural(diffMin, ["минуту", "минуты", "минут"])} назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ${plural(diffH, ["час", "часа", "часов"])} назад`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} ${plural(diffD, ["день", "дня", "дней"])} назад`;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
