import { useMemo, useState } from "react";
import { AlertTriangle, Ban, Pencil, Plus, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  avatarColorIndex,
  getClientDetails,
  initialsOf,
  ratingTier,
  SOURCE_LABEL,
  type Client,
} from "@/lib/mock/clients";
import {
  RentalsTab,
  InstalmentsTab,
  IncidentsTab,
  DocsTab,
  RatingTab,
} from "./ClientCardTabs";
import { AddClientModal } from "./AddClientModal";
import { SequentialNamingModal } from "./SequentialNamingModal";
import { clientStore, useClientPhoto } from "./clientStore";
import type { UploadedFile } from "./DocUpload";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-green-soft text-green-ink",
  "bg-orange-soft text-orange-ink",
  "bg-purple-soft text-purple-ink",
  "bg-red-soft text-red-ink",
  "bg-yellow-100 text-yellow-700",
];

export type CardTab =
  | "rentals"
  | "instalments"
  | "incidents"
  | "docs"
  | "rhist";

const TABS: { id: CardTab; label: string }[] = [
  { id: "rentals", label: "Аренды" },
  { id: "instalments", label: "Рассрочки" },
  { id: "incidents", label: "Инциденты" },
  { id: "docs", label: "Документы" },
  { id: "rhist", label: "Рейтинг" },
];

