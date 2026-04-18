import { cn } from "@/lib/utils";

type Tone = "active" | "late" | "done" | "soon" | "purple";

const toneClass: Record<Tone, { bg: string; dot: string }> = {
  active: { bg: "bg-blue-50 text-blue-700", dot: "bg-blue" },
  late: { bg: "bg-red-soft text-red-ink", dot: "bg-red" },
  done: { bg: "bg-green-soft text-green-ink", dot: "bg-green" },
  soon: { bg: "bg-orange-soft text-orange-ink", dot: "bg-orange" },
  purple: { bg: "bg-purple-soft text-purple-ink", dot: "bg-purple" },
};

export function StatusPill({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  const c = toneClass[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        c.bg,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {children}
    </span>
  );
}
