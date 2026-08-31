import type { ApiClient, ApiRental, ApiScooter } from "@/lib/api/types";
import type { ApiApplication } from "@/lib/api/clientApplications";
import type { SaleDeal, SaleManager } from "@/lib/api/sales";

/**
 * Движок глобального поиска (переписан 31.08 по фидбэку).
 *
 * Что изменилось по сути: раньше искали по трём полям трёх сущностей
 * (имя клиента, имя/VIN скутера, номер аренды) — «356» не находил ни
 * номер рамы, ни двигатель, ни ID, ни сделку. Теперь ищем по всем
 * опознавательным полям всех рабочих сущностей и сортируем по тому,
 * насколько совпадение вероятное:
 *
 *   0-9   — точное попадание в идентификатор (VIN, номер, ID, телефон);
 *   10-19 — начало идентификатора или точное имя;
 *   20-29 — фрагмент идентификатора;
 *   30-39 — фрагмент имени/текста.
 *
 * Внутри одного ранга свежие и активные записи идут выше.
 */

export type SearchKind =
  | "client"
  | "scooter"
  | "rental"
  | "sale"
  | "application"
  | "manager";

export type SearchHit = {
  kind: SearchKind;
  id: number;
  title: string;
  subtitle: string;
  /** Что именно совпало — показываем под строкой, чтобы было понятно почему. */
  matched: string;
  rank: number;
  /** Доп. вес внутри ранга (активные и свежие выше). */
  weight: number;
};

export type SearchQuery = {
  raw: string;
  text: string;
  digits: string;
  isNumeric: boolean;
};

export function parseQuery(raw: string): SearchQuery {
  const text = raw.toLowerCase().trim();
  return {
    raw,
    text,
    digits: (raw.match(/\d+/g) ?? []).join(""),
    isNumeric: /^\d+$/.test(text),
  };
}

/** Совпадение по «номерному» полю: VIN, рама, двигатель, ID, номер. */
function idRank(value: string | number | null | undefined, q: SearchQuery): number {
  if (value == null || q.text.length === 0) return 999;
  const v = String(value).toLowerCase();
  if (!v) return 999;
  if (v === q.text) return 0;
  if (q.digits && v.replace(/\D/g, "") === q.digits) return 1;
  if (v.startsWith(q.text)) return 10;
  if (v.includes(q.text)) return 20;
  if (q.digits.length >= 3 && v.replace(/\D/g, "").includes(q.digits)) return 22;
  return 999;
}

/** Совпадение по имени/произвольному тексту. */
function textRank(value: string | null | undefined, q: SearchQuery): number {
  if (!value || q.text.length === 0) return 999;
  const v = value.toLowerCase();
  if (v === q.text) return 12;
  if (v.startsWith(q.text)) return 30;
  // Совпадение с начала любого слова — «смир» → «Алексей Смирнов».
  if (v.split(/\s+/).some((w) => w.startsWith(q.text))) return 31;
  if (v.includes(q.text)) return 34;
  return 999;
}

function phoneRank(phone: string | null | undefined, q: SearchQuery): number {
  if (!phone || q.digits.length < 3) return 999;
  const digits = phone.replace(/\D/g, "");
  if (digits.endsWith(q.digits) && q.digits.length >= 4) return 2;
  return digits.includes(q.digits) ? 21 : 999;
}

/** Лучший (минимальный) ранг из набора + подпись, что совпало. */
function best(
  candidates: [number, string][],
): { rank: number; matched: string } | null {
  let rank = 999;
  let matched = "";
  for (const [r, label] of candidates) {
    if (r < rank) {
      rank = r;
      matched = label;
    }
  }
  return rank < 999 ? { rank, matched } : null;
}

const MODEL_LABELS: Record<string, string> = {
  jog: "Yamaha Jog",
  gear: "Yamaha Gear",
  honda: "Honda Dio",
  tank: "Tank",
};

export type SearchSources = {
  clients: ApiClient[];
  scooters: ApiScooter[];
  rentals: ApiRental[];
  deals: SaleDeal[];
  applications: ApiApplication[];
  managers: SaleManager[];
  /** Название модели по её id — чтобы искать «Yamaha Jog» по каталогу. */
  modelName?: (modelId: number | null | undefined) => string | undefined;
};

