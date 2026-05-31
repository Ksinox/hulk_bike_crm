import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Search } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { cn } from "@/lib/utils";
import {
  useApplications,
  useRestoreApplication,
  type ApiApplication,
  type ApplicationStatus,
} from "@/lib/api/clientApplications";
import { ApplicationsList } from "./ApplicationsList";
import { NewApplicationModal } from "@/pages/clients/NewApplicationModal";
import { AddClientModal } from "@/pages/clients/AddClientModal";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { applicationToFormInit } from "@/pages/clients/applicationConvert";
import { RejectApplicationModal } from "./RejectApplicationModal";
import { useRejectApplication, useSpamApplication } from "@/lib/api/clientApplications";
import { toast, confirmDialog } from "@/lib/toast";

/**
 * Страница «Заявки» — архив всех публичных анкет с фильтрами и поиском.
 *
 * Табы — фильтр по статусу: Новые / Принятые / Отклонённые / Спам / Все.
 * Поиск работает по ФИО / телефону / паспорту через ilike на бэке.
 *
 * Конкретная анкета открывается в полноэкранной NewApplicationModal —
 * та же что и из дашборд-виджета. Из неё доступны действия: оформить /
 * отклонить / пометить как спам / позже.
 */

type Tab = "new" | "accepted" | "rejected" | "spam" | "all";

const TABS: { id: Tab; label: string; statusFilter: string }[] = [
  { id: "new", label: "Новые", statusFilter: "active" },
  { id: "accepted", label: "Принятые", statusFilter: "accepted" },
  { id: "rejected", label: "Отклонённые", statusFilter: "rejected" },
  { id: "spam", label: "Спам", statusFilter: "spam" },
  { id: "all", label: "Все", statusFilter: "all" },
];

export function Applications() {
  const [tab, setTab] = useState<Tab>("new");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [convertingApp, setConvertingApp] = useState<ApiApplication | null>(null);
  const [rejectingApp, setRejectingApp] = useState<ApiApplication | null>(null);
  const [rejectMode, setRejectMode] = useState<"reject" | "spam">("reject");
  // G3: после конвертации заявки в клиента — сразу предлагаем создать аренду
  // (поток заявка → клиент → аренда → выбор скутера, без поиска клиента заново).
  const [rentalPrefill, setRentalPrefill] = useState<{
    clientId: number;
    modelFilter?: string;
    days?: number;
    equipmentIds?: number[];
    start?: string;
  } | null>(null);

  // Debounce поиска — 200ms.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [search]);

  const tabConfig = TABS.find((t) => t.id === tab) ?? TABS[0]!;
  const listQ = useApplications({
    status: tabConfig.statusFilter,
    q: debouncedSearch,
    poll: tab === "new",
  });

  const restoreMut = useRestoreApplication();
  const rejectMut = useRejectApplication();
  const spamMut = useSpamApplication();

  const items = listQ.data ?? [];
  const openApp = openId != null ? items.find((a) => a.id === openId) ?? null : null;

  const counters = useMemo(() => {
    // Грубо считаем по тому что в кэше — но реально нужен отдельный
    // лёгкий запрос с count'ами. Пока показываем «N» только для текущего
    // таба + новые из polling-данных.
    return { current: items.length };
  }, [items]);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-[34px] font-extrabold leading-none text-ink">
            <Inbox size={28} className="text-blue-600" />
            Заявки
          </h1>
          <div className="mt-1.5 text-[13px] text-muted-2">
            Все анкеты клиентов с публичной ссылки. Можно искать по ФИО,
            телефону и паспорту.
          </div>
        </div>
        <div className="relative w-[320px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: ФИО, телефон, паспорт…"
            className="h-10 w-full rounded-[12px] border border-border bg-surface pl-9 pr-3 text-[13px] outline-none focus:border-blue-600"
          />
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
              tab === t.id
                ? "bg-ink text-white"
                : "bg-surface text-muted ring-1 ring-border hover:bg-blue-50 hover:text-blue-700",
            )}
          >
            {t.label}
            {tab === t.id && counters.current > 0 && (
              <span className="ml-1.5 text-white/70">· {counters.current}</span>
            )}
          </button>
        ))}
      </div>

      <ApplicationsList
        items={items}
        loading={listQ.isLoading}
        onOpen={(id) => setOpenId(id)}
        onRestore={async (id) => {
          await restoreMut.mutateAsync(id);
          toast.success("Заявка возвращена в «Новые»");
        }}
      />

      {openApp && (
        <NewApplicationModal
          application={openApp}
          onLater={() => setOpenId(null)}
          onConvertNow={() => {
            setOpenId(null);
            setConvertingApp(openApp);
          }}
          onReject={() => {
            setRejectingApp(openApp);
            setRejectMode("reject");
            setOpenId(null);
          }}
          onSpam={() => {
            setRejectingApp(openApp);
            setRejectMode("spam");
            setOpenId(null);
          }}
        />
      )}

      {convertingApp && (
        <AddClientModal
          applicationId={convertingApp.id}
          initialData={applicationToFormInit(convertingApp)}
          onClose={() => setConvertingApp(null)}
          onCreated={(client) => {
            // G3: клиент из заявки заведён → предлагаем сразу создать аренду
            // с предзаполненными моделью/сроком из заявки (если клиент их указал).
            const app = convertingApp;
            setConvertingApp(null);
            toast.success("Клиент оформлен");
            const modelFilter = app?.requestedModel ?? undefined;
            const days = app?.requestedDays ?? undefined;
            const equipmentIds = app?.requestedEquipmentIds ?? undefined;
            const start = app?.requestedStartDate ?? undefined;
            void confirmDialog({
              title: "Клиент создан",
              message: `Оформить аренду для «${client.name}»? Останется выбрать конкретный скутер и распечатать договор.`,
              confirmText: "Оформить аренду",
              cancelText: "Позже",
            }).then((ok) => {
              if (ok)
                setRentalPrefill({
                  clientId: client.id,
                  modelFilter,
                  days,
                  equipmentIds,
                  start,
                });
            });
          }}
        />
      )}

      {rentalPrefill && (
        <NewRentalModal
          initialClientId={rentalPrefill.clientId}
          initialModelFilter={rentalPrefill.modelFilter}
          initialDays={rentalPrefill.days}
          initialEquipmentIds={rentalPrefill.equipmentIds}
          initialStart={rentalPrefill.start}
          onClose={() => setRentalPrefill(null)}
          onCreated={() => {
            setRentalPrefill(null);
            toast.success("Аренда создана");
          }}
        />
      )}

      {rejectingApp && (
        <RejectApplicationModal
          application={rejectingApp}
          mode={rejectMode}
          onClose={() => setRejectingApp(null)}
          onConfirm={async (input) => {
            try {
              if (rejectMode === "spam") {
                await spamMut.mutateAsync({
                  id: rejectingApp.id,
                  input,
                });
                toast.success("Помечено как спам");
              } else {
                await rejectMut.mutateAsync({
                  id: rejectingApp.id,
                  input,
                });
                toast.success("Заявка отклонена");
              }
            } finally {
              setRejectingApp(null);
            }
          }}
        />
      )}
    </main>
  );
}

export type { ApplicationStatus };
