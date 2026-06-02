import { PieChart, Pie, Cell } from "recharts";

/**
 * Кольцевая диаграмма прогресса погашения: зелёный сектор — оплачено,
 * мягко-красный — остаток. В центре — процент. Используется в карточке
 * дела-должника и во вкладке «Должник» карточки клиента.
 */
export function DonutProgress({
  paid,
  total,
  size = 132,
  caption = "оплачено",
}: {
  paid: number;
  total: number;
  size?: number;
  caption?: string;
}) {
  const total2 = Math.max(0, total);
  const paid2 = Math.max(0, Math.min(paid, total2 > 0 ? total2 : paid));
  const remaining = Math.max(0, total2 - paid2);
  const pct =
    total2 > 0 ? Math.min(100, Math.round((paid2 / total2) * 100)) : 0;

  const data =
    total2 > 0
      ? [
          { name: "paid", value: paid2 },
          { name: "remaining", value: remaining },
        ]
      : [{ name: "empty", value: 1 }];
  const colors =
    total2 > 0
      ? ["hsl(var(--green))", "hsl(var(--red-soft))"]
      : ["hsl(var(--border))"];

  const innerRadius = size * 0.34;
  const outerRadius = size * 0.48;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={false}
          paddingAngle={total2 > 0 && paid2 > 0 && remaining > 0 ? 2 : 0}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i]} />
          ))}
        </Pie>
      </PieChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-[24px] font-extrabold leading-none tabular-nums text-ink">
          {pct}%
        </div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-2">
          {caption}
        </div>
      </div>
    </div>
  );
}
