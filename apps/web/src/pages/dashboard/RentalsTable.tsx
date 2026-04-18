import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  mockRentals,
  statusLabel,
  type RentalStatus,
} from "@/lib/mock/dashboard";
import { formatRub } from "@/lib/utils";

const statusVariant: Record<
  RentalStatus,
  "default" | "success" | "warning" | "destructive" | "muted"
> = {
  active: "default",
  completed: "success",
  overdue: "destructive",
  incident: "warning",
  draft: "muted",
};

function formatDateRange(start: string, end: string) {
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
  });
  return `${fmt.format(new Date(start))} — ${fmt.format(new Date(end))}`;
}

export function RentalsTable() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-foreground text-base font-semibold">
            Последние аренды
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            Активные и недавно закрытые
          </div>
        </div>
        <Button variant="outline" size="sm">
          Все аренды
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y bg-muted/30 text-xs text-muted-foreground">
                <th className="px-5 py-2.5 text-left font-medium">№</th>
                <th className="px-5 py-2.5 text-left font-medium">Клиент</th>
                <th className="px-5 py-2.5 text-left font-medium">Скутер</th>
                <th className="px-5 py-2.5 text-left font-medium">Период</th>
                <th className="px-5 py-2.5 text-right font-medium">Сумма</th>
                <th className="px-5 py-2.5 text-left font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {mockRentals.map((r, i) => (
                <tr
                  key={r.id}
                  className={
                    i % 2 === 1 ? "bg-muted/20" : undefined
                  }
                >
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {r.id}
                  </td>
                  <td className="px-5 py-3 font-medium">{r.clientName}</td>
                  <td className="px-5 py-3">{r.scooter}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatDateRange(r.startDate, r.endDate)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium">
                    {formatRub(r.totalAmount)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={statusVariant[r.status]}>
                      {statusLabel[r.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
