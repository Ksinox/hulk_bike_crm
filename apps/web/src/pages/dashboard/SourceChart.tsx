import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockSourceSplit } from "@/lib/mock/dashboard";

const COLORS = [
  "hsl(var(--primary))",
  "#60A5FA",
  "#34D399",
  "#FBBF24",
  "#A78BFA",
];

export function SourceChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground text-base font-semibold">
          Источники клиентов
        </CardTitle>
        <div className="text-xs text-muted-foreground">Доля, %</div>
      </CardHeader>
      <CardContent className="pb-5">
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={mockSourceSplit}
                dataKey="value"
                nameKey="label"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {mockSourceSplit.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => `${v}%`}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 space-y-1.5 text-xs">
          {mockSourceSplit.map((item, i) => (
            <li key={item.label} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-muted-foreground">{item.label}</span>
              </span>
              <span className="font-medium">{item.value}%</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
