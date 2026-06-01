import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronLeft,
  Copy,
  FileText,
  Pencil,
  Phone,
  PhoneOff,
  Scale,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getClientDetails, SOURCE_LABEL, type Client } from "@/lib/mock/clients";
import {
  RentalsTab,
  InstalmentsTab,
  IncidentsTab,
  DocsTab,
} from "@/pages/clients/ClientCardTabs";
import { AddClientModal } from "@/pages/clients/AddClientModal";
import {
  clientStore,
  useClientExtraPhone,
  useClientUnreachable,
} from "@/pages/clients/clientStore";
import { ClientPhoto } from "@/pages/clients/ClientPhoto";
import { EntityNotes } from "@/components/EntityNotes";
import { CreateDealMenu } from "@/pages/clients/CreateDealMenu";
import { useActivityTimeline } from "@/lib/api/activity";
import { useClientStats } from "@/lib/useClientStats";
import { ActivityTimelineSection } from "@/pages/rentals/ActivityTimelineSection";
import { useDashboardDrawer } from "@/pages/dashboard/DashboardDrawer";
import { useApplicationsByClient } from "@/lib/api/clientApplications";
import { NewApplicationModal } from "@/pages/clients/NewApplicationModal";
import { ClientDebtorsTab } from "@/pages/clients/ClientDebtorsTab";
import {
  getActiveRentalByClient,
  useRentalsByClient,
} from "@/pages/rentals/rentalsStore";
import { navigate } from "@/app/navigationStore";
import type { CardTab } from "@/pages/clients/ClientCard";

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

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
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
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Мобильная карточка клиента — отдельный нативный экран (не переиспользование
 * десктопной ClientCard). Те же данные/хуки и под-компоненты табов, но
 * вертикальная мобильная вёрстка: герой с аватаром среднего размера, телефоны
 * с «позвонить/копировать», быстрые действия, KPI 2×N, плашки долгов, заметки,
 * табы лентой. Бизнес-логика денег не дублируется — открывает те же экраны.
 */
