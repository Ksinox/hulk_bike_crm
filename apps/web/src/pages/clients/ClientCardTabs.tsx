import {
  FileText,
  FileImage,
  FileBadge,
  CheckCircle2,
  Circle,
  ArrowUp,
  ArrowDown,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientDetails, DocFile } from "@/lib/mock/clients";

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

/* =================== Аренды =================== */

const STATUS_LABEL: Record<string, string> = {
  active: "активна",
  done: "завершена",
  overdue: "просрочка",
};

const STATUS_CLASS: Record<string, string> = {
  active: "bg-green-soft text-green-ink",
  done: "bg-surface-soft text-muted",
  overdue: "bg-red-soft text-red-ink",
};

export function RentalsTab({ d }: { d: ClientDetails }) {
  if (d.rentals.length === 0)
    return <Empty text="У клиента ещё не было аренд" />;
  return (
    <div className="overflow-hidden rounded-[14px] border border-border">
      <table className="w-full text-[13px]">
        <thead className="bg-surface-soft text-left text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          <tr>
            <th className="px-3 py-2">Скутер</th>
            <th className="px-3 py-2">Период</th>
            <th className="px-3 py-2">Статус</th>
            <th className="px-3 py-2 text-right">Сумма</th>
            <th className="px-3 py-2 text-right">Залог</th>
            <th className="px-3 py-2">Оплата</th>
          </tr>
        </thead>
        <tbody>
          {d.rentals.map((r, i) => (
            <tr
              key={i}
              className="border-t border-border/60 hover:bg-surface-soft/60"
            >
              <td className="px-3 py-2 font-semibold text-ink">{r.scooter}</td>
              <td className="px-3 py-2 text-muted">{r.period}</td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    STATUS_CLASS[r.status],
                  )}
                >
                  {STATUS_LABEL[r.status]}
                </span>
                {r.note && (
                  <div className="mt-0.5 text-[11px] text-muted-2">
                    {r.note}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                {fmt(r.sum)} ₽
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted">
                {fmt(r.deposit)} ₽
              </td>
              <td className="px-3 py-2 text-muted">{r.src}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* =================== Рассрочки =================== */

export function InstalmentsTab({ d }: { d: ClientDetails }) {
  if (d.instalments.length === 0)
    return <Empty text="Нет активных рассрочек" />;
  return (
    <div className="flex flex-col gap-2">
      {d.instalments.map((x, i) => {
        const progress = Math.round((x.paid / x.total) * 100);
        return (
          <div
            key={i}
            className="rounded-[14px] border border-border p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-ink">{x.scooter}</div>
              <span className="text-[11px] text-muted-2">
                с {x.start}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
              <Metric label="Всего" value={`${fmt(x.total)} ₽`} />
              <Metric label="Оплачено" value={`${fmt(x.paid)} ₽`} tone="green" />
              <Metric label="Остаток" value={`${fmt(x.left)} ₽`} tone="orange" />
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft">
              <div
                className="h-full bg-blue-600"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted-2">Оплачено {progress}%</span>
              <span className="font-semibold text-orange-ink">
                Следующий платёж: {x.next}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =================== Инциденты =================== */

export function IncidentsTab({ d }: { d: ClientDetails }) {
  if (d.incidents.length === 0)
    return <Empty text="Инцидентов не зафиксировано" />;
  return (
    <div className="flex flex-col gap-2">
      {d.incidents.map((inc, i) => (
        <div
          key={i}
          className="rounded-[14px] border border-border p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{inc.type}</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    inc.status === "overdue"
                      ? "bg-red-soft text-red-ink"
                      : "bg-surface-soft text-muted",
                  )}
                >
                  {inc.status === "overdue" ? "не урегулирован" : "закрыт"}
                </span>
              </div>
              {inc.note && (
                <div className="mt-1 text-[12px] text-muted">{inc.note}</div>
              )}
            </div>
            <div className="shrink-0 text-right text-[11px] text-muted-2">
              {inc.date}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
            <Metric label="Ущерб" value={`${fmt(inc.damage)} ₽`} />
            <Metric label="Оплачено" value={`${fmt(inc.paid)} ₽`} tone="green" />
            <Metric
              label="Остаток"
              value={`${fmt(inc.left)} ₽`}
              tone={inc.left > 0 ? "red" : "gray"}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =================== Документы =================== */

export function DocsTab({ d }: { d: ClientDetails }) {
  const docs: { key: keyof ClientDetails["docs"]; label: string; file: DocFile }[] =
    [
      { key: "passport_main", label: "Паспорт (основной разворот)", file: d.docs.passport_main },
      { key: "passport_reg",  label: "Паспорт (прописка)",         file: d.docs.passport_reg },
      { key: "license",       label: "Водительское",               file: d.docs.license },
    ];
  return (
    <div className="flex flex-col gap-3">
      {d.origVerified && (
        <div className="flex items-center gap-2 rounded-[14px] bg-green-soft/60 px-3 py-2 text-[12px] text-green-ink">
          <CheckCircle2 size={14} />
          <span>
            Оригиналы сверены {d.origVerified.date} ·{" "}
            {d.origVerified.by}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {docs.map((doc) => (
          <DocCard key={doc.key} label={doc.label} file={doc.file} />
        ))}
      </div>
      <PassportBlock d={d} />
    </div>
  );
}

function DocCard({ label, file }: { label: string; file: DocFile }) {
  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border px-3 py-5 text-center">
        <Circle size={22} className="text-muted-2" />
        <div className="text-[12px] font-semibold text-muted">{label}</div>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-ink hover:bg-surface-soft"
        >
          + Загрузить
        </button>
      </div>
    );
  }
  const Icon =
    file.kind === "pdf" ? FileText : file.thumb ? FileImage : FileBadge;
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-border p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-blue-50 text-blue-700">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink truncate">
            {label}
          </div>
          <div className="truncate text-[11px] text-muted-2">{file.name}</div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-2">загружено {file.date}</span>
        <button
          type="button"
          className="font-semibold text-blue-600 hover:underline"
        >
          открыть →
        </button>
      </div>
    </div>
  );
}

function PassportBlock({ d }: { d: ClientDetails }) {
  const fields: { label: string; value: string }[] = [
    { label: "Дата рождения", value: d.birth },
    { label: "Серия и номер", value: `${d.passport.ser} ${d.passport.num}` },
    { label: "Кем выдан", value: d.passport.issuer },
    { label: "Дата выдачи", value: d.passport.date },
    { label: "Код подразделения", value: d.passport.code },
    { label: "Регистрация", value: d.regAddr },
    { label: "Фактический адрес", value: d.liveAddr },
  ];
  return (
    <div className="rounded-[14px] border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-2">
          Паспортные данные
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
        >
          <Pencil size={11} /> изменить
        </button>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label} className="flex gap-2">
            <span className="w-[140px] shrink-0 text-muted-2">{f.label}</span>
            <span className="min-w-0 flex-1 text-ink">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =================== Рейтинг =================== */

export function RatingTab({ d }: { d: ClientDetails }) {
  if (d.ratingHistory.length === 0)
    return <Empty text="История рейтинга пуста" />;
  return (
    <div className="flex flex-col">
      {d.ratingHistory.map((e, i) => {
        const isPlus = e.delta > 0;
        const isMinus = e.delta < 0;
        const iconCls = isPlus
          ? "bg-green-soft text-green-ink"
          : isMinus
            ? "bg-red-soft text-red-ink"
            : "bg-surface-soft text-muted";
        const Icon = isPlus ? ArrowUp : isMinus ? ArrowDown : Pencil;
        return (
          <div
            key={i}
            className="flex items-start gap-3 border-b border-border/60 py-2 last:border-b-0"
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                iconCls,
              )}
            >
              <Icon size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink">
                  {e.event}
                </span>
                {e.type === "manual" && (
                  <span className="rounded-full bg-purple-soft px-1.5 py-0.5 text-[10px] font-semibold text-purple-ink">
                    ручная корр.
                  </span>
                )}
              </div>
              {e.note && (
                <div className="text-[11px] text-muted">{e.note}</div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div
                className={cn(
                  "text-[13px] font-bold tabular-nums",
                  isPlus
                    ? "text-green-ink"
                    : isMinus
                      ? "text-red-ink"
                      : "text-muted",
                )}
              >
                {e.delta > 0 ? "+" : ""}
                {e.delta}
              </div>
              <div className="text-[10px] text-muted-2 tabular-nums">
                → {e.score} · {e.date}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =================== Helpers =================== */

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-[14px] border border-dashed border-border text-[13px] text-muted">
      {text}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "orange" | "gray";
}) {
  const toneCls =
    tone === "green"
      ? "text-green-ink"
      : tone === "red"
        ? "text-red-ink"
        : tone === "orange"
          ? "text-orange-ink"
          : tone === "gray"
            ? "text-muted-2"
            : "text-ink";
  return (
    <div>
      <div className="text-[11px] text-muted-2">{label}</div>
      <div className={cn("font-semibold tabular-nums", toneCls)}>{value}</div>
    </div>
  );
}
