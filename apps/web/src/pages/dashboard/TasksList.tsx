import { useState } from "react";
import {
  Bike,
  Box,
  Check,
  FileText,
  Phone,
  TriangleAlert,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { mockTasks, type TaskIcon, type TaskItem } from "@/lib/mock/dashboard";
import { Card } from "./KpiCard";
import { StatusPill } from "./StatusPill";

const ICONS: Record<TaskIcon, { Icon: LucideIcon; cls: string }> = {
  wrench: { Icon: Wrench, cls: "bg-orange-soft text-orange-ink" },
  phone: { Icon: Phone, cls: "bg-blue-50 text-blue-700" },
  money: { Icon: Wallet, cls: "bg-green-soft text-green-ink" },
  doc: { Icon: FileText, cls: "bg-purple-soft text-purple-ink" },
  bike: { Icon: Bike, cls: "bg-blue-50 text-blue-700" },
  box: { Icon: Box, cls: "bg-surface-soft text-ink-2" },
  alert: { Icon: TriangleAlert, cls: "bg-red-soft text-red-ink" },
};

type Phase = "idle" | "checked" | "flying" | "collapsing" | "gone";

export function TasksList({ className }: { className?: string }) {
  const initial = [...mockTasks].sort(
    (a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0),
  );
  const [phases, setPhases] = useState<Phase[]>(
    initial.map((t) => (t.done ? "checked" : "idle")),
  );

  const handleCheck = (i: number) => {
    setPhases((p) => {
      if (p[i] !== "idle") return p;
      const next = [...p];
      next[i] = "checked";
      return next;
    });
    setTimeout(() => {
      setPhases((p) => {
        const next = [...p];
        if (next[i] === "checked") next[i] = "flying";
        return next;
      });
    }, 180);
    setTimeout(() => {
      setPhases((p) => {
        const next = [...p];
        if (next[i] === "flying") next[i] = "collapsing";
        return next;
      });
    }, 180 + 700);
    setTimeout(() => {
      setPhases((p) => {
        const next = [...p];
        if (next[i] === "collapsing") next[i] = "gone";
        return next;
      });
    }, 180 + 700 + 280);
  };

  return (
    <Card className={className}>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="m-0 text-base font-bold tracking-[-0.005em]">
          Задачи на сегодня
        </h3>
        <StatusPill tone="soon">{initial.length}</StatusPill>
      </div>
      <div className="mb-1.5 text-xs text-muted">просроченные первыми</div>
      <div>
        {initial.map((t, i) => {
          const phase = phases[i];
          if (phase === "gone") return null;
          return (
            <TaskRow
              key={i}
              task={t}
              phase={phase}
              onCheck={() => handleCheck(i)}
            />
          );
        })}
      </div>
    </Card>
  );
}

function TaskRow({
  task,
  phase,
  onCheck,
}: {
  task: TaskItem;
  phase: Phase;
  onCheck: () => void;
}) {
  const checked = phase === "checked" || phase === "flying";
  const { Icon, cls } = ICONS[task.icon];

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 border-b border-border py-2.5 last:border-b-0",
        phase === "flying" && "pointer-events-none",
      )}
      style={
        phase === "flying"
          ? {
              animation:
                "task-flyaway 700ms cubic-bezier(0.55,0,0.3,1) forwards",
            }
          : phase === "collapsing"
            ? {
                animation:
                  "task-collapse 260ms cubic-bezier(0.4,0,0.2,1) forwards",
                maxHeight: 80,
                overflow: "hidden",
              }
            : undefined
      }
    >
      <button
        type="button"
        onClick={onCheck}
        className={cn(
          "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors",
          checked
            ? "border-green bg-green text-white"
            : "border-border-strong bg-white text-transparent hover:border-blue-600",
        )}
      >
        <Check
          size={12}
          strokeWidth={3}
          className={cn(
            "transition-all",
            checked ? "opacity-100 scale-100" : "opacity-0 scale-50",
          )}
        />
      </button>
      <div
        className={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg",
          cls,
        )}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-[13px] font-semibold text-ink",
            checked && "line-through text-muted",
            task.overdue && !checked && "text-red-ink",
          )}
        >
          {task.title}
        </div>
        <div className="mt-0.5 text-[11px] text-muted">
          {task.overdue && (
            <span className="font-semibold text-red-ink">⚠ </span>
          )}
          {task.meta}
        </div>
      </div>
    </div>
  );
}
