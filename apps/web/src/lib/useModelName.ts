import { useCallback } from "react";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { MODEL_LABEL, type ScooterModel } from "@/lib/mock/rentals";

/**
 * Имя модели техники — из каталога моделей (19.09, п.9).
 *
 * У техники есть старое поле `model` (jog / gear / honda / tank), и у всех
 * моделей, которых в нём нет (SEM, AIMA…), там стоит «jog». Подписи,
 * собранные из него, писали «Yamaha Jog» под чужой техникой. Имя берём из
 * каталога по `modelId`; старое поле — только если модели в каталоге нет.
 */
export type ModelRef = { modelId?: number | null; model?: string | null } | null | undefined;

export function useModelName(): (s: ModelRef) => string {
  const { data: models = [] } = useApiScooterModels();
  return useCallback(
    (s: ModelRef) => {
      if (!s) return "";
      const m = s.modelId != null ? models.find((x) => x.id === s.modelId) : null;
      if (m?.name) return m.name;
      return s.model ? (MODEL_LABEL[s.model as ScooterModel] ?? s.model) : "";
    },
    [models],
  );
}
