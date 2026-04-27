import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  FileText,
  Pencil,
  Phone,
  PhoneOff,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getClientDetails,
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
import {
  clientStore,
  useClientExtraPhone,
  useClientUnreachable,
} from "./clientStore";
import type { UploadedFile } from "./DocUpload";
import { ClientPhoto } from "./ClientPhoto";
import { CreateDealMenu } from "./CreateDealMenu";
import {
  getActiveRentalByClient,
  useRentalsByClient,
} from "@/pages/rentals/rentalsStore";
import { navigate } from "@/app/navigationStore";

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

function daysWord(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "день";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "дня";
  return "дней";
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
  const phone2 = useClientExtraPhone(client.id);
  const unreachable = useClientUnreachable(client.id);
  const rentalsForClient = useRentalsByClient(client.id);
  const activeRental = useMemo(
    () => getActiveRentalByClient(client.id, rentalsForClient),
    [client.id, rentalsForClient],
  );
  // сумма всех арендных дней по истории
  const totalRentedDays = useMemo(
    () => rentalsForClient.reduce((s, r) => s + (r.days || 0), 0),
    [rentalsForClient],
  );
  const totalTurnover = useMemo(
    () => rentalsForClient.reduce((s, r) => s + (r.sum || 0), 0),
    [rentalsForClient],
  );

  /**
   * Остаток по клиенту — сумма накопленных штрафов за просрочки.
   * Формула: за каждый день просрочки возврата начисляется
   * (ставка тарифа + 250 ₽). Считается по всем арендам в статусе overdue.
   */
  const overdueBalance = useMemo(() => {
    const today = new Date();
    let total = 0;
    for (const r of rentalsForClient) {
      if (r.status !== "overdue") continue;
      const m = r.endPlanned.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!m) continue;
      const end = new Date(+m[3], +m[2] - 1, +m[1]);
      const days = Math.max(
        0,
        Math.round((today.getTime() - end.getTime()) / 86400000),
      );
      total += days * (r.rate + 250);
    }
    return total;
  }, [rentalsForClient]);

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

      {/* Top row: photo (tall) + right column */}
      <div className="flex items-start gap-4">
        <ClientPhoto client={client} size="xl" />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <header className="flex items-start gap-3">
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
                {unreachable && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-bold text-orange-ink">
                    <PhoneOff size={12} /> Не выходит на связь
                  </span>
                )}
                {activeRental && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ route: "rentals", rentalId: activeRental.id })
                    }
                    className="inline-flex items-center rounded-full bg-green-soft px-2 py-0.5 text-[11px] font-bold text-green-ink transition-colors hover:bg-green/20"
                    title="Открыть аренду"
                  >
                    аренда {activeRental.scooter}
                  </button>
                )}
              </div>
              <div className="mt-1 text-[12px] text-muted-2">
                id #{String(client.id).padStart(4, "0")} · добавлен{" "}
                {client.added} · источник: {SOURCE_LABEL[client.source]}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <PhoneDisplay phone={client.phone} primary />
                {phone2 && <PhoneDisplay phone={phone2} extra />}
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() =>
                  clientStore.setUnreachable(client.id, !unreachable)
                }
                title={
                  unreachable
                    ? "Снять метку «Не выходит на связь»"
                    : "Отметить, что клиент не выходит на связь"
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  unreachable
                    ? "bg-orange-soft text-orange-ink hover:bg-orange/20"
                    : "bg-surface-soft text-ink hover:bg-border",
                )}
              >
                <PhoneOff size={13} />
                {unreachable ? "Снять: не на связи" : "Не на связи"}
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-border"
              >
                <Pencil size={13} /> Редактировать
              </button>
              <button
                type="button"
                onClick={() => {
                  const base =
                    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
                    "http://localhost:4000";
                  window.open(
                    `${base}/api/clients/${client.id}/statement?format=html`,
                    "_blank",
                    "noopener",
                  );
                }}
                className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-border"
                title="Финансовая выписка по клиенту — для суда / претензий"
              >
                <FileText size={13} /> Выписка
              </button>
              <CreateDealMenu client={client} />
            </div>
          </header>

          {/* KPIs — 2x2 слева + общий долг справа во всю высоту */}
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
            <div className="grid grid-cols-2 gap-3">
              <KpiBox
                label="Оборот"
                value={
                  totalTurnover > 0 ? `${fmt(totalTurnover)} ₽` : "—"
                }
                hint="за всё время"
                tone={totalTurnover > 0 ? "green" : "gray"}
              />
              <KpiBox
                label="Оплата в день"
                value={activeRental ? `${fmt(activeRental.rate)} ₽` : "—"}
                hint={
                  activeRental ? "действует сейчас" : "нет активной аренды"
                }
                tone={activeRental ? "neutral" : "gray"}
              />
              <KpiBox
                label="Дней в аренде"
                value={
                  totalRentedDays > 0
                    ? `${totalRentedDays} ${daysWord(totalRentedDays)}`
                    : "—"
                }
                hint="суммарно по истории"
                tone={totalRentedDays > 0 ? "neutral" : "gray"}
              />
              <KpiBox
                label="Рейтинг"
                value={String(client.rating)}
                hint={tier.label.toLowerCase()}
                tone={
                  tier.tone === "good"
                    ? "green"
                    : tier.tone === "bad"
                      ? "red"
                      : "neutral"
                }
              />
            </div>
            <KpiBox
              label="Остаток"
              value={overdueBalance > 0 ? `${fmt(overdueBalance)} ₽` : ""}
              hint={
                overdueBalance > 0
                  ? "просрочка: тариф + 250 ₽/день"
                  : "нет просрочек"
              }
              tone={overdueBalance > 0 ? "red" : "gray"}
              fill
            />
          </div>
        </div>
      </div>

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
        {tab === "rentals" && <RentalsTab client={client} />}
        {tab === "instalments" && <InstalmentsTab d={d} />}
        {tab === "incidents" && <IncidentsTab d={d} />}
        {tab === "docs" && <DocsTab key={client.id} client={client} d={d} />}
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

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fallthrough */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function PhoneDisplay({
  phone,
  primary,
  extra,
}: {
  phone: string;
  primary?: boolean;
  extra?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyText(phone);
    if (!ok) console.warn("clipboard copy failed (sandbox?)");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <a
        href={`tel:${phone.replace(/\s/g, "")}`}
        className={cn(
          "inline-flex items-center gap-1.5 tabular-nums transition-colors hover:text-blue-600",
          primary && "text-[16px] font-bold text-ink",
          extra && "text-[14px] font-semibold text-ink-2",
        )}
        title={extra ? "Дополнительный контакт" : "Позвонить"}
      >
        <Phone
          size={primary ? 14 : 12}
          className={primary ? "text-blue-600" : "text-muted-2"}
        />
        {phone}
      </a>
      {extra && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
          доп
        </span>
      )}
      <span className="relative inline-block">
        <button
          type="button"
          onClick={handleCopy}
          title="Скопировать номер"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
            copied
              ? "bg-green-soft text-green-ink"
              : "text-muted-2 hover:bg-surface-soft hover:text-ink",
          )}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>

        {copied && (
          <span
            className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2"
            aria-live="polite"
          >
            <span className="inline-flex animate-toast-in items-center gap-1 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white shadow-card">
              <Check size={11} className="text-green-soft" />
              Скопировано
            </span>
          </span>
        )}
      </span>
    </div>
  );
}

function KpiBox({
  label,
  value,
  hint,
  tone,
  fill,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "neutral" | "green" | "gray" | "red";
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-[14px] px-3 py-2.5",
        fill && "h-full justify-between",
        tone === "green"
          ? "bg-green-soft/60"
          : tone === "red"
            ? "bg-red-soft/60"
            : tone === "gray"
              ? "bg-surface-soft"
              : "bg-blue-50",
      )}
    >
      <div className="text-[11px] font-semibold text-muted-2">{label}</div>
      {value && (
        <div className="mt-0.5 font-display text-[20px] font-extrabold leading-none text-ink">
          {value}
        </div>
      )}
      <div className={cn("text-[11px] text-muted-2", value ? "mt-1" : "mt-0.5")}>
        {hint}
      </div>
    </div>
  );
}
