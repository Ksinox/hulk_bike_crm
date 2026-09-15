import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PermissionKey, Perms } from "./permissions.js";

/**
 * Серверная часть правила «нет права — нет показателя» (14.09).
 *
 * Интерфейс прячет блоки сам, но этого мало: если число пришло в браузер,
 * его видно в инструментах разработчика. Поэтому закрытые поля вырезаются
 * из ответа до отправки, а целиком закрытые разделы отвечают 403.
 *
 * Поля перечислены по разделам API, а не глобально: «profit» в продажах и
 * «cost» в ремонтах — разные вещи с разными правами.
 */

type FieldRule = { prefix: string; perm: PermissionKey; keys: string[] };

const FIELD_RULES: FieldRule[] = [
  {
    prefix: "/api/sales",
    perm: "data.profit",
    keys: [
      "purchasePrice",
      "profit",
      "marginPct",
      "commission",
      "commissionPct",
      "managerCommission",
      "managerCommissionPct",
    ],
  },
  { prefix: "/api/scooters", perm: "data.profit", keys: ["purchasePrice"] },
  { prefix: "/api/buyout", perm: "data.profit", keys: ["purchasePrice"] },
  { prefix: "/api/investors", perm: "data.profit", keys: ["purchasePrice", "invested"] },
  // Список инвесторов нужен и без права — имя у партнёрской техники, выбор
  // инвестора при добавлении. Процент и деньги из него вырезаются.
  {
    prefix: "/api/investors",
    perm: "data.partnerShares",
    keys: ["share", "invested", "revenue", "income", "monthlyIncome", "accrued", "incomeAll", "revenueAll", "paidTotal", "amount"],
  },
  { prefix: "/api/scooters", perm: "data.partnerShares", keys: ["partnerShare"] },
  { prefix: "/api/service-orders", perm: "data.repairProfit", keys: ["cost", "profit"] },
];

/** Разделы, закрытые целиком. */
const DENY_RULES: { prefix: string; perm: PermissionKey }[] = [
  // Карточка инвестора, начисления и выплаты — целиком про доли.
  { prefix: "/api/investors/", perm: "data.partnerShares" },
  { prefix: "/api/scooters/partner-share", perm: "data.partnerShares" },
];

/** Ключи в meta журнала и фрагменты текста, которые выдают закрытые числа. */
const JOURNAL_META_KEYS: Record<PermissionKey, string[]> = {
  "data.profit": ["purchasePrice", "profit", "marginPct", "commission", "commissionPct", "managerCommission", "managerCommissionPct"],
  "data.repairProfit": ["cost", "profit"],
  "data.partnerShares": ["partnerShare", "share", "accrued"],
};
/**
 * Текст записи журнала собран из фрагментов через « · ». Фрагмент про
 * закрытое выбрасывается целиком — в каком бы виде он ни был записан:
 * «закуп 84 200 ₽», «цена закупа — → 85000», «процент 10%».
 */
const PROFIT_WORDS = /закуп|прибыл|марж|комисси|вознагражден|процент\s*\d|процент с прибыли|\d\s*%\s*с прибыли/i;
const REPAIR_PROFIT_WORDS = /закуп|прибыл|себестоим/i;
const SHARE_WORDS = /инвестор\S*\s*\d|доля|процент инвестора|\d\s*%\s*инвестор/i;

function redactSummary(summary: string, words: RegExp[]): string {
  if (!words.length) return summary;
  const hit = (t: string) => words.some((w) => w.test(t));
  const parts = summary.split(" · ");
  const out: string[] = [];
  parts.forEach((part, i) => {
    // Первый фрагмент часто «Название: что изменилось» — название оставляем.
    const colon = i === 0 ? part.indexOf(": ") : -1;
    if (colon > 0) {
      const head = part.slice(0, colon);
      const tail = part.slice(colon + 2);
      const kept = tail
        .split(/,\s*/)
        .filter((t) => !hit(t))
        .join(", ");
      out.push(kept ? `${head}: ${kept}` : head);
      return;
    }
    if (!hit(part)) out.push(part);
  });
  return out.join(" · ");
}

function pathOf(req: FastifyRequest): string {
  return (req.url || "").split("?")[0] ?? "";
}

function stripKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) stripKeys(v, keys);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (value instanceof Date) return;
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (keys.has(k)) delete obj[k];
    else stripKeys(obj[k], keys);
  }
}

function redactJournal(payload: unknown, perms: Perms): unknown {
  const box = payload as { items?: unknown };
  if (!box || !Array.isArray(box.items)) return payload;
  const metaKeys = new Set<string>();
  (Object.keys(JOURNAL_META_KEYS) as PermissionKey[]).forEach((k) => {
    if (!perms[k]) JOURNAL_META_KEYS[k].forEach((key) => metaKeys.add(key));
  });
  box.items = (box.items as Array<Record<string, unknown>>)
    .filter((it) => {
      if (perms["data.partnerShares"]) return true;
      return it.entity !== "investor" && it.action !== "partner_share_changed";
    })
    .map((it) => {
      const entity = String(it.entity ?? "");
      const words: RegExp[] = [];
      // Записи о правах сотрудников называют права, но чисел не содержат.
      if (entity !== "user") {
        if (!perms["data.profit"]) words.push(PROFIT_WORDS);
        if (!perms["data.repairProfit"] && entity === "service_order") words.push(REPAIR_PROFIT_WORDS);
        if (!perms["data.partnerShares"]) words.push(SHARE_WORDS);
      }
      const summary = redactSummary(typeof it.summary === "string" ? it.summary : "", words);
      const meta = it.meta && typeof it.meta === "object" ? structuredClone(it.meta) : it.meta;
      if (metaKeys.size) stripKeys(meta, metaKeys);
      return { ...it, summary, meta };
    });
  return box;
}

export function registerRedaction(app: FastifyInstance): void {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const perms = req.perms;
    if (!perms) return;
    const path = pathOf(req);
    for (const rule of DENY_RULES) {
      if (path.startsWith(rule.prefix) && !perms[rule.perm]) {
        return reply.code(403).send({ error: "no_permission", permission: rule.perm });
      }
    }
    // Запись закрытых полей тоже запрещена: форма сотрудника без права их не
    // показывает, и пустое значение не должно затереть закуп или долю.
    if (req.method !== "GET" && req.body && typeof req.body === "object") {
      const keys = new Set<string>();
      for (const rule of FIELD_RULES) {
        if (path.startsWith(rule.prefix) && !perms[rule.perm]) {
          rule.keys.forEach((k) => keys.add(k));
        }
      }
      if (keys.size) stripKeys(req.body, keys);
    }
  });

  app.addHook("preSerialization", async (req: FastifyRequest, _reply, payload) => {
    const perms = req.perms;
    if (!perms || !payload || typeof payload !== "object") return payload;
    if (Object.values(perms).every(Boolean)) return payload;
    const path = pathOf(req);
    // Копия, а не правка на месте: маршрут может отдавать объект из кэша,
    // и вырезанное поле пропало бы и у директора.
    if (path.startsWith("/api/activity")) {
      return redactJournal(JSON.parse(JSON.stringify(payload)), perms);
    }
    const keys = new Set<string>();
    for (const rule of FIELD_RULES) {
      if (path.startsWith(rule.prefix) && !perms[rule.perm]) {
        rule.keys.forEach((k) => keys.add(k));
      }
    }
    if (!keys.size) return payload;
    const copy = JSON.parse(JSON.stringify(payload));
    stripKeys(copy, keys);
    return copy;
  });
}
