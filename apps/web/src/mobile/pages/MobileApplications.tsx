import { useMemo, useState } from "react";
import { Inbox, Phone, ChevronRight, Check, X } from "lucide-react";
import {
  useApplications,
  useRejectApplication,
  REJECTION_REASON_LABEL,
  type ApiApplication,
  type ApplicationStatus,
  type RejectionReasonCode,
} from "@/lib/api/clientApplications";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { MobileNewClient } from "../forms/MobileNewClient";
import { ApplicationView } from "@/pages/applications/ApplicationView";
import type { ClientSource } from "@/lib/mock/clients";
import {
  MobileChips,
  MobileEmpty,
  MobileSheet,
  type ChipOption,
} from "../ui";

/** ISO YYYY-MM-DD → DD.MM.YYYY (для предзаполнения формы клиента). */
function isoToBirth(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

type Filter = "active" | "all" | "accepted" | "rejected";

const STATUS_META: Record<ApplicationStatus, { label: string; cls: string }> = {
  draft: { label: "Черновик", cls: "bg-surface-soft text-muted" },
  new: { label: "Новая", cls: "bg-orange-soft text-orange-ink" },
  viewed: { label: "Просмотрена", cls: "bg-blue-50 text-blue-600" },
  accepted: { label: "Принята", cls: "bg-green-soft text-green-ink" },
  rejected: { label: "Отклонена", cls: "bg-red-soft text-red-ink" },
  spam: { label: "Спам", cls: "bg-orange-soft text-orange-ink" },
  cancelled: { label: "Отменена", cls: "bg-surface-soft text-muted-2" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} · ${hh}:${min}`;
}

export function MobileApplications() {
  const [filter, setFilter] = useState<Filter>("active");
  const [openId, setOpenId] = useState<number | null>(null);
  /** Заявка, оформляемая в клиента (открыта форма convert). */
  const [convertApp, setConvertApp] = useState<ApiApplication | null>(null);
  /** Заявка, для которой открыт выбор причины отклонения. */
  const [rejectApp, setRejectApp] = useState<ApiApplication | null>(null);
  const rejectMut = useRejectApplication();

  const { data: items = [], isLoading } = useApplications({ status: filter });
  const { data: newItems = [] } = useApplications({ status: "new" });

  const doReject = async (reasonCode: RejectionReasonCode) => {
    if (!rejectApp) return;
    try {
      await rejectMut.mutateAsync({ id: rejectApp.id, input: { reasonCode } });
      toast.success("Заявка отклонена", REJECTION_REASON_LABEL[reasonCode]);
      setRejectApp(null);
      setOpenId(null);
    } catch (e) {
      toast.error("Не удалось отклонить", (e as Error).message ?? "");
    }
  };

  const sorted = useMemo(
    () => [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items],
  );

  const chips: ChipOption<Filter>[] = [
    { id: "active", label: "Активные", count: newItems.length },
    { id: "all", label: "Все" },
    { id: "accepted", label: "Принятые" },
    { id: "rejected", label: "Отклонённые" },
  ];

  const openApp = items.find((a) => a.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <MobileChips options={chips} value={filter} onChange={setFilter} />

      {isLoading ? (
        <div className="py-10 text-center text-[13px] text-muted-2">Загрузка…</div>
      ) : sorted.length === 0 ? (
        <MobileEmpty
          icon={<Inbox size={26} />}
          title="Заявок нет"
          hint="Здесь появятся анкеты, заполненные по публичной ссылке"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((a) => (
            <AppRow key={a.id} app={a} onClick={() => setOpenId(a.id)} />
          ))}
        </div>
      )}

      <MobileSheet
        open={openApp != null}
        onClose={() => setOpenId(null)}
        title="Заявка"
      >
        {openApp && (
          <AppDetail
            app={openApp}
            onAccept={() => setConvertApp(openApp)}
            onReject={() => setRejectApp(openApp)}
          />
        )}
      </MobileSheet>

      {/* Выбор причины отклонения */}
      <MobileSheet
        open={rejectApp != null}
        onClose={() => setRejectApp(null)}
        title="Причина отклонения"
      >
        <div className="flex flex-col gap-2">
          {(Object.keys(REJECTION_REASON_LABEL) as RejectionReasonCode[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => doReject(code)}
              disabled={rejectMut.isPending}
              className="rounded-2xl bg-surface px-4 py-3 text-left text-[14px] font-semibold text-ink shadow-card-sm active:scale-[0.99] disabled:opacity-50"
            >
              {REJECTION_REASON_LABEL[code]}
            </button>
          ))}
        </div>
      </MobileSheet>

      {/* Оформление клиента из заявки (convert) */}
      {convertApp && (
        <MobileNewClient
          applicationId={convertApp.id}
          initial={{
            name: convertApp.name ?? "",
            phone: convertApp.phone ?? "",
            phone2: convertApp.extraPhone ?? "",
            birth: isoToBirth(convertApp.birthDate),
            isForeigner: convertApp.isForeigner,
            passportRaw: convertApp.passportRaw ?? "",
            passSer: convertApp.passportSeries ?? "",
            passNum: convertApp.passportNumber ?? "",
            source: (convertApp.source as ClientSource | null) ?? null,
          }}
          onClose={() => {
            setConvertApp(null);
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

function AppRow({ app, onClick }: { app: ApiApplication; onClick: () => void }) {
  const meta = STATUS_META[app.status];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card-sm active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-bold text-ink">
            {app.name || "Без имени"}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", meta.cls)}>
            {meta.label}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted">
          {app.phone || "телефон не указан"}
        </div>
      </div>
      <div className="text-right text-[11px] text-muted-2">
        {formatDate(app.createdAt)}
      </div>
      <ChevronRight size={16} className="text-muted-2" />
    </button>
  );
}

function AppDetail({
  app,
  onAccept,
  onReject,
}: {
  app: ApiApplication;
  onAccept: () => void;
  onReject: () => void;
}) {
  const actionable = app.status === "new" || app.status === "viewed";
  return (
    <div className="pb-1">
      <ApplicationView app={app} />

      <div className="mt-5 flex flex-col gap-2">
        {app.phone && (
          <a
            href={`tel:${app.phone}`}
            className="flex items-center justify-center gap-2 rounded-2xl bg-blue-50 py-3 text-[14px] font-bold text-blue-700 ring-1 ring-inset ring-blue-100 active:scale-[0.99]"
          >
            <Phone size={17} /> Позвонить
          </a>
        )}
        {actionable ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReject}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-red-soft py-3.5 text-[14px] font-bold text-red-ink active:scale-[0.99]"
            >
              <X size={17} /> Отклонить
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="flex flex-[1.5] items-center justify-center gap-1.5 rounded-2xl bg-green py-3.5 text-[14px] font-bold text-white shadow-card-sm active:scale-[0.99]"
            >
              <Check size={17} /> Принять и оформить
            </button>
          </div>
        ) : (
          <p className="text-center text-[12px] text-muted-2">
            Заявка уже обработана
          </p>
        )}
      </div>
    </div>
  );
}
