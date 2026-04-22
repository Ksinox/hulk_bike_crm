import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  User,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogin, useLoginTiles, type LoginTile } from "@/lib/api/auth";

/**
 * Экран входа. Тайлы юзеров — как на Windows login screen.
 * Creator'ы скрыты: появляются только если пользователь набрал на клавиатуре
 * секретное слово (по умолчанию "ksinox").
 */
export function Login() {
  const [unlock, setUnlock] = useState<string>("");
  const [typed, setTyped] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const { data: tiles = [], isLoading } = useLoginTiles(unlock);
  const loginMut = useLogin();

  // Секрет совпадает с CREATOR_UNLOCK_SEQUENCE на сервере
  const UNLOCK_SECRET = "ksinox";

  // Слушаем нажатия клавиш, ищем последовательность UNLOCK_SECRET
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Игнорируем если пользователь вводит пароль
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key.length !== 1) return; // только печатные
      const next = (typed + e.key.toLowerCase()).slice(-UNLOCK_SECRET.length);
      setTyped(next);
      if (next === UNLOCK_SECRET) {
        setUnlock(UNLOCK_SECRET);
        setTyped("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typed]);

  useEffect(() => {
    if (selectedId != null) {
      setPassword("");
      setErrorMsg(null);
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    }
  }, [selectedId]);

  const selected = useMemo(
    () => tiles.find((t) => t.id === selectedId),
    [tiles, selectedId],
  );

  const handleLogin = async () => {
    if (!selected || !password.trim()) return;
    setErrorMsg(null);
    try {
      await loginMut.mutateAsync({
        login: selected.login,
        password,
        remember,
      });
      window.location.href = "/";
    } catch {
      setErrorMsg("Неверный пароль. Попробуйте ещё раз.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0d14] text-white">
      {/* ==== Едва уловимое зелёное свечение — огромный мягкий радиальный ореол, почти весь за кадром ==== */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[60vh] overflow-visible">
        <div className="login-glow absolute left-1/2 bottom-[-420px] h-[620px] w-[120%] max-w-[1600px] -translate-x-1/2 rounded-[50%] bg-emerald-500/35 blur-[160px]" />
        <div className="login-glow-sub absolute left-1/2 bottom-[-360px] h-[500px] w-[90%] max-w-[1200px] -translate-x-1/2 rounded-[50%] bg-emerald-400/25 blur-[130px]" />
      </div>

      {/* ==== Контент — по центру экрана ==== */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-16">
        {/* Заголовок */}
        <div className="mb-14 text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.3em] text-white/35">
            Вход в систему
          </div>
          <h1
            className="mt-4 bg-gradient-to-b from-white via-white/95 to-white/40 bg-clip-text font-display text-[84px] font-bold uppercase leading-[0.95] tracking-[-0.03em] text-transparent sm:text-[104px]"
            style={{ WebkitBackgroundClip: "text" }}
          >
            ХАЛК&nbsp;БАЙК
          </h1>
        </div>

        {/* Тайлы — glassmorphism */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-white/60">
            <Loader2 className="animate-spin" size={16} /> Загрузка…
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-5">
            {tiles.map((t) => (
              <Tile
                key={t.id}
                tile={t}
                selected={selectedId === t.id}
                onClick={() => setSelectedId(t.id)}
              />
            ))}
          </div>
        )}

        {unlock && (
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-purple-400/30 bg-purple-500/15 px-3 py-1 text-[11px] font-bold text-purple-200 backdrop-blur">
            <Crown size={12} /> Режим creator разблокирован
          </div>
        )}
      </div>

      {/* ==== Модалка ввода пароля — тайлы остаются на месте ==== */}
      {selected && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center px-6 login-modal-backdrop"
          onClick={() => setSelectedId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="login-modal-card w-full max-w-[420px] rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
          >
            <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-white/90">
              {selected.name}
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">
                {roleLabel(selected.role)}
              </span>
            </div>
            <div className="relative">
              <input
                ref={passwordInputRef}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
                placeholder="Пароль"
                autoComplete="current-password"
                className="h-11 w-full rounded-[12px] border border-white/15 bg-white/[0.06] px-4 pr-10 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-emerald-400/60 focus:bg-white/[0.08]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-white/70">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-400"
              />
              Запомнить на 30 дней
            </label>

            {errorMsg && (
              <div className="mt-3 rounded-[10px] border border-red-400/30 bg-red-500/15 px-3 py-2 text-[12px] text-red-100">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loginMut.isPending || !password.trim()}
              className={cn(
                "mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold transition-all",
                loginMut.isPending || !password.trim()
                  ? "cursor-not-allowed bg-white/10 text-white/40"
                  : "bg-white text-[#0a0d14] shadow-[0_4px_24px_rgba(16,185,129,0.25)] hover:bg-emerald-50",
              )}
            >
              {loginMut.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  Войти <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ==== Футер (абсолютно внизу) ==== */}
      <div className="absolute inset-x-0 bottom-4 z-10 text-center text-[11px] text-white/25">
        © {new Date().getFullYear()} Халк Байк
      </div>

      {/* Inline keyframes для дыхания свечения */}
      <style>{`
        @keyframes hulkGlow {
          0%, 100% { opacity: 0.85; transform: translate(-50%, 0) scale(1); }
          50%      { opacity: 1;    transform: translate(-50%, -2%) scale(1.04); }
        }
        @keyframes hulkGlowSub {
          0%, 100% { opacity: 0.6; transform: translate(-50%, 0) scale(1); }
          50%      { opacity: 0.9; transform: translate(-50%, -4%) scale(1.08); }
        }
        .login-glow     { animation: hulkGlow 6s ease-in-out infinite; }
        .login-glow-sub { animation: hulkGlowSub 4s ease-in-out infinite; }

        @keyframes hulkModalBackdrop {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to   { opacity: 1; backdrop-filter: blur(8px); }
        }
        @keyframes hulkModalCard {
          from { opacity: 0; transform: translateY(14px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        .login-modal-backdrop {
          background: rgba(10,13,20,0.55);
          backdrop-filter: blur(8px);
          animation: hulkModalBackdrop 220ms ease-out both;
        }
        .login-modal-card {
          animation: hulkModalCard 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
      `}</style>
    </div>
  );
}

/* ========== Тайл в glassmorphism ========== */

function Tile({
  tile,
  selected,
  onClick,
}: {
  tile: LoginTile;
  selected: boolean;
  onClick: () => void;
}) {
  const initials = tile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const Icon = roleIcon(tile.role);
  const accentRing = roleAccent(tile.role);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-[180px] w-[160px] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl p-4 backdrop-blur-xl transition-all duration-300",
        "border border-white/15 bg-white/[0.06]",
        "shadow-[0_8px_32px_rgba(0,0,0,0.35)] hover:border-white/30 hover:bg-white/[0.1]",
        selected && "scale-[1.03] border-white/50 bg-white/[0.12] ring-2 ring-white/30",
      )}
    >
      {tile.role === "creator" && (
        <span className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400/20 text-yellow-300 ring-1 ring-yellow-300/40">
          <Crown size={12} />
        </span>
      )}

      {/* Цветной «блик» сверху */}
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-[60px] bg-gradient-to-b to-transparent opacity-60",
          accentRing.gradient,
        )}
      />

      <div
        className={cn(
          "relative z-10 flex h-16 w-16 items-center justify-center rounded-full font-display text-[22px] font-extrabold text-white backdrop-blur-md ring-1",
          accentRing.bg,
          accentRing.ring,
        )}
      >
        {initials || "?"}
      </div>
      <div className="relative z-10 text-center">
        <div className="text-[13px] font-bold text-white">{tile.name}</div>
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/80">
          <Icon size={9} />
          {roleLabel(tile.role)}
        </div>
      </div>
    </button>
  );
}

function roleAccent(role: LoginTile["role"]): {
  gradient: string;
  bg: string;
  ring: string;
} {
  switch (role) {
    case "creator":
      return {
        gradient: "from-purple-400/30",
        bg: "bg-purple-500/40",
        ring: "ring-purple-300/30",
      };
    case "director":
      return {
        gradient: "from-blue-400/30",
        bg: "bg-blue-500/40",
        ring: "ring-blue-300/30",
      };
    case "mechanic":
      return {
        gradient: "from-orange-400/30",
        bg: "bg-orange-500/40",
        ring: "ring-orange-300/30",
      };
    case "accountant":
      return {
        gradient: "from-pink-400/30",
        bg: "bg-pink-500/40",
        ring: "ring-pink-300/30",
      };
    case "admin":
    default:
      return {
        gradient: "from-emerald-400/30",
        bg: "bg-emerald-500/40",
        ring: "ring-emerald-300/30",
      };
  }
}

function roleIcon(role: LoginTile["role"]) {
  switch (role) {
    case "creator":
      return Crown;
    case "director":
      return ShieldCheck;
    case "mechanic":
      return Wrench;
    case "accountant":
      return User;
    case "admin":
    default:
      return ShieldCheck;
  }
}

function roleLabel(role: LoginTile["role"]): string {
  switch (role) {
    case "creator":
      return "Creator";
    case "director":
      return "Директор";
    case "admin":
      return "Админ";
    case "mechanic":
      return "Механик";
    case "accountant":
      return "Бухгалтер";
  }
}
