import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { MediaLightbox, type LightboxItem } from "@/components/MediaLightbox";
import type { ApiDamageReport } from "@/lib/api/damage-reports";

/**
 * Read-only витрина акта(ов) о повреждениях в карточке аренды: суммы + долг +
 * галерея медиа (фото/видео доказательства). Тап по плитке → лайтбокс. Чтобы
 * смотреть приложенные материалы НЕ заходя в редактирование акта.
 *
 * Несколько актов на аренду (повторные повреждения) — суммируем и показываем
 * все медиа единой лентой. Версии/правки акта (Этап 2) добавятся позже.
 */
function fmt(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

const AGREEMENT: Record<string, { label: string; cls: string }> = {
  pending: { label: "на согласовании", cls: "bg-orange-soft text-orange-ink" },
  agreed: { label: "согласовано", cls: "bg-green-soft text-green-ink" },
  disputed: { label: "спор", cls: "bg-red-soft text-red-ink" },
};

export function DamageActBlock({ reports }: { reports: ApiDamageReport[] }) {
  const allMedia = reports.flatMap((r) => r.media ?? []);
  const total = reports.reduce((s, r) => s + r.total, 0);
  const debt = reports.reduce((s, r) => s + r.debt, 0);
  const latest = reports[reports.length - 1];
  const agreement = latest
    ? (AGREEMENT[latest.clientAgreement] ?? AGREEMENT.pending)
    : null;

  const lightboxItems: LightboxItem[] = allMedia.map((m) => ({
    kind: m.kind,
    url:
      m.kind === "photo"
        ? (fileUrl(m.fileKey, { variant: "view" }) ?? "")
        : (fileUrl(m.fileKey) ?? ""),
    poster:
      m.kind === "video"
        ? (fileUrl(m.posterKey, { variant: "view" }) ?? undefined)
        : undefined,
    processing: m.kind === "video" && m.status !== "ready",
    downloadUrl: fileUrl(m.fileKey) ?? undefined,
    durationSec: m.durationSec,
    name: m.fileName,
  }));
  const [lightbox, setLightbox] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {agreement && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-muted">
            {reports.length > 1
              ? `${reports.length} акта о повреждениях`
              : "Акт о повреждениях"}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
              agreement.cls,
            )}
          >
            {agreement.label}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-soft px-3 py-2">
          <div className="text-[11px] text-muted-2">Сумма ущерба</div>
          <div className="text-[16px] font-bold tabular-nums text-ink">
            {fmt(total)} ₽
          </div>
        </div>
        <div
          className={cn(
            "rounded-xl px-3 py-2",
            debt > 0 ? "bg-red-soft" : "bg-green-soft",
          )}
        >
          <div
            className={cn(
              "text-[11px]",
              debt > 0 ? "text-red-ink" : "text-green-ink",
            )}
          >
            {debt > 0 ? "Непогашенный долг" : "Долг погашен"}
          </div>
          <div
            className={cn(
              "text-[16px] font-bold tabular-nums",
              debt > 0 ? "text-red-ink" : "text-green-ink",
            )}
          >
            {fmt(debt)} ₽
          </div>
        </div>
      </div>

      {allMedia.length > 0 ? (
        <div>
          <div className="mb-1.5 text-[12px] font-semibold text-muted">
            Медиа-материалы · {allMedia.length}
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {allMedia.map((m, i) => {
              const processing = m.kind === "video" && m.status !== "ready";
              const thumb =
                m.kind === "photo"
                  ? fileUrl(m.fileKey, { variant: "thumb" })
                  : fileUrl(m.posterKey, { variant: "thumb" });
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setLightbox(i)}
                  className="relative aspect-square overflow-hidden rounded-lg bg-ink/5 ring-1 ring-inset ring-border transition-transform active:scale-[0.97]"
                >
                  {thumb && !processing ? (
                    <img
                      src={thumb}
                      className="h-full w-full object-cover"
                      alt="повреждение"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-ink/80 text-white">
                      {processing ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <Play size={16} className="fill-white" />
                      )}
                    </div>
                  )}
                  {m.kind === "video" && !processing && thumb && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55">
                        <Play size={13} className="fill-white text-white" />
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-3 py-3 text-center text-[12px] text-muted-2">
          К акту не приложено фото/видео.
        </div>
      )}

      {lightbox != null && (
        <MediaLightbox
          items={lightboxItems}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
