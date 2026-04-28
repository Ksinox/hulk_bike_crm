import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import {
  useApplications,
  useDeleteApplication,
  type ApiApplication,
} from "@/lib/api/clientApplications";
import { NewApplicationModal } from "./NewApplicationModal";
import { AddClientModal } from "./AddClientModal";
import { applicationToFormInit } from "./applicationConvert";

/**
 * Глобальный детектор новых заявок.
 *
 * Рендерится один раз в App.tsx. Использует polling из useApplications().
 * Когда видит заявку со status='new', которую менеджер ещё не видел в этой
 * сессии — показывает полноэкранную NewApplicationModal. По «Оформить» —
 * открывает AddClientModal с предзаполненными полями + applicationId
 * (после save AddClientModal вызовет convert API).
 *
 * «Позже» НЕ меняет статус заявки — она остаётся 'new', продолжает
 * выглядеть как новая в списке /clients и пульсировать в виджете
 * дашборда. Локально (через localStorage seenIds, TTL 24 ч) текущему
 * менеджеру эта заявка больше не всплывает автомодалкой в этой сессии,
 * но другие менеджеры её увидят как новую. Чтобы убрать заявку — нужно
 * её оформить или удалить как спам.
 */

const SEEN_KEY = "hulk-seen-applications";
const SEEN_TTL_MS = 24 * 60 * 60 * 1000;

type SeenEntry = { id: number; seenAt: string };

function loadSeen(): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as SeenEntry[];
    const now = Date.now();
    const fresh = parsed.filter((e) => {
      const t = new Date(e.seenAt).getTime();
      return Number.isFinite(t) && now - t < SEEN_TTL_MS;
    });
    return new Set(fresh.map((e) => e.id));
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<number>): void {
  try {
    const now = new Date().toISOString();
    const arr: SeenEntry[] = Array.from(ids).map((id) => ({ id, seenAt: now }));
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* квота — не страшно, в худшем случае увидит ту же заявку повторно */
  }
}

export function NewApplicationDetector() {
  const { data: items = [] } = useApplications();
  const [seen, setSeen] = useState<Set<number>>(() => loadSeen());
  const [activeApp, setActiveApp] = useState<ApiApplication | null>(null);
  const [convertingApp, setConvertingApp] = useState<ApiApplication | null>(null);
  const deleteApp = useDeleteApplication();

  // Список заявок-кандидатов для показа модалки: status='new' и не в seen
  const pending = useMemo(
    () => items.filter((a) => a.status === "new" && !seen.has(a.id)),
    [items, seen],
  );

  // При появлении новой заявки и пустом active/converting — показываем
  useEffect(() => {
    if (activeApp || convertingApp) return;
    if (pending.length === 0) return;
    setActiveApp(pending[0]);
  }, [pending, activeApp, convertingApp]);

  const markSeen = (id: number) => {
    setSeen((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveSeen(next);
      return next;
    });
  };

  const handleLater = () => {
    if (!activeApp) return;
    // «Позже» — заявка остаётся 'new', только локально перестаёт всплывать
    // в этой сессии. Виджет на дашборде продолжит пульсировать, в /clients
    // строка заявки будет видна с amber-меткой «новая».
    markSeen(activeApp.id);
    setActiveApp(null);
  };

  const handleConvert = () => {
    if (!activeApp) return;
    markSeen(activeApp.id);
    setConvertingApp(activeApp);
    setActiveApp(null);
  };

  const handleDelete = () => {
    if (!activeApp) return;
    const id = activeApp.id;
    markSeen(id);
    deleteApp.mutate(id, {
      onSuccess: () => toast.success("Заявка удалена"),
      onError: () => toast.error("Не удалось удалить заявку"),
    });
    setActiveApp(null);
  };

  return (
    <>
      {activeApp && (
        <NewApplicationModal
          application={activeApp}
          onConvertNow={handleConvert}
          onLater={handleLater}
          onDelete={handleDelete}
        />
      )}
      {convertingApp && (
        <AddClientModal
          onClose={() => setConvertingApp(null)}
          applicationId={convertingApp.id}
          initialData={applicationToFormInit(convertingApp)}
          onCreated={() => {
            setConvertingApp(null);
            toast.success("Клиент создан из заявки");
          }}
        />
      )}
    </>
  );
}
