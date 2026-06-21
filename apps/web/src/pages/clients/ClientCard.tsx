import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Bike,
  Check,
  Copy,
  FileText,
  MessageCircle,
  Pencil,
  Phone,
  PhoneOff,
  Scale,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { whatsappLink, telegramLink } from "@/lib/messengers";
import {
  getClientDetails,
  SOURCE_LABEL,
  type Client,
} from "@/lib/mock/clients";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { toast, confirmDialog } from "@/lib/toast";
import {
  RentalsTab,
  InstalmentsTab,
  IncidentsTab,
  DocsTab,
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
import { EntityNotes } from "@/components/EntityNotes";
import { CreateDealMenu } from "./CreateDealMenu";
import { useActivityTimeline } from "@/lib/api/activity";
import { useClientStats } from "@/lib/useClientStats";
import { ActivityTimelineSection } from "@/pages/rentals/ActivityTimelineSection";
import { useDashboardDrawer } from "@/pages/dashboard/DashboardDrawer";
import {
  useApplicationsByClient,
  useClearRentalDraft,
} from "@/lib/api/clientApplications";
import { NewApplicationModal } from "./NewApplicationModal";
import { ClientDebtorsTab } from "./ClientDebtorsTab";
import { Inbox } from "lucide-react";
import {
  getActiveRentalByClient,
  useRentalsByClient,
} from "@/pages/rentals/rentalsStore";
import { navigate } from "@/app/navigationStore";

export type CardTab =
  | "rentals"
  | "debtor"
  | "timeline"
  | "instalments"
  | "incidents"
  | "docs";

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
  const phone2 = useClientExtraPhone(client.id);
  const unreachable = useClientUnreachable(client.id);
  // Заявки этого клиента (если оформлен через convert — будет одна).
  const applicationsQ = useApplicationsByClient(client.id);
  const sourceApplication = applicationsQ.data?.[0] ?? null;
  const [appPreviewOpen, setAppPreviewOpen] = useState(false);
  // Предзаявка на аренду из заявки: клиент уже создан, но аренду не
  // дооформили. Показываем баннер «продолжить / удалить». Черновик —
  // requested* поля заявки (живут на сервере, не теряются при закрытии).
  const rentalDraftApp =
    sourceApplication &&
    (sourceApplication.requestedModel != null ||
      sourceApplication.requestedDays != null ||
      (sourceApplication.requestedEquipmentIds?.length ?? 0) > 0 ||
      sourceApplication.requestedStartDate != null)
      ? sourceApplication
      : null;
  const [rentalDraftOpen, setRentalDraftOpen] = useState(false);
  const clearDraftMut = useClearRentalDraft();
  const removeRentalDraft = async () => {
    if (!rentalDraftApp) return;
    const ok = await confirmDialog({
      title: "Удалить предзаполненную аренду?",
      message:
        "Сбросим выбранные в заявке модель, срок и экипировку. Сам клиент и заявка останутся. Действие нельзя отменить.",
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    await clearDraftMut.mutateAsync(rentalDraftApp.id);
    toast.success("Предзаполненная аренда удалена");
  };
  const rentalsForClient = useRentalsByClient(client.id);
  const rentals = rentalsForClient;
  const drawer = useDashboardDrawer();
  const activeRental = useMemo(
    () => getActiveRentalByClient(client.id, rentalsForClient),
    [client.id, rentalsForClient],
  );
  // Единый источник статистики клиента (тот же, что в карточке аренды
  // и быстром просмотре): фактические дни в аренде (с учётом просрочки)
  // и реально оплаченное за всё время.
  const { totalPaid: totalTurnover, totalDays: totalRentedDays } =
    useClientStats(client.id);

  /**
   * Остаток по клиенту — сумма накопленных штрафов за просрочки.
   * v0.4.20: используем client.debt из clientStore.computeStats —
   * единая точка правды для долга по клиенту. Раньше здесь была
   * собственная формула (rate+250), статус только 'overdue', что
   * расходилось с банном «Есть непогашенный долг: 4500 ₽» снизу
   * (тот считается через client.debt = 1.5 × rate, active+past-due).
   * Из-за этого KpiBox «Остаток» писал «нет просрочек» при ненулевом
   * debt в банне.
   */
  const overdueBalance = client.debt ?? 0;

  // v0.6: дела-должники клиента (модуль «Должники»). Активное дело даёт
  // метку «Должник» и вкладку. Закрытые видны там же в истории дел.
  const debtorCases = client.debtorCases ?? [];
  const activeDebtor = debtorCases.find((c) => c.active) ?? null;
  const tabs: { id: CardTab; label: string }[] = [
    { id: "rentals", label: "Аренды" },
    ...(debtorCases.length > 0
      ? [{ id: "debtor" as CardTab, label: "Долговая история" }]
      : []),
    // v0.4.5: лента всех событий по клиенту — аренды, продления, акты,
    // долги, оплаты, события дел-должников. Связь клиент ↔ скутеры ↔ ремонты.
    { id: "timeline", label: "Лента событий" },
    { id: "instalments", label: "Рассрочки" },
    { id: "incidents", label: "Инциденты" },
    { id: "docs", label: "Документы" },
  ];

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

      {/* Top row: photo (tall) + right column.
          Мобайл (<sm): стек — фото сверху, инфо ниже на всю ширину (иначе
          в узкой колонке ФИО/телефон/кнопки разваливаются). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <ClientPhoto client={client} size="xl" />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* v0.4.9: ФИО — на собственной строке, кнопки действий ниже.
              Раньше всё умещалось в одну строку и в drawer-режиме длинные
              ФИО («Абдулазизов Нурулло Салижанович») разваливались на 4
              строки в узкую колонку рядом с кнопками. */}
          <header className="flex flex-col gap-3">
            <div className="min-w-0">
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
                {activeDebtor && (
                  <button
                    type="button"
                    onClick={() => setTab("debtor")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors",
                      activeDebtor.problem
                        ? "bg-red-soft text-red-ink hover:bg-red/20"
                        : "bg-orange-soft text-orange-ink hover:bg-orange/20",
                    )}
                    title="Открыть «Долговую историю» клиента"
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
              <div className="mt-1 text-[12px] text-muted-2">
                id #{String(client.id).padStart(4, "0")} · добавлен{" "}
                {client.added} · источник: {SOURCE_LABEL[client.source]}
              </div>
              {sourceApplication && (
                <button
                  type="button"
                  onClick={() => setAppPreviewOpen(true)}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                  title="Открыть исходную заявку клиента"
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
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <PhoneDisplay phone={client.phone} primary />
                {phone2 && <PhoneDisplay phone={phone2} extra />}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
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

          {/* KPIs — 2x2 слева + общий долг справа во всю высоту.
              Мобайл (<sm): в одну колонку (внутренняя сетка 2-кол на всю
              ширину читаема), иначе на 390px цифры наезжают. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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
            </div>
            <div className="flex h-full flex-col gap-2">
              <KpiBox
                label="Остаток"
                value={overdueBalance > 0 ? `${fmt(overdueBalance)} ₽` : ""}
                hint={
                  overdueBalance > 0
                    ? "просрочка: 1.5 × тариф/день"
                    : "нет просрочек"
                }
                tone={overdueBalance > 0 ? "red" : "gray"}
                fill
              />
              {/* v0.3.9: депозит — неиспользованные средства клиента */}
              <KpiBox
                label="Депозит"
                value={
                  (client.depositBalance ?? 0) > 0
                    ? `${fmt(client.depositBalance ?? 0)} ₽`
                    : "0 ₽"
                }
                hint={
                  (client.depositBalance ?? 0) > 0
                    ? "пойдёт в счёт следующей оплаты"
                    : "переплат пока нет"
                }
                tone={(client.depositBalance ?? 0) > 0 ? "green" : "gray"}
                fill
              />
            </div>
          </div>
        </div>
      </div>

      {/* Banners */}
      {/* Предзаполненную заявку показываем только если у клиента НЕТ активной
          аренды — иначе она не нужна (клиент уже катается). */}
      {rentalDraftApp && !activeRental && (
        <div className="flex items-start gap-2.5 rounded-[14px] bg-blue-50 p-3 text-[13px] text-blue-900 ring-1 ring-inset ring-blue-100">
          <Inbox size={16} className="mt-0.5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <b>Есть предзаполненная аренда из заявки.</b>
            <div className="mt-0.5 text-[12px] text-blue-900/80">
              {[
                rentalDraftApp.requestedModelName ??
                  (rentalDraftApp.requestedModel
                    ? ((MODEL_LABEL as Record<string, string>)[
                        rentalDraftApp.requestedModel
                      ] ?? rentalDraftApp.requestedModel)
                    : null),
                rentalDraftApp.requestedDays
                  ? `${rentalDraftApp.requestedDays} ${daysWord(rentalDraftApp.requestedDays)}`
                  : null,
                (rentalDraftApp.requestedEquipmentIds?.length ?? 0) > 0
                  ? `экипировка: ${rentalDraftApp.requestedEquipmentIds!.length} поз.`
                  : null,
                rentalDraftApp.requestedStartDate
                  ? `с ${rentalDraftApp.requestedStartDate.slice(8, 10)}.${rentalDraftApp.requestedStartDate.slice(5, 7)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "клиент указал пожелания в анкете"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRentalDraftOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-green px-3 py-1.5 text-[12px] font-bold text-white shadow-card-sm transition-colors hover:bg-green-ink"
              >
                <Bike size={13} /> Продолжить оформление аренды
              </button>
              <button
                type="button"
                onClick={removeRentalDraft}
                disabled={clearDraftMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-red-ink ring-1 ring-inset ring-red-100 transition-colors hover:bg-red-soft/50 disabled:opacity-50"
              >
                <Trash2 size={13} /> Удалить
              </button>
            </div>
          </div>
        </div>
      )}
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
      {/* v0.5.6: отдельная плашка по долгу за УЩЕРБ — агрегат по всем
          арендам клиента (включая завершённые). Это «висит на клиенте»
          поведение, которое заказчик просил: после завершения аренды с
          ущербом долг не теряется, а отображается на профиле клиента. */}
      {(client.unpaidDamageDebt ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-[14px] bg-red-soft/70 p-3 text-[13px] text-red-ink">
          <AlertTriangle size={16} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <b>
              Долг по ущербу: {fmt(client.unpaidDamageDebt ?? 0)} ₽
            </b>
            <span className="ml-2 text-[12px] text-red-ink/80">
              по всем актам клиента (включая завершённые аренды)
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
          {/* v0.4.9: кнопка теперь активна — открывает аренду на табе
              «История долгов», где оператор может принять платёж. Если
              у клиента есть активная аренда — её, иначе самую свежую. */}
          <button
            type="button"
            onClick={() => {
              const target =
                activeRental ??
                rentals
                  .slice()
                  .sort((a, b) => b.id - a.id)
                  .find((r) => (r.sum ?? 0) > 0);
              if (!target) return;
              if (drawer.inDrawer) {
                drawer.openRentalChain(target.id);
              } else {
                navigate({
                  route: "rentals",
                  rentalId: target.id,
                  openTab: "debt",
                });
              }
            }}
            disabled={!activeRental && rentals.length === 0}
            className="shrink-0 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-orange-ink shadow-card-sm transition-colors hover:bg-surface-soft disabled:opacity-50"
          >
            Записать оплату
          </button>
        </div>
      )}

      {/* v0.8.21: заметки клиента стикерами (включая комментарии по связи). */}
      <div className="rounded-[14px] border border-border bg-surface-soft/40 p-3">
        <EntityNotes entity="client" entityId={client.id} />
      </div>

      {/* Tabs */}
      <div className="mt-1 flex gap-1 border-b border-border">
        {tabs.map((t) => (
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
        {tab === "debtor" && <ClientDebtorsTab cases={debtorCases} />}
        {tab === "timeline" && <ClientTimelineTab clientId={client.id} />}
        {tab === "instalments" && <InstalmentsTab d={d} />}
        {tab === "incidents" && <IncidentsTab d={d} />}
        {tab === "docs" && <DocsTab key={client.id} client={client} d={d} />}
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

      {appPreviewOpen && sourceApplication && (
        <NewApplicationModal
          application={sourceApplication}
          readOnly
          onLater={() => setAppPreviewOpen(false)}
          onConvertNow={() => setAppPreviewOpen(false)}
        />
      )}

      {/* Продолжение оформления аренды из предзаявки клиента. Префилл —
          модель/срок/экипировка/дата из заявки. После создания гасим
          черновик (clear-rental-draft), чтобы баннер не висел. Договор
          откроется сам (единый flow NewRentalModal). */}
      {rentalDraftOpen && rentalDraftApp && (
        <NewRentalModal
          initialClientId={client.id}
          initialModelFilter={rentalDraftApp.requestedModel ?? undefined}
          initialDays={rentalDraftApp.requestedDays ?? undefined}
          initialEquipmentIds={rentalDraftApp.requestedEquipmentIds ?? undefined}
          initialStart={rentalDraftApp.requestedStartDate ?? undefined}
          onClose={() => setRentalDraftOpen(false)}
          onCreated={() => {
            setRentalDraftOpen(false);
            clearDraftMut.mutate(rentalDraftApp.id);
            toast.success("Аренда создана");
          }}
        />
      )}
    </div>
  );
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
      {/* Прямой чат по номеру — без сохранения контакта. */}
      <a
        href={whatsappLink(phone)}
        target="_blank"
        rel="noopener noreferrer"
        title="Написать в WhatsApp"
        className="flex h-6 w-6 items-center justify-center rounded-full text-green transition-colors hover:bg-green/10"
      >
        <MessageCircle size={13} />
      </a>
      <a
        href={telegramLink(phone)}
        target="_blank"
        rel="noopener noreferrer"
        title="Написать в Telegram"
        className="flex h-6 w-6 items-center justify-center rounded-full text-sky-600 transition-colors hover:bg-sky-50"
      >
        <Send size={13} />
      </a>
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

/**
 * v0.4.5: «Лента событий» в карточке клиента. Показывает все события
 * связанные с клиентом — аренды (со скутерами), продления, акты ущерба,
 * долги, оплаты. Источник — /api/activity/timeline?entity=client.
 */
function ClientTimelineTab({ clientId }: { clientId: number }) {
  const q = useActivityTimeline("client", clientId);
  return (
    <ActivityTimelineSection
      items={q.data?.items ?? []}
      loading={q.isLoading}
    />
  );
}
