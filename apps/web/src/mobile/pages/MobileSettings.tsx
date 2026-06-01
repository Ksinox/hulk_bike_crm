import { useState } from "react";
import { LogOut, Save, Pencil } from "lucide-react";
import { useAppSettings, useSetAppSetting } from "@/lib/api/app-settings";
import { useMe, useLogout, type AuthRole } from "@/lib/api/auth";
import { ProfileModal } from "@/pages/dashboard/ProfileModal";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<AuthRole, string> = {
  creator: "Создатель",
  director: "Директор",
  admin: "Администратор",
  mechanic: "Механик",
  accountant: "Бухгалтер",
};

const AVATAR_CLS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-soft text-green-ink",
  orange: "bg-orange-soft text-orange-ink",
  pink: "bg-red-soft text-red-ink",
  purple: "bg-purple-soft text-purple-ink",
};

export function MobileSettings() {
  const { data: me } = useMe();
  const settingsQ = useAppSettings();
  const setMut = useSetAppSetting();
  const logoutMut = useLogout();

  const isAdmin =
    me?.role === "director" || me?.role === "creator" || me?.role === "admin";

  const map = new Map((settingsQ.data ?? []).map((s) => [s.key, s.value]));
  const [periodDay, setPeriodDay] = useState(
    () => map.get("billing_period_start_day") ?? "15",
  );
  const [workStart, setWorkStart] = useState(() => map.get("work_hours_start") ?? "9");
  const [workEnd, setWorkEnd] = useState(() => map.get("work_hours_end") ?? "22");
  const [profileOpen, setProfileOpen] = useState(false);

  const savePeriod = async () => {
    const n = Number(periodDay);
    if (!Number.isFinite(n) || n < 1 || n > 28) {
      toast.error("Неверное значение", "Допустимо число от 1 до 28.");
      return;
    }
    try {
      await setMut.mutateAsync({ key: "billing_period_start_day", value: String(Math.floor(n)) });
      toast.success("Сохранено", "Расчётный период обновлён.");
    } catch (e) {
      toast.error("Не удалось сохранить", (e as Error).message ?? "");
    }
  };

  const saveWorkHours = async () => {
    const s = Number(workStart);
    const e = Number(workEnd);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || s > 23 || e < 1 || e > 24 || e <= s) {
      toast.error("Неверный график", "Открытие 0..23, закрытие 1..24, закрытие позже открытия.");
      return;
    }
    try {
      await Promise.all([
        setMut.mutateAsync({ key: "work_hours_start", value: String(Math.floor(s)) }),
        setMut.mutateAsync({ key: "work_hours_end", value: String(Math.floor(e)) }),
      ]);
      toast.success("График сохранён", `${s}:00 — ${e}:00.`);
    } catch (e2) {
      toast.error("Не удалось сохранить", (e2 as Error).message ?? "");
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMut.mutateAsync();
    } finally {
      window.location.reload();
    }
  };

  const initials = (me?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex flex-col gap-4">
      {/* Профиль */}
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-4 shadow-card">
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full text-[18px] font-bold",
            AVATAR_CLS[me?.avatarColor ?? "blue"] ?? "bg-blue-50 text-blue-600",
          )}
        >
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] font-bold text-ink">{me?.name}</div>
          <div className="text-[12px] text-muted">
            {me ? ROLE_LABEL[me.role] : ""} · @{me?.login}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-muted active:scale-95"
          aria-label="Редактировать профиль"
        >
          <Pencil size={16} />
        </button>
      </div>

      {isAdmin && (
        <>
          <SettingCard
            title="Расчётный период"
            hint="День месяца, с которого начинается финансовый период"
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={28}
                value={periodDay}
                onChange={(e) => setPeriodDay(e.target.value)}
                className="h-11 w-20 rounded-xl bg-surface-soft px-3 text-center text-[15px] font-bold text-ink outline-none focus:ring-2 focus:ring-blue-100"
              />
              <span className="text-[13px] text-muted">число месяца</span>
              <SaveBtn onClick={savePeriod} pending={setMut.isPending} />
            </div>
          </SettingCard>

          <SettingCard title="Часы работы" hint="Границы для часового графика выручки">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={23}
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="h-11 w-16 rounded-xl bg-surface-soft px-3 text-center text-[15px] font-bold text-ink outline-none focus:ring-2 focus:ring-blue-100"
              />
              <span className="text-muted">—</span>
              <input
                type="number"
                min={1}
                max={24}
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="h-11 w-16 rounded-xl bg-surface-soft px-3 text-center text-[15px] font-bold text-ink outline-none focus:ring-2 focus:ring-blue-100"
              />
              <span className="text-[13px] text-muted">часы</span>
              <SaveBtn onClick={saveWorkHours} pending={setMut.isPending} />
            </div>
          </SettingCard>
        </>
      )}

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center justify-center gap-2 rounded-2xl bg-surface py-3.5 text-[14px] font-bold text-red shadow-card-sm active:scale-[0.99]"
      >
        <LogOut size={18} /> Выйти из аккаунта
      </button>

      <p className="text-center text-[12px] text-muted-2">
        Управление сотрудниками, тарифами и шаблонами — на компьютере
      </p>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}

function SettingCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card-sm">
      <div className="text-[14px] font-bold text-ink">{title}</div>
      {hint && <div className="mb-3 mt-0.5 text-[12px] text-muted">{hint}</div>}
      {children}
    </div>
  );
}

function SaveBtn({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="ml-auto flex h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-[13px] font-bold text-white disabled:opacity-50"
    >
      <Save size={15} /> Сохранить
    </button>
  );
}
