/**
 * Единая точка отображения техники в CRM.
 *
 * Правка заказчика 24.08: формата «Jog #03» в интерфейсе быть не должно —
 * «решётка» это исторический порядок заведения, оператору она ни о чём не
 * говорит. Показываем МОДЕЛЬ + круглый бейдж с АРЕНДНЫМ номером (тем, что
 * закреплён за скутером в парке). Ушёл из аренды — номер приглушённый.
 *
 * Хук нужен там, где на руках только строка-имя (`rental.scooter`,
 * `row.scooterName`): номер он находит сам по парку.
 */
import { useCallback, useMemo } from "react";
import { useFleetScooters } from "@/pages/fleet/fleetStore";
import { ScooterName } from "@/components/ScooterName";

export type ScooterNaming = {
  /**
   * Правки 2.0, п.5: партнёрская ли это техника. Партнёрка = электро,
   * поэтому у должников с такой техникой ставим отметку-молнию, чтобы
   * оператор сразу видел, чей это долг.
   */
  isPartner: (name: string | null | undefined) => boolean;
  /** Номер/бывший номер по имени скутера. */
  numbersOf: (name: string | null | undefined) => {
    number?: number;
    exNumber?: number;
  };
  /** Готовый JSX: модель + бейдж номера. */
  render: (
    name: string | null | undefined,
    opts?: { size?: "sm" | "md" | "lg"; className?: string },
  ) => JSX.Element | null;
};

export function useScooterNaming(): ScooterNaming {
  const fleet = useFleetScooters();
  const byName = useMemo(() => {
    const m = new Map<
      string,
      { number?: number; exNumber?: number; isPartner?: boolean }
    >();
    for (const s of fleet) {
      m.set(s.name, {
        number: s.rentalSlot,
        exNumber: s.exRentalSlot,
        isPartner: s.isPartner,
      });
    }
    return m;
  }, [fleet]);

  const isPartner = useCallback(
    (name: string | null | undefined) =>
      (name ? (byName.get(name)?.isPartner ?? false) : false),
    [byName],
  );

  const numbersOf = useCallback(
    (name: string | null | undefined) =>
      (name ? byName.get(name) : undefined) ?? {},
    [byName],
  );

  const render = useCallback(
    (
      name: string | null | undefined,
      opts?: { size?: "sm" | "md" | "lg"; className?: string },
    ) => {
      if (!name) return null;
      const n = numbersOf(name);
      return (
        <ScooterName
          name={name}
          number={n.number}
          exNumber={n.exNumber}
          size={opts?.size}
          className={opts?.className}
        />
      );
    },
    [numbersOf],
  );

  return { numbersOf, render, isPartner };
}