export function searchEverything(
  raw: string,
  src: SearchSources,
): SearchHit[] {
  const q = parseQuery(raw);
  if (q.text.length < 1) return [];
  const out: SearchHit[] = [];

  // ── Клиенты ──
  for (const c of src.clients) {
    const hit = best([
      [idRank(c.id, q), `ID ${c.id}`],
      [phoneRank(c.phone, q), c.phone],
      [phoneRank(c.extraPhone, q), c.extraPhone ?? ""],
      [textRank(c.name, q), c.name],
      [
        idRank(
          `${c.passportSeries ?? ""}${c.passportNumber ?? ""}`,
          q,
        ),
        `паспорт ${c.passportSeries ?? ""} ${c.passportNumber ?? ""}`,
      ],
    ]);
    if (!hit) continue;
    out.push({
      kind: "client",
      id: c.id,
      title: c.name,
      subtitle: c.phone,
      matched: hit.matched,
      rank: hit.rank,
      weight: c.blacklisted ? -1 : 0,
    });
  }

  // ── Техника ──
  for (const s of src.scooters) {
    if (s.archivedAt || s.deletedAt) continue;
    const model = src.modelName?.(s.modelId) ?? MODEL_LABELS[s.model] ?? s.model;
    const hit = best([
      [idRank(s.vin, q), `VIN ${s.vin ?? ""}`],
      [idRank(s.frameNumber, q), `рама ${s.frameNumber ?? ""}`],
      [idRank(s.engineNo, q), `двигатель ${s.engineNo ?? ""}`],
      [idRank(s.uid, q), `ID ${s.uid ?? ""}`],
      [idRank(s.rentalSlot, q), `номер в аренде ${s.rentalSlot ?? ""}`],
      [idRank(s.id, q), `ID записи ${s.id}`],
      [textRank(s.name, q), s.name],
      [textRank(model, q), model],
      [textRank(s.color, q), s.color ?? ""],
      [textRank(s.purchaseBatch, q), s.purchaseBatch ?? ""],
    ]);
    if (!hit) continue;
    out.push({
      kind: "scooter",
      id: s.id,
      title: `${model}${s.rentalSlot != null ? ` №${s.rentalSlot}` : ""}`,
      subtitle: s.vin ? `VIN ${s.vin}` : "VIN не указан",
      matched: hit.matched,
      rank: hit.rank,
      weight: s.baseStatus === "rental_pool" ? 1 : 0,
    });
  }

  // ── Аренды ──
  const clientById = new Map(src.clients.map((c) => [c.id, c]));
  const scooterById = new Map(src.scooters.map((s) => [s.id, s]));
  for (const r of src.rentals) {
    const cl = clientById.get(r.clientId);
    const sc = r.scooterId != null ? scooterById.get(r.scooterId) : null;
    const hit = best([
      [idRank(r.id, q), `аренда #${r.id}`],
      [textRank(cl?.name, q), cl?.name ?? ""],
      [phoneRank(cl?.phone, q), cl?.phone ?? ""],
      [textRank(sc?.name, q), sc?.name ?? ""],
      [idRank(sc?.vin, q), `VIN ${sc?.vin ?? ""}`],
    ]);
    if (!hit) continue;
    out.push({
      kind: "rental",
      id: r.id,
      title: `Аренда #${String(r.id).padStart(4, "0")}`,
      subtitle: `${cl?.name ?? "—"} · ${sc?.name ?? "без техники"}`,
      matched: hit.matched,
      rank: hit.rank,
      weight: r.status === "active" ? 2 : 0,
    });
  }

  // ── Сделки продажи ──
  for (const d of src.deals) {
    const hit = best([
      [idRank(d.id, q), `сделка #${d.id}`],
      [idRank(d.vin, q), `VIN ${d.vin ?? ""}`],
      [idRank(d.engineNo, q), `двигатель ${d.engineNo ?? ""}`],
      [idRank(d.frameNumber, q), `рама ${d.frameNumber ?? ""}`],
      [textRank(d.clientName, q), d.clientName ?? ""],
      [phoneRank(d.clientPhone, q), d.clientPhone ?? ""],
      [textRank(d.modelName ?? d.scooterName, q), d.modelName ?? d.scooterName ?? ""],
      [textRank(d.managerName, q), d.managerName ?? ""],
      [textRank(d.purchaseBatch, q), d.purchaseBatch ?? ""],
    ]);
    if (!hit) continue;
    out.push({
      kind: "sale",
      id: d.id,
      title: `Продажа #${String(d.id).padStart(4, "0")}`,
      subtitle: `${d.modelName ?? d.scooterName ?? "техника"} · ${d.clientName ?? "клиент не указан"}`,
      matched: hit.matched,
      rank: hit.rank,
      weight: d.status === "signed" ? 1 : 0,
    });
  }

  // ── Заявки ──
  for (const a of src.applications) {
    const hit = best([
      [idRank(a.id, q), `заявка #${a.id}`],
      [phoneRank(a.phone, q), a.phone ?? ""],
      [textRank(a.name, q), a.name ?? ""],
      [
        idRank(`${a.passportSeries ?? ""}${a.passportNumber ?? ""}`, q),
        `паспорт ${a.passportSeries ?? ""} ${a.passportNumber ?? ""}`,
      ],
    ]);
    if (!hit) continue;
    out.push({
      kind: "application",
      id: a.id,
      title: a.name || `Заявка #${a.id}`,
      subtitle:
        (a.purpose === "sale" ? "Заявка на покупку" : "Заявка на аренду") +
        (a.phone ? ` · ${a.phone}` : ""),
      matched: hit.matched,
      rank: hit.rank,
      weight: a.status === "new" ? 2 : 0,
    });
  }

  // ── Менеджеры продаж ──
  for (const m of src.managers) {
    const hit = best([
      [textRank(m.name, q), m.name],
      [phoneRank(m.phone, q), m.phone ?? ""],
    ]);
    if (!hit) continue;
    out.push({
      kind: "manager",
      id: m.id,
      title: m.name,
      subtitle: `Менеджер продаж · ${m.commissionPct}% с прибыли`,
      matched: hit.matched,
      rank: hit.rank,
      weight: 0,
    });
  }

  return out.sort((a, b) => a.rank - b.rank || b.weight - a.weight);
}

export const KIND_LABEL: Record<SearchKind, string> = {
  client: "Клиент",
  scooter: "Техника",
  rental: "Аренда",
  sale: "Продажа",
  application: "Заявка",
  manager: "Менеджер",
};
