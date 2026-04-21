import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, FileText, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FleetScooter } from "@/lib/mock/fleet";
import { DocUpload, type UploadedFile } from "@/pages/clients/DocUpload";
import { useRole } from "@/lib/role";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import {
  setOsagoValidUntil,
  setScooterDoc,
  useScooterDocs,
  type ScooterDocKind,
} from "./fleetStore";

const TODAY = new Date(2026, 9, 13);

const MONTH_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function parseDDMM(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function dateInputToRu(iso: string): string {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}.${m}.${y}`;
}

function ruToDateInput(ru?: string): string {
  if (!ru) return "";
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function ScooterDocumentsTab({ scooter }: { scooter: FleetScooter }) {
  const role = useRole();
  const docs = useScooterDocs(scooter.id);

  const osagoInfo = useMemo(() => {
    if (!docs.osagoValidUntil) return null;
    const d = parseDDMM(docs.osagoValidUntil);
    if (!d) return null;
    const diffDays = Math.round(
      (d.getTime() - TODAY.getTime()) / 86_400_000,
    );
    return {
      dateRu: docs.osagoValidUntil,
      expired: diffDays < 0,
      soon: diffDays >= 0 && diffDays <= 30,
      daysLeft: diffDays,
    };
  }, [docs.osagoValidUntil]);

  const handleChange = (kind: ScooterDocKind) => (f: UploadedFile | null) => {
    setScooterDoc(scooter.id, kind, f);
  };

  const handleAct = (w: "open" | "print") => {
    const html = actHtml(scooter);
    const win = window.open("", "_blank", "width=820,height=1000");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    if (w === "print") {
      win.focus();
      setTimeout(() => win.print(), 250);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Генерируемые документы */}
      <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Генерируемые документы
            </div>
            <div className="mt-0.5 font-display text-[16px] font-extrabold text-ink">
              Акт приёма-передачи
            </div>
            <div className="mt-0.5 text-[12px] text-muted">
              Формируется при выдаче клиенту. Содержит состояние, пробег,
              экипировку.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleAct("open")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-[12px] font-semibold text-ink-2 hover:bg-surface-soft"
            >
              <FileText size={13} /> Открыть
            </button>
            <button
              type="button"
              onClick={() => handleAct("print")}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-blue-700"
            >
              <Printer size={13} /> Сформировать и печатать
            </button>
          </div>
        </div>
      </section>

      {/* Загружаемые документы */}
      <section className="rounded-2xl bg-surface p-4 shadow-card-sm">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          Хранимые документы
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <DocSlot
            title="ПТС"
            subtitle="Паспорт транспортного средства"
            file={docs.pts}
            onChange={handleChange("pts")}
          />
          <DocSlot
            title="СТС"
            subtitle="Свидетельство о регистрации ТС"
            file={docs.sts}
            onChange={handleChange("sts")}
          />

          <div className="flex flex-col gap-2">
            <DocSlot
              title="ОСАГО"
              subtitle="Полис обязательного страхования"
              file={docs.osago}
              onChange={handleChange("osago")}
            />
            <div className="rounded-[12px] border border-border bg-surface-soft px-3 py-2.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  Действует до
                </span>
                <input
                  type="date"
                  value={ruToDateInput(docs.osagoValidUntil)}
                  onChange={(e) =>
                    setOsagoValidUntil(
                      scooter.id,
                      e.target.value
                        ? dateInputToRu(e.target.value)
                        : undefined,
                    )
                  }
                  className="h-9 rounded-[8px] border border-border bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-blue-600"
                />
              </label>
              {osagoInfo && (
                <div
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    osagoInfo.expired
                      ? "bg-red-soft text-red-ink"
                      : osagoInfo.soon
                        ? "bg-orange-soft text-orange-ink"
                        : "bg-green-soft text-green-ink",
                  )}
                >
                  {osagoInfo.expired ? (
                    <AlertTriangle size={11} />
                  ) : osagoInfo.soon ? (
                    <AlertTriangle size={11} />
                  ) : (
                    <CheckCircle2 size={11} />
                  )}
                  {osagoInfo.expired
                    ? `Просрочен на ${Math.abs(osagoInfo.daysLeft)} дн`
                    : osagoInfo.soon
                      ? `Истекает через ${osagoInfo.daysLeft} дн`
                      : `Действует — ${osagoInfo.dateRu}`}
                </div>
              )}
            </div>
          </div>

          {role === "director" && (
            <DocSlot
              title="Договор покупки"
              subtitle="Документ от продавца / поставщика"
              file={docs.purchase}
              onChange={handleChange("purchase")}
              directorOnly
            />
          )}
        </div>

        {role !== "director" && (
          <div className="mt-3 rounded-[12px] bg-surface-soft px-3 py-2 text-[11px] text-muted-2">
            Договор покупки скутера доступен только в роли «Директор».
          </div>
        )}
      </section>
    </div>
  );
}

function DocSlot({
  title,
  subtitle,
  file,
  onChange,
  directorOnly,
}: {
  title: string;
  subtitle: string;
  file: UploadedFile | null;
  onChange: (next: UploadedFile | null) => void;
  directorOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">{title}</div>
          <div className="text-[11px] text-muted-2">{subtitle}</div>
        </div>
        {directorOnly && (
          <span className="shrink-0 rounded-full bg-purple-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-ink">
            только директору
          </span>
        )}
      </div>
      <DocUpload
        label={title}
        accept="image/*,application/pdf"
        file={file}
        onChange={onChange}
      />
    </div>
  );
}

function actHtml(scooter: FleetScooter): string {
  const today = new Date(2026, 9, 13);
  const dateStr = `${String(today.getDate()).padStart(2, "0")} ${MONTH_RU[today.getMonth()]} ${today.getFullYear()}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Акт приёма-передачи ${scooter.name}</title>
<style>body{font-family:Inter,sans-serif;padding:40px;color:#111}
h1{font-size:22px;margin:0 0 6px}
h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:0.05em;color:#666}
.row{display:flex;gap:8px;padding:4px 0;border-bottom:1px dashed #e5e5e5}
.row b{min-width:180px;color:#666;font-weight:500}
.signs{margin-top:60px;display:flex;gap:40px}
.sign{flex:1}
.sign .line{border-bottom:1px solid #000;height:30px;margin-top:20px}
.sign .lbl{font-size:12px;color:#666}
</style></head><body>
<h1>Акт приёма-передачи скутера</h1>
<div>Составлен: ${dateStr}</div>

<h2>Объект</h2>
<div class="row"><b>Скутер</b>${scooter.name} · ${MODEL_LABEL[scooter.model]}</div>
<div class="row"><b>VIN</b>${scooter.vin ?? "—"}</div>
<div class="row"><b>Номер двигателя</b>${scooter.engineNo ?? "—"}</div>
<div class="row"><b>Пробег на момент выдачи</b>${fmt(scooter.mileage)} км</div>

<h2>Состояние при выдаче</h2>
<div class="row"><b>Внешний вид</b>______________________________________</div>
<div class="row"><b>Комплектность</b>______________________________________</div>
<div class="row"><b>Повреждения</b>______________________________________</div>

<h2>Экипировка</h2>
<div class="row"><b>Шлем</b>□ выдан □ не выдан</div>
<div class="row"><b>Держатель телефона</b>□ выдан □ не выдан</div>
<div class="row"><b>Комментарий</b>______________________________________</div>

<div class="signs">
  <div class="sign"><div class="line"></div><div class="lbl">Передал / подпись, дата</div></div>
  <div class="sign"><div class="line"></div><div class="lbl">Принял / подпись, дата</div></div>
</div>
</body></html>`;
}
