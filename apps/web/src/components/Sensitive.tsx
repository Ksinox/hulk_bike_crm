import { Children, cloneElement, isValidElement, type ReactNode, type MouseEvent } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  hideSensitive,
  revealSensitive,
  useSensitiveRevealed,
  useSensitiveUnlocked,
} from "@/lib/sensitive";

/**
 * Закрытая цифра (прибыль, закуп) — заказчик 06.09.
 *
 * Раньше здесь было размытие, но сквозь него цифра читалась, а при наведении
 * становилась ещё чётче. Теперь это «спойлер», как в мессенджерах: значение
 * не рендерится глазу вовсе (invisible), сверху — плашка с крапом ровно того
 * же размера, поэтому вёрстка не прыгает. Клик по плашке просит ключ
 * директора; клик по открытой цифре — прячет обратно.
 */
export function Sensitive({
  children,
  className,
  block,
  dark,
}: {
  children: ReactNode;
  className?: string;
  /** Блочный контейнер (плитка целиком), а не строчный кусочек текста. */
  block?: boolean;
  /** Тёмный фон (экран-стена) — крап делаем светлым. */
  dark?: boolean;
}) {
  const revealed = useSensitiveRevealed();

  if (revealed) {
    return (
      <span
        role="button"
        tabIndex={0}
        title="Нажмите, чтобы снова спрятать"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          hideSensitive();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            hideSensitive();
          }
        }}
        className={cn(
          "cursor-pointer rounded-[6px] transition-colors hover:bg-amber-100/60",
          block ? "block" : "inline-block",
          className,
        )}
      >
        {children}
      </span>
    );
  }

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void revealSensitive();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      title="Скрыто — нажмите, чтобы показать (ключ директора)"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void revealSensitive();
        }
      }}
      aria-label="Скрыто — доступно директору по ключу"
      className={cn(
        "relative cursor-pointer select-none overflow-hidden rounded-[7px] align-middle",
        block ? "block" : "inline-block",
        className,
      )}
    >
      {/* Само значение в разметку не попадает: цифры подменены точками —
          не прочитать ни глазом, ни через код страницы. Ширина сохраняется,
          потому что символов столько же. */}
      <span className="invisible">{maskNode(children)}</span>
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-[7px]",
          dark ? "bg-white/15" : "bg-ink/12",
        )}
        style={{
          backgroundImage: dark
            ? "radial-gradient(rgba(255,255,255,0.75) 1px, transparent 1.4px)"
            : "radial-gradient(rgba(15,23,42,0.55) 1px, transparent 1.4px)",
          backgroundSize: "6px 6px",
        }}
      />
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          dark ? "text-white/70" : "text-ink/45",
        )}
      >
        <Lock size={12} />
      </span>
    </span>
  );
}

/** Кнопка в шапке: показать / скрыть прибыль и закуп. */
export function SensitiveToggle({ className }: { className?: string }) {
  const revealed = useSensitiveRevealed();
  const unlocked = useSensitiveUnlocked();
  return (
    <button
      type="button"
      onClick={() => (revealed ? hideSensitive() : void revealSensitive())}
      title={
        revealed
          ? "Скрыть прибыль и закупочную стоимость"
          : unlocked
            ? "Показать прибыль — ключ уже вводили в этой вкладке"
            : "Показать прибыль и закуп — только директор, по ключу"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition-colors",
        revealed
          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
          : "bg-surface text-muted shadow-card-sm hover:text-ink",
        className,
      )}
    >
      {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
      {revealed ? "Скрыть прибыль" : "Прибыль скрыта"}
    </button>
  );
}

/**
 * Подменяет цифры точками, сохраняя длину строки: «295 000 ₽» → «••• ••• ₽».
 * Так под плашкой лежит не настоящее значение, а маска — подсмотреть
 * нечего, а ширина блока остаётся прежней.
 */
function maskNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return node.replace(/[\d]/g, "•");
  if (typeof node === "number") return String(node).replace(/[\d]/g, "•");
  if (Array.isArray(node)) return Children.map(node, maskNode);
  if (isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: ReactNode }>;
    if (el.props?.children === undefined) return el;
    return cloneElement(el, { children: maskNode(el.props.children) });
  }
  return node;
}
