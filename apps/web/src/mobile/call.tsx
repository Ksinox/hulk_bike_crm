import { useCallback, useState } from "react";
import { Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Общая инфраструктура «Позвонить клиенту» для мобильного слоя.
 *
 * Раньше жила локально в MobileDashboard. Вынесена сюда, чтобы кнопка
 * звонка была доступна ВЕЗДЕ, где на мобиле встречается клиент: дашборд
 * (просрочки/возвраты), список клиентов, список аренд, карточка скутера.
 *
 * `useCallClient()` возвращает:
 *  - `callClient(name, phones)` — 1 валидный телефон → сразу `tel:`,
 *    2+ → нижний лист с выбором номера (основной/доп.);
 *  - `callSheet` — JSX нижнего листа (рендерить один раз в конце экрана;
 *    сам себя показывает/прячет, `null` пока не вызван выбор).
 *
 * Телефоны принимаем «как есть» (включая null/undefined/пустые) — фильтрация
 * внутри, чтобы вызывающий код не дублировал `.filter(Boolean)`.
 */
export function useCallClient() {
  const [sheet, setSheet] = useState<{ name: string; phones: string[] } | null>(
    null,
  );

  const callClient = useCallback(
    (name: string, phones: Array<string | null | undefined>) => {
      // Нормализуем, отбрасываем пустые и дубли (бывает, что во втором поле
      // тот же номер — тогда не показываем бессмысленный выбор из одинаковых).
      const list = Array.from(
        new Set(phones.map((p) => (p ?? "").trim()).filter((p) => p.length > 0)),
      );
      if (list.length === 0) return;
      if (list.length === 1) {
        window.location.href = `tel:${list[0]}`;
        return;
      }
      setSheet({ name, phones: list });
    },
    [],
  );

  const callSheet = sheet ? (
    <CallSheet
      name={sheet.name}
      phones={sheet.phones}
      onClose={() => setSheet(null)}
    />
  ) : null;

  return { callClient, callSheet };
}

/** Нижний лист выбора номера (когда у клиента два телефона). */
function CallSheet({
  name,
  phones,
  onClose,
}: {
  name: string;
  phones: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-ink/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-3xl bg-surface p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[15px] font-bold text-ink">
            Позвонить · {name}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-2"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mb-3 text-[12px] text-muted-2">Выберите номер</div>
        {phones.map((ph, i) => (
          <a
            key={ph}
            href={`tel:${ph}`}
            onClick={onClose}
            className="mb-2 flex items-center justify-center gap-2 rounded-2xl bg-green py-4 text-[16px] font-bold text-white active:scale-[0.99]"
          >
            <Phone size={18} /> {ph}
            {i === 1 && (
              <span className="text-[12px] font-medium text-white/70">
                · доп.
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * Круглая кнопка-телефон в строке списка: мгновенный звонок (или выбор
 * номера через нижний лист). Зелёная, тач-таргет 40px. `stopPropagation`
 * чтобы тап по кнопке не «проваливался» в открытие карточки, даже если
 * строка-обёртка кликабельна.
 */
export function RowCallButton({
  onCall,
  className,
}: {
  onCall: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCall();
      }}
      aria-label="Позвонить клиенту"
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green/10 text-green active:scale-90",
        className,
      )}
    >
      <Phone size={17} />
    </button>
  );
}
