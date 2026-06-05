import { useState } from "react";
import {
  HardDrive,
  Database,
  Folder,
  FileText,
  ChevronRight,
  ArrowLeft,
  Download,
  Loader2,
  Image as ImageIcon,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import {
  useStorageStats,
  useStorageList,
  type StorageCategory,
} from "@/lib/api/storage";

function fmtBytes(n: number | null | undefined): string {
  const b = Number(n ?? 0);
  if (b < 1024) return `${b} Б`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} МБ`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} ГБ`;
}

const CAT_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-orange-500",
  "bg-purple-500",
  "bg-red-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-amber-500",
];

function isImageName(n: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(n);
}
function isVideoName(n: string): boolean {
  return /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(n);
}

export function StoragePage() {
  const stats = useStorageStats();
  const [prefix, setPrefix] = useState("");
  const listing = useStorageList(prefix);

  const s = stats.data;
  const disk = s?.disk ?? null;
  const dbSize = s?.db.size ?? 0;
  const filesSize = s?.files.size ?? 0;
  // «Прочее/система» = диск − БД − файлы − свободно (то, что не наше).
  const other = disk
    ? Math.max(0, disk.used - dbSize - filesSize)
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-1 py-1">
      <div>
        <h1 className="font-display text-[22px] font-extrabold text-ink">
          Хранилище
        </h1>
        <p className="mt-0.5 text-[13px] text-muted">
          Сколько места занимает база и файлы, и что лежит в хранилище.
        </p>
      </div>

      {/* === Сводка места === */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Database size={18} />}
          tone="blue"
          label="База данных"
          value={fmtBytes(dbSize)}
          hint="Аренды, клиенты, платежи, история"
        />
        <StatCard
          icon={<HardDrive size={18} />}
          tone="green"
          label="Файлы"
          value={fmtBytes(filesSize)}
          hint={`${s?.files.count ?? 0} файлов в «${s?.bucket ?? "—"}»`}
        />
        <StatCard
          icon={<HardDrive size={18} />}
          tone="ink"
          label="Диск сервера"
          value={disk ? fmtBytes(disk.free) : "—"}
          hint={
            disk ? `свободно из ${fmtBytes(disk.total)}` : "недоступно"
          }
        />
      </div>

      {/* === Полоса заполнения диска === */}
      {disk && disk.total > 0 && (
        <div className="rounded-[14px] bg-surface p-4 shadow-card-sm">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="font-bold text-ink">Заполнение диска</span>
            <span className="text-muted">
              занято {fmtBytes(disk.used)} из {fmtBytes(disk.total)}
            </span>
          </div>
          <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-surface-soft">
            <Seg
              w={dbSize / disk.total}
              className="bg-blue-500"
              title={`База: ${fmtBytes(dbSize)}`}
            />
            <Seg
              w={filesSize / disk.total}
              className="bg-green-500"
              title={`Файлы: ${fmtBytes(filesSize)}`}
            />
            <Seg
              w={other / disk.total}
              className="bg-muted-2"
              title={`Система/прочее: ${fmtBytes(other)}`}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <Legend className="bg-blue-500" label={`База ${fmtBytes(dbSize)}`} />
            <Legend
              className="bg-green-500"
              label={`Файлы ${fmtBytes(filesSize)}`}
            />
            <Legend
              className="bg-muted-2"
              label={`Система/прочее ${fmtBytes(other)}`}
            />
            <Legend
              className="bg-surface-soft ring-1 ring-inset ring-border"
              label={`Свободно ${fmtBytes(disk.free)}`}
            />
          </div>
        </div>
      )}

      {/* === Разбивка файлов по категориям === */}
      <div className="rounded-[14px] bg-surface p-4 shadow-card-sm">
        <div className="mb-3 text-[13px] font-bold text-ink">
          Файлы по категориям
        </div>
        {stats.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
            <Loader2 size={15} className="animate-spin" /> Считаем объём…
          </div>
        ) : (s?.files.byCategory.length ?? 0) === 0 ? (
          <div className="py-6 text-center text-[13px] text-muted-2">
            Файлов пока нет.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {s!.files.byCategory.map((c, i) => (
              <CategoryRow
                key={c.key}
                cat={c}
                total={filesSize}
                color={CAT_COLORS[i % CAT_COLORS.length]!}
              />
            ))}
          </div>
        )}
      </div>

      {/* === Файловый браузер === */}
      <div className="rounded-[14px] bg-surface p-4 shadow-card-sm">
        <div className="mb-3 flex items-center gap-2">
          <Folder size={15} className="text-muted-2" />
          <span className="text-[13px] font-bold text-ink">Файлы</span>
        </div>
        {/* Хлебные крошки */}
        <div className="mb-3 flex flex-wrap items-center gap-1 text-[12px]">
          <button
            type="button"
            onClick={() => setPrefix("")}
            className={cn(
              "rounded-md px-1.5 py-0.5 font-semibold",
              prefix === "" ? "text-ink" : "text-blue-600 hover:bg-blue-50",
            )}
          >
            корень
          </button>
          {prefix
            .split("/")
            .filter(Boolean)
            .map((part, idx, arr) => {
              const upto = arr.slice(0, idx + 1).join("/") + "/";
              const isLast = idx === arr.length - 1;
              return (
                <span key={upto} className="flex items-center gap-1">
                  <ChevronRight size={12} className="text-muted-2" />
                  <button
                    type="button"
                    onClick={() => setPrefix(upto)}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-semibold",
                      isLast
                        ? "text-ink"
                        : "text-blue-600 hover:bg-blue-50",
                    )}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
        </div>

        {prefix !== "" && (
          <button
            type="button"
            onClick={() => {
              const parts = prefix.split("/").filter(Boolean);
              parts.pop();
              setPrefix(parts.length ? parts.join("/") + "/" : "");
            }}
            className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-surface-soft px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:bg-border"
          >
            <ArrowLeft size={13} /> Назад
          </button>
        )}

        {listing.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-[13px] text-muted">
            <Loader2 size={15} className="animate-spin" /> Загрузка…
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {listing.data?.folders.map((f) => (
              <button
                key={f.prefix}
                type="button"
                onClick={() => setPrefix(f.prefix)}
                className="flex items-center gap-3 py-2.5 text-left hover:bg-surface-soft"
              >
                <Folder size={18} className="shrink-0 text-blue-500" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                  {f.label ?? f.name}
                  {f.label && (
                    <span className="ml-1.5 font-mono text-[11px] text-muted-2">
                      {f.name}
                    </span>
                  )}
                </span>
                <ChevronRight size={15} className="shrink-0 text-muted-2" />
              </button>
            ))}
            {listing.data?.files.map((file) => {
              const img = isImageName(file.name);
              const vid = isVideoName(file.name);
              const href = fileUrl(file.key, img ? { variant: "view" } : {});
              return (
                <a
                  key={file.key}
                  href={href ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 py-2.5 hover:bg-surface-soft"
                >
                  {img ? (
                    <img
                      src={fileUrl(file.key, { variant: "thumb" }) ?? undefined}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-inset ring-border"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-soft text-muted-2">
                      {vid ? <Film size={16} /> : <FileText size={16} />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted">
                    {fmtBytes(file.size)}
                  </span>
                  <Download size={15} className="shrink-0 text-muted-2" />
                </a>
              );
            })}
            {!listing.isLoading &&
              (listing.data?.folders.length ?? 0) === 0 &&
              (listing.data?.files.length ?? 0) === 0 && (
                <div className="py-6 text-center text-[13px] text-muted-2">
                  Пусто.
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

function Seg({
  w,
  className,
  title,
}: {
  w: number;
  className: string;
  title: string;
}) {
  const pct = Math.max(0, Math.min(100, w * 100));
  if (pct <= 0) return null;
  return (
    <div
      className={className}
      style={{ width: `${pct}%` }}
      title={title}
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  tone: "blue" | "green" | "ink";
  label: string;
  value: string;
  hint: string;
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "green"
        ? "bg-green-soft text-green-ink"
        : "bg-surface-soft text-ink-2";
  return (
    <div className="rounded-[14px] bg-surface p-4 shadow-card-sm">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[10px]",
            toneClass,
          )}
        >
          {icon}
        </span>
        <span className="text-[12px] font-bold uppercase tracking-wider text-muted-2">
          {label}
        </span>
      </div>
      <div className="mt-2 font-display text-[24px] font-extrabold tabular-nums text-ink">
        {value}
      </div>
      <div className="mt-0.5 text-[12px] text-muted">{hint}</div>
    </div>
  );
}

function CategoryRow({
  cat,
  total,
  color,
}: {
  cat: StorageCategory;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (cat.size / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="flex items-center gap-2 font-semibold text-ink">
          {isImageCat(cat.key) ? (
            <ImageIcon size={13} className="text-muted-2" />
          ) : (
            <FileText size={13} className="text-muted-2" />
          )}
          {cat.label}
        </span>
        <span className="tabular-nums text-muted">
          {fmtBytes(cat.size)} · {cat.count}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function isImageCat(key: string): boolean {
  return ["damages", "repairs", "scooters", "models", "equipment", "clients", "applications"].includes(
    key,
  );
}