function parseDays(period: string): number | null {
  const m = period.match(
    /(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*[—-]\s*(?:(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?|(идёт|идет|невозврат))/i,
  );
  if (!m) return null;
  const [, d1, mo1, y1, d2, mo2, y2, tail] = m;
  const yr1 = Number(y1 || y2 || 2026);
  const start = new Date(yr1, Number(mo1) - 1, Number(d1));
  const end = tail
    ? new Date(2026, 3, 18)
    : new Date(Number(y2 || y1 || 2026), Number(mo2) - 1, Number(d2));
  return Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function daysWord(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
}

function rentalsWord(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "аренда";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "аренды";
  return "аренд";
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function ClientCard({ client }: { client: Client }) {
  const [tab, setTab] = useState<CardTab>("rentals");
  const [editOpen, setEditOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[] | null>(null);
  const d = useMemo(() => getClientDetails(client), [client]);
  const tier = ratingTier(client.rating);
  const photo = useClientPhoto(client.id);

  const avatar = AVATAR_COLORS[avatarColorIndex(client.id) - 1] ?? AVATAR_COLORS[0];

  const handleDroppedFiles = (list: FileList) => {
    const uploaded: UploadedFile[] = [];
    for (const f of Array.from(list)) {
      const uf: UploadedFile = { name: f.name, size: f.size };
      if (f.type.startsWith("image/") || f.type === "application/pdf") {
        uf.thumbUrl = URL.createObjectURL(f);
      }
      uploaded.push(uf);
    }
    if (uploaded.length === 0) return;
    setPendingFiles(uploaded);
  };

  const turnover = d.rentals.reduce((s, x) => s + (x.sum || 0), 0);
  const avgCheck = d.rentals.length > 0 ? Math.round(turnover / d.rentals.length) : 0;
  const durations = d.rentals
    .map((x) => parseDays(x.period))
    .filter((x): x is number => x != null);
  const avgDuration =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  return (
    <div
      className="relative flex min-h-0 flex-col gap-3 rounded-2xl bg-surface p-5 shadow-card-sm"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) {
          handleDroppedFiles(e.dataTransfer.files);
        }
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex animate-backdrop-in flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-blue-600 bg-blue-50/90 backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-blue-600 shadow-card">
            <UploadCloud size={28} />
          </div>
          <div className="font-display text-[20px] font-extrabold text-blue-700">
            Отпустите — добавим в карточку {client.name.split(" ")[0]}
          </div>
          <div className="text-[12px] text-blue-700/80">
            После загрузки дадим название каждому файлу
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[15px] font-bold",
            client.blacklisted ? "bg-red text-white" : avatar,
          )}
          title={photo ? "Фото клиента" : undefined}
        >
          {photo?.thumbUrl ? (
            <img
              src={photo.thumbUrl}
              alt={client.name}
              className="h-full w-full object-cover"
            />
          ) : client.blacklisted ? (
            "✕"
          ) : (
            initialsOf(client.name)
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              className={cn(
                "font-display text-[24px] font-extrabold leading-tight text-ink",
                client.blacklisted && "line-through decoration-red/60",
              )}
            >
              {client.name}
            </h2>
            {client.blacklisted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-soft px-2 py-0.5 text-[11px] font-bold text-red-ink">
                <Ban size={12} /> Чёрный список
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                tier.tone === "good"
                  ? "bg-green-soft text-green-ink"
                  : tier.tone === "mid"
                    ? "bg-surface-soft text-ink"
                    : "bg-red-soft text-red-ink",
              )}
            >
              {client.rating} · {tier.label}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-muted-2">
            id #{String(client.id).padStart(4, "0")} · добавлен{" "}
            {client.added} · источник: {SOURCE_LABEL[client.source]} ·{" "}
            <span className="tabular-nums">{client.phone}</span>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-border"
          >
            <Pencil size={13} /> Редактировать
          </button>
          <button
            type="button"
            disabled={client.blacklisted}
            title={
              client.blacklisted
                ? "Клиент заблокирован"
                : "Создать аренду"
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
              client.blacklisted
                ? "cursor-not-allowed bg-surface-soft text-muted-2"
                : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            <Plus size={13} /> Создать аренду
          </button>
        </div>
      </header>

      {/* Banners */}
      {client.blacklisted && (
        <div className="flex items-start gap-2 rounded-[14px] bg-red-soft/70 p-3 text-[13px] text-red-ink">
          <Ban size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <b>Клиент в чёрном списке.</b>{" "}
            <span>Причина: {d.blReason || "—"}</span>
            <span className="ml-2 text-[11px] text-red-ink/70">
              {d.blDate} · {d.blBy}
            </span>
          </div>
        </div>
      )}
      {client.debt > 0 && (
        <div className="flex items-center gap-2 rounded-[14px] bg-orange-soft/70 p-3 text-[13px] text-orange-ink">
          <AlertTriangle size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <b>Есть непогашенный долг: {fmt(client.debt)} ₽</b>
            <span className="ml-2 text-[12px] text-orange-ink/80">
              {client.comment || "по последней аренде"}
            </span>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-orange-ink shadow-card-sm hover:bg-surface-soft"
          >
            Записать оплату
          </button>
        </div>
      )}

      {/* KPI rows */}
      <KpiRow
        group="Деньги"
        items={[
          {
            label: "Оборот",
            value: turnover > 0 ? `${fmt(turnover)} ₽` : "—",
            hint:
              d.rentals.length > 0
                ? `${d.rentals.length} ${rentalsWord(d.rentals.length)} за всё время`
                : "нет аренд",
            tone: turnover > 0 ? "green" : "gray",
          },
          {
            label: "Средний чек",
            value: avgCheck > 0 ? `${fmt(avgCheck)} ₽` : "—",
            hint: avgCheck > 0 ? "за одну аренду" : "нет данных",
            tone: "neutral",
          },
          {
            label: "Ср. длительность",
            value:
              avgDuration > 0 ? `${avgDuration} ${daysWord(avgDuration)}` : "—",
            hint: avgDuration > 0 ? "одна аренда" : "нет данных",
            tone: "neutral",
          },
        ]}
      />
      <KpiRow
        group="Активность"
        items={[
          {
            label: "Всего аренд",
            value: String(d.stats.total),
            hint: "за всё время",
            tone: "neutral",
          },
          {
            label: "Активных",
            value: String(d.stats.active),
            hint: d.stats.active > 0 ? "идут сейчас" : "нет активных",
            tone: d.stats.active > 0 ? "green" : "gray",
          },
          {
            label: "Общий долг",
            value: client.debt > 0 ? `${fmt(client.debt)} ₽` : "—",
            hint: client.debt > 0 ? "непогашен" : "нет долгов",
            tone: client.debt > 0 ? "red" : "gray",
          },
        ]}
      />

      {/* Tabs */}
      <div className="mt-1 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative -mb-px px-3 py-2 text-[13px] font-semibold transition-colors",
              tab === t.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "border-b-2 border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 pt-3">
        {tab === "rentals" && <RentalsTab d={d} />}
        {tab === "instalments" && <InstalmentsTab d={d} />}
        {tab === "incidents" && <IncidentsTab d={d} />}
        {tab === "docs" && <DocsTab client={client} d={d} />}
        {tab === "rhist" && <RatingTab d={d} />}
      </div>

      {editOpen && (
        <AddClientModal editing={client} onClose={() => setEditOpen(false)} />
      )}

      {pendingFiles && pendingFiles.length > 0 && (
        <SequentialNamingModal
          files={pendingFiles}
          onComplete={(named) => {
            clientStore.addExtraDocs(client.id, named);
            setPendingFiles(null);
            setTab("docs");
          }}
          onCancel={() => setPendingFiles(null)}
        />
      )}
    </div>
  );
}

function KpiRow({
  group,
  items,
}: {
  group: string;
  items: {
    label: string;
    value: string;
    hint: string;
    tone: "neutral" | "green" | "gray" | "red";
  }[];
}) {
  return (
    <div className="flex items-stretch gap-3">
      <div className="flex w-[84px] shrink-0 items-center text-[11px] font-semibold uppercase tracking-wider text-muted-2">
        {group}
      </div>
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "min-w-0 flex-1 rounded-[14px] px-3 py-2.5",
            it.tone === "green"
              ? "bg-green-soft/60"
              : it.tone === "red"
                ? "bg-red-soft/60"
                : it.tone === "gray"
                  ? "bg-surface-soft"
                  : "bg-blue-50",
          )}
        >
          <div className="text-[11px] font-semibold text-muted-2">
            {it.label}
          </div>
          <div className="mt-0.5 font-display text-[20px] font-extrabold leading-none text-ink">
            {it.value}
          </div>
          <div className="mt-1 text-[11px] text-muted-2">{it.hint}</div>
        </div>
      ))}
    </div>
  );
}
