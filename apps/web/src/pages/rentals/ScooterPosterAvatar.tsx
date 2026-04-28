import { Bike, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/files";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { MODEL_LABEL } from "@/lib/mock/rentals";
import type { ApiScooter } from "@/lib/api/types";

/**
 * Постер-аватарка скутера: PNG модели на прозрачном фоне с эффектом
 * «колесо/руль выходят за рамку». Используется в диалоге замены и в
 * истории замен в карточке аренды.
 *
 *  - scooter=null  → плейсхолдер с вопросом (для пустой карточки «куда
 *    заменить» до выбора).
 *  - scooter=…     → ищем модель, рисуем PNG; fallback — иконка Bike.
 */
export function ScooterPosterAvatar({
  scooter,
  size = "md",
  highlighted = false,
  className,
}: {
  scooter: ApiScooter | null;
  size?: "sm" | "md" | "lg";
  highlighted?: boolean;
  className?: string;
}) {
  const { data: models = [] } = useApiScooterModels();

  const dims = {
    sm: { box: "h-20 w-20", img: "-mt-3 h-24" },
    md: { box: "h-32 w-32", img: "-mt-5 h-40" },
    lg: { box: "h-48 w-48", img: "-mt-8 h-60" },
  }[size];

  if (scooter == null) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-soft text-muted-2",
          dims.box,
          className,
        )}
      >
        <HelpCircle
          size={size === "lg" ? 56 : size === "md" ? 38 : 28}
          strokeWidth={1.5}
        />
      </div>
    );
  }

  const model = scooter.modelId
    ? models.find((m) => m.id === scooter.modelId)
    : models.find((m) =>
        m.name.toLowerCase().includes(scooter.model.toLowerCase()),
      );
  const avatarSrc = fileUrl(model?.avatarKey);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-end justify-center overflow-visible rounded-2xl bg-surface-soft",
        highlighted && "ring-2 ring-blue-500",
        dims.box,
        className,
      )}
      title={
        model?.name ??
        MODEL_LABEL[scooter.model as keyof typeof MODEL_LABEL] ??
        scooter.name
      }
    >
      {avatarSrc ? (
        <img
          src={avatarSrc}
          alt={model?.name ?? scooter.name}
          className={cn(
            "w-auto max-w-none object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.18)]",
            dims.img,
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-2">
          <Bike
            size={size === "lg" ? 56 : size === "md" ? 38 : 28}
            strokeWidth={1.5}
          />
        </div>
      )}
    </div>
  );
}
