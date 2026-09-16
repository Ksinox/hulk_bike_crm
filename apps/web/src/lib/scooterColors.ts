import { useMemo } from "react";
import { useApiScooters } from "@/lib/api/scooters";
import { rankSuggestions } from "@/components/SuggestInput";

/**
 * Цвета техники для подсказок (16.09): всё, что уже вписывали в парке, —
 * частые сверху. `extra` — только что введённое в этой же форме.
 */
export function useScooterColorSuggestions(extra: (string | null | undefined)[] = []): string[] {
  const { data = [] } = useApiScooters();
  const key = extra.join("|");
  return useMemo(
    () => rankSuggestions([...data.map((s) => s.color), ...extra]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, key],
  );
}
