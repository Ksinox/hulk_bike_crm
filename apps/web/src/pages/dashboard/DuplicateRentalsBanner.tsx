import { useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, Trash2 } from "lucide-react";
import { useApiScooters } from "@/lib/api/scooters";
import { useDeleteRental } from "@/lib/api/rentals";
import { navigate } from "@/app/navigationStore";
import { confirmDialog, toast } from "@/lib/toast";
import type { DashboardMetrics } from "./useDashboardMetrics";

/**
 * Баннер «дубли активных аренд» (v0.2.97).
 *
 * На уровне бизнес-логики такого не должно быть — один скутер физически
 * не может находиться в двух арендах одновременно. Но из-за легаси-багов
 * extend/swap (до in-place миграции) и отсутствия проверки в PATCH
 * /rentals (исправлено в этом релизе) такие дубли могут жить в БД.
 *
 * Баннер показывает каждый кейс отдельной строкой:
 *  - Имя скутера
 *  - Список открытых аренд (по убыванию id, свежие сверху)
 *  - На каждой аренде две кнопки:
 *      «Открыть» — навигация в карточку
 *      «Архивировать» — soft-delete (status стоит как было,
 *        archivedAt=now, archivedBy=пользователь). Существующий
 *        DELETE /api/rentals/:id умеет переподцеплять детей цепочки
 *        к родителю удаляемой связки, ничего не теряется.
 *
 * После того как все дубли разобраны — баннер пропадёт сам (вычисляется
 * из useApiRentals в реальном времени).
 */
export function DuplicateRentalsBanner({
  metrics,
}: {
  metrics: DashboardMetrics;
}) {
  const dups = metrics.duplicateActiveByScooter;
  const { data: scooters = [] } = useApiScooters();
  const deleteRental = useDeleteRental();
  const [busyId, setBusyId] = useState<number | null>(null);

  if (dups.length === 0) return null;

  const onArchive = async (rentalId: number) => {
    const ok = await confirmDialog({
      title: `Архивировать аренду #${String(rentalId).padStart(4, "0")}?`,
      message:
        "Это soft-delete: аренда уйдёт в архив (платежи и история сохранятся, восстановить можно). Используйте если эта аренда — призрачный дубль и не отражает реальность. На стороне БД новые дубли уже не появятся.",
      confirmText: "Архивировать",
      cancelText: "Отмена",
      danger: true,
    });
    if (!ok) return;
    setBusyId(rentalId);
    try {
      await deleteRental.mutateAsync(rentalId);
      toast.success(
        "Аренда архивирована",
        `#${String(rentalId).padStart(4, "0")} убрана из активных`,
      );
    } catch (e) {
      toast.error("Не удалось архивировать", (e as Error).message ?? "");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 shadow-card-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-800">
          <AlertTriangle size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[15px] font-bold text-amber-900">
              Внимание: дубли активных аренд
            </h3>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-900">
              {dups.length}{" "}
              {plural(dups.length, ["скутер", "скутера", "скутеров"])}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-amber-900/80">
            На указанных скутерах одновременно открыто несколько аренд —
            физически такого быть не может. Откройте каждую и оставьте ту,
            которая отражает реальность; лишнюю нажмите «Архивировать».
            Новые дубли с этого момента уже не возникнут — API защищён.
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {dups.map((d) => {
              const sc = scooters.find((s) => s.id === d.scooterId);
              return (
                <div
                  key={d.scooterId}
                  className="flex flex-col gap-1.5 rounded-[10px] bg-white/70 px-3 py-2 text-[13px]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-ink">
                      {sc?.name ?? `Скутер #${d.scooterId}`}
                    </span>
                    <span className="text-amber-900/70">·</span>
                    <span className="text-amber-900/80">
                      {d.rentalIds.length} активные:
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {d.rentalIds.map((rentalId) => (
                      <div
                        key={rentalId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-white px-2.5 py-1.5"
                      >
                        <span className="font-mono font-bold text-ink">
                          #{String(rentalId).padStart(4, "0")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              navigate({ route: "rentals", rentalId })
                            }
                            className="inline-flex items-center gap-1 rounded-[6px] border border-blue-300 bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Открыть
                            <ArrowRight size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onArchive(rentalId)}
                            disabled={busyId === rentalId}
                            className="inline-flex items-center gap-1 rounded-[6px] border border-red-300 bg-white px-2 py-1 text-[12px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {busyId === rentalId ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Trash2 size={11} />
                            )}
                            Архивировать
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}