export function MobileClientCard({
  client,
  onBack,
}: {
  client: Client;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<CardTab>("rentals");
  const [editOpen, setEditOpen] = useState(false);
  const [appPreviewOpen, setAppPreviewOpen] = useState(false);
  const d = useMemo(() => getClientDetails(client), [client]);
  const phone2 = useClientExtraPhone(client.id);
  const unreachable = useClientUnreachable(client.id);
  const applicationsQ = useApplicationsByClient(client.id);
  const sourceApplication = applicationsQ.data?.[0] ?? null;
  const rentalsForClient = useRentalsByClient(client.id);
  const drawer = useDashboardDrawer();
  const activeRental = useMemo(
    () => getActiveRentalByClient(client.id, rentalsForClient),
    [client.id, rentalsForClient],
  );
  const { totalPaid: totalTurnover, totalDays: totalRentedDays } =
    useClientStats(client.id);
  const deposit = client.depositBalance ?? 0;

  const debtorCases = client.debtorCases ?? [];
  const activeDebtor = debtorCases.find((c) => c.active) ?? null;

  const tabs: { id: CardTab; label: string }[] = [
    { id: "rentals", label: "Аренды" },
    ...(debtorCases.length > 0
      ? [{ id: "debtor" as CardTab, label: "Долговая история" }]
      : []),
    { id: "timeline", label: "Лента событий" },
    { id: "instalments", label: "Рассрочки" },
    { id: "incidents", label: "Инциденты" },
    { id: "docs", label: "Документы" },
  ];

  return (
    <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-bg">
      {/* Шапка экрана: назад · «Клиент» · редактировать */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-surface-soft"
          aria-label="Назад"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-bold text-ink">
          Клиент
        </h1>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-surface-soft"
          aria-label="Редактировать"
        >
          <Pencil size={19} />
        </button>
      </header>

      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3 pb-8 overscroll-contain">
        {/* ===== Герой: аватар + имя + бейджи + телефоны ===== */}
        <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
          <div className="flex items-start gap-3.5">
            <ClientPhoto client={client} size="lg" />
            <div className="min-w-0 flex-1">
              <h2
                className={cn(
                  "font-display text-[20px] font-extrabold leading-tight text-ink",
                  client.blacklisted && "line-through decoration-red/60",
                )}
              >
                {client.name}
              </h2>
              <div className="mt-1 text-[11px] text-muted-2">
                id #{String(client.id).padStart(4, "0")} · {client.added} ·{" "}
                {SOURCE_LABEL[client.source]}
              </div>
              {/* Бейджи статусов */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {client.blacklisted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-soft px-2 py-0.5 text-[11px] font-bold text-red-ink">
                    <Ban size={12} /> Чёрный список
                  </span>
                )}
                {unreachable && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-bold text-orange-ink">
                    <PhoneOff size={12} /> Не на связи
                  </span>
                )}
                {activeRental && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ route: "rentals", rentalId: activeRental.id })
                    }
                    className="inline-flex items-center rounded-full bg-green-soft px-2 py-0.5 text-[11px] font-bold text-green-ink active:bg-green/20"
                  >
                    аренда {activeRental.scooter}
                  </button>
                )}
                {activeDebtor && (
                  <button
                    type="button"
                    onClick={() => setTab("debtor")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      activeDebtor.problem
                        ? "bg-red-soft text-red-ink"
                        : "bg-orange-soft text-orange-ink",
                    )}
                  >
                    {activeDebtor.problem ? (
                      <>
                        <AlertTriangle size={12} /> Проблемный
                      </>
                    ) : (
                      <>
                        <Scale size={12} /> Должник
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {sourceApplication && (
            <button
              type="button"
              onClick={() => setAppPreviewOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 active:bg-blue-100"
            >
              <Inbox size={12} />
              Через заявку #{sourceApplication.id}
              {sourceApplication.submittedAt && (
                <span className="text-blue-700/70">
                  · {formatShortDate(sourceApplication.submittedAt)}
                </span>
              )}
            </button>
          )}

          {/* Телефоны — крупно, тач-таргеты «позвонить» / «копировать» */}
          <div className="mt-3 space-y-1.5">
            <PhoneRow phone={client.phone} primary />
            {phone2 && <PhoneRow phone={phone2} />}
          </div>

          {/* KPI упакованы в герой (заполняют пустое место под телефоном). */}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            <Kpi
              label="Оборот"
              value={totalTurnover > 0 ? `${fmt(totalTurnover)} ₽` : "—"}
              tone={totalTurnover > 0 ? "green" : "gray"}
            />
            <Kpi
              label="Оплата / день"
              value={activeRental ? `${fmt(activeRental.rate)} ₽` : "—"}
              tone={activeRental ? "blue" : "gray"}
            />
            <Kpi
              label="Дней в аренде"
              value={
                totalRentedDays > 0
                  ? `${totalRentedDays} ${daysWord(totalRentedDays)}`
                  : "—"
              }
              tone={totalRentedDays > 0 ? "blue" : "gray"}
            />
            <Kpi
              label="Депозит"
              value={deposit > 0 ? `${fmt(deposit)} ₽` : "0 ₽"}
              tone={deposit > 0 ? "green" : "gray"}
            />
          </div>
        </section>

        {/* ===== Важные действия: Не на связи + Создать сделку ===== */}
        <section className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => clientStore.setUnreachable(client.id, !unreachable)}
            className={cn(
              "flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold active:scale-[0.99]",
              unreachable
                ? "bg-orange-soft text-orange-ink"
                : "bg-surface text-ink shadow-card-sm",
            )}
          >
            <PhoneOff size={15} />
            {unreachable ? "На связи" : "Не на связи"}
          </button>
          <CreateDealMenu client={client} />
        </section>

        {/* ===== Плашки ===== */}
        {client.blacklisted && (
          <Banner tone="red" icon={<Ban size={16} />}>
            <b>Клиент в чёрном списке.</b> Причина: {d.blReason || "—"}
            <span className="ml-1 text-[11px] opacity-70">
              {d.blDate} · {d.blBy}
            </span>
          </Banner>
        )}
        {(client.unpaidDamageDebt ?? 0) > 0 && (
          <Banner tone="red" icon={<AlertTriangle size={16} />}>
            <b>Долг по ущербу: {fmt(client.unpaidDamageDebt ?? 0)} ₽</b>
            <div className="text-[12px] opacity-80">
              по всем актам клиента (включая завершённые аренды)
            </div>
          </Banner>
        )}
        {client.debt > 0 && (
          <Banner tone="orange" icon={<AlertTriangle size={16} />}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <b>Долг: {fmt(client.debt)} ₽</b>
                <div className="text-[12px] opacity-80">
                  {client.comment || "по последней аренде"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const target =
                    activeRental ??
                    rentalsForClient
                      .slice()
                      .sort((a, b) => b.id - a.id)
                      .find((r) => (r.sum ?? 0) > 0);
                  if (!target) return;
                  if (drawer.inDrawer) drawer.openRental(target.id);
                  else
                    navigate({
                      route: "rentals",
                      rentalId: target.id,
                      openTab: "debt",
                    });
                }}
                disabled={!activeRental && rentalsForClient.length === 0}
                className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-orange-ink shadow-card-sm active:scale-95 disabled:opacity-50"
              >
                Записать оплату
              </button>
            </div>
          </Banner>
        )}

        {/* ===== Заметки ===== */}
        <section className="rounded-2xl border border-border bg-surface-soft/40 p-3">
          <EntityNotes entity="client" entityId={client.id} />
        </section>

        {/* ===== Табы пилюлями (Apple-style segmented, прокручиваемые) ===== */}
        <div className="no-scrollbar -mx-3 overflow-x-auto px-3">
          <div className="flex w-max gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  tab === t.id
                    ? "bg-ink text-white"
                    : "bg-surface-soft text-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <section>
          {tab === "rentals" && <RentalsTab client={client} />}
          {tab === "debtor" && <ClientDebtorsTab cases={debtorCases} />}
          {tab === "timeline" && <ClientTimelineTab clientId={client.id} />}
          {tab === "instalments" && <InstalmentsTab d={d} />}
          {tab === "incidents" && <IncidentsTab d={d} />}
          {tab === "docs" && <DocsTab key={client.id} client={client} d={d} />}
        </section>

        {/* ===== Выписка — второстепенное действие, в самом низу ===== */}
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
          className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-border text-[13px] font-semibold text-muted active:bg-surface-soft"
        >
          <FileText size={15} /> Финансовая выписка
        </button>
      </main>

      {editOpen && (
        <AddClientModal editing={client} onClose={() => setEditOpen(false)} />
      )}
      {appPreviewOpen && sourceApplication && (
        <NewApplicationModal
          application={sourceApplication}
          readOnly
          onLater={() => setAppPreviewOpen(false)}
          onConvertNow={() => setAppPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function PhoneRow({ phone, primary }: { phone: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <a
        href={`tel:${phone.replace(/\s/g, "")}`}
        className={cn(
          "flex min-h-[44px] flex-1 items-center gap-2 rounded-xl bg-surface-soft px-3 tabular-nums active:bg-border",
          primary
            ? "text-[16px] font-bold text-ink"
            : "text-[14px] font-semibold text-ink-2",
        )}
      >
        <Phone size={16} className="text-blue-600" />
        {phone}
        {!primary && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">
            доп
          </span>
        )}
      </a>
      <button
        type="button"
        onClick={async () => {
          await copyText(phone);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
        aria-label="Скопировать номер"
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
          copied ? "bg-green-soft text-green-ink" : "bg-surface-soft text-muted-2 active:bg-border",
        )}
      >
        {copied ? <Check size={18} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

// Компактная KPI-плитка — маленькая (по ТЗ: «не такие здоровые»).
function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "gray" | "red";
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl px-2.5 py-2",
        tone === "green"
          ? "bg-green-soft/60"
          : tone === "red"
            ? "bg-red-soft/60"
            : tone === "blue"
              ? "bg-blue-50"
              : "bg-surface-soft",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">
        {label}
      </div>
      <div className="mt-0.5 font-display text-[15px] font-extrabold leading-none text-ink">
        {value}
      </div>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "red" | "orange";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-2xl p-3 text-[13px]",
        tone === "red"
          ? "bg-red-soft/70 text-red-ink"
          : "bg-orange-soft/70 text-orange-ink",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ClientTimelineTab({ clientId }: { clientId: number }) {
  const q = useActivityTimeline("client", clientId);
  return (
    <ActivityTimelineSection
      items={q.data?.items ?? []}
      loading={q.isLoading}
    />
  );
}
