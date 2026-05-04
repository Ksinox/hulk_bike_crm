import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";
import { ClientAvatar } from "./ReturnsList";
import { formatRub, type OverdueItem } from "./useDashboardMetrics";
import { navigate } from "@/app/navigationStore";

export function OverdueTable({
  className,
  items = [],
  showPhoneColumn = false,
  compactHeader = false,
  onOpenRental,
}: {
  className?: string;
  items?: OverdueItem[];
  showPhoneColumn?: boolean;
  compactHeader?: boolean;
  /** v0.3.1: если передан — клик по строке открывает drawer вместо
   *  навигации на страницу аренд. */
  onOpenRental?: (rentalId: number) => void;
}) {
  const sorted = [...items].sort((a, b) => b.daysOverdue - a.daysOverdue);
  const total = items.length;
  /**
   * Переключатель «Все долги» → раскрывает список со скроллом прямо здесь.
   * Раньше кнопка открывала отдельную страницу/попап — заказчик попросил
   * чтобы скролл работал внутри виджета без выхода с дашборда.
   */
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sorted : sorted.slice(0, 5);

  // Компактный режим: когда просрочек нет — одна тонкая полоса вместо
  // полноразмерной карточки. Экономит место на дашборде.
  if (total === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-card",
          className,
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-soft text-green-ink">
          <Check size={14} strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-ink">Просроченные платежи</div>
          <div className="text-[11px] text-muted">В данный момент просрочек нет</div>
        </div>
      </div>
    );
  }

  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3
            className={cn(
              compactHeader
                ? "text-base font-bold"
                : "text-base font-bold tracking-[-0.005em]",
              "m-0",
            )}
          >
            Просроченные платежи
          </h3>
          <StatusPill tone="late">{total}</StatusPill>
        </div>
        {sorted.length > 5 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
          >
            {expanded ? "Свернуть" : "Все долги"}
            {expanded ? (
              <ChevronDown size={12} strokeWidth={2.2} />
            ) : (
              <ChevronRight size={12} strokeWidth={2.2} />
            )}
          </button>
        )}
      </div>

      {/* В развёрнутом режиме высоту ограничиваем и включаем скролл,
          чтобы оставаться внутри карточки и не растягивать дашборд. */}
      <div
        className={cn(
          expanded && "max-h-[480px] overflow-y-auto pr-1",
        )}
      >
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className={cn(expanded && "sticky top-0 bg-surface z-10")}>
            <tr>
              <Th style={{ width: "34%" }}>Клиент</Th>
              <Th>Скутер</Th>
              <Th>Долг</Th>
              <Th>Просрочка</Th>
              <Th>Телефон</Th>
              {showPhoneColumn && <Th>Тел. моб.</Th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => (
              <OverdueRow
                key={o.rentalId}
                item={o}
                showPhoneColumn={showPhoneColumn}
                onOpenRental={onOpenRental}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function OverdueRow({
  item: o,
  showPhoneColumn,
  onOpenRental,
}: {
  item: OverdueItem;
  showPhoneColumn: boolean;
  onOpenRental?: (rentalId: number) => void;
}) {
  const initials = initialsOf(o.clientName);
  const phoneHref = phoneToTel(o.clientPhone);
  const onRowClick = () => {
    if (onOpenRental) onOpenRental(o.rentalId);
    else navigate({ route: "rentals", rentalId: o.rentalId });
  };
  return (
    <tr
      className="cursor-pointer group"
      onClick={onRowClick}
      title="Открыть карточку аренды"
    >
      <Td overdue>
        <div className="flex items-center gap-2.5">
          <ClientAvatar initials={initials} variant="red" />
          <div>
            <div className="font-semibold">{o.clientName}</div>
          </div>
        </div>
      </Td>
      <Td overdue>{o.scooterName}</Td>
      <Td overdue>
        <span className="font-bold text-red-ink">{formatRub(o.debt)} ₽</span>
      </Td>
      <Td overdue>
        <StatusPill tone="late">{o.daysOverdue} дн</StatusPill>
      </Td>
      <Td overdue>
        {/* v0.2.95: вместо кнопки «Позвонить» (бесполезной без интеграции
            с телефонией) — крупный телефон, кликабельный. На десктопе
            оператор просто читает и набирает на физическом, на мобильном
            tel: ссылка инициирует звонок. */}
        <a
          href={phoneHref}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[14px] font-bold text-ink hover:text-blue-600"
        >
          {o.clientPhone || "—"}
        </a>
      </Td>
      {showPhoneColumn && (
        <Td overdue>
          <span className="text-[13px] text-muted">{o.clientPhone}</span>
        </Td>
      )}
    </tr>
  );
}

function phoneToTel(phone: string): string {
  // Превращаем «+7 (999) 999-99-99» в tel:+79999999999
  const digits = (phone || "").replace(/[^\d+]/g, "");
  if (!digits) return "#";
  return `tel:${digits.startsWith("+") ? digits : `+${digits}`}`;
}

function initialsOf(name: string): string {
  return (name || "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function Th({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      className="bg-surface-soft px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted first:rounded-l-xl last:rounded-r-xl"
      style={style}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  overdue,
}: {
  children?: React.ReactNode;
  overdue?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-border px-3.5 py-3 align-middle",
        overdue && "bg-red/[0.04] group-hover:bg-red/[0.08]",
        !overdue && "group-hover:bg-surface-soft",
      )}
    >
      {children}
    </td>
  );
}
