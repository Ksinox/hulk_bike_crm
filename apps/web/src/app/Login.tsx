import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bike, Crown, Eye, EyeOff, Loader2, ShieldCheck, User, Wrench } from "lucide-react";
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

  // Автофокус на поле пароля после выбора тайла
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
      // После входа перезагружаем страницу — App увидит сессию и нарисует CRM
      window.location.href = "/";
    } catch (err) {
      setErrorMsg(
        "Неверный пароль. Попробуй ещё раз.",
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1d29] via-[#1f2335] to-[#131520] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col justify-center px-8 py-12">
        {/* Логотип + название */}
        <div className="mb-16 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-ink shadow-card-lg">
            <Bike size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-display text-[22px] font-extrabold leading-tight">
              Халк Байк CRM
            </div>
            <div className="text-[12px] text-white/50">
              Прокат и продажа скутеров
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="text-[13px] uppercase tracking-wider text-white/40">
            Выберите учётную запись
          </div>
        </div>

        {/* Тайлы */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-white/60">
            <Loader2 className="animate-spin" size={16} /> Загрузка…
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
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

        {/* Форма пароля — появляется при выбранном тайле */}
        {selected && (
          <div className="mt-8 max-w-[420px] rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur">
            <div className="mb-3 text-[13px] font-semibold text-white/80">
              {selected.name}
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">
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
                className="h-11 w-full rounded-[12px] border border-white/15 bg-white/5 px-4 pr-10 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-white/40"
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
                className="h-3.5 w-3.5 accent-white"
              />
              Запомнить на 30 дней
            </label>

            {errorMsg && (
              <div className="mt-3 rounded-[10px] bg-red-ink/20 px-3 py-2 text-[12px] text-red-100">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loginMut.isPending || !password.trim()}
              className={cn(
                "mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-bold transition-colors",
                loginMut.isPending || !password.trim()
                  ? "cursor-not-allowed bg-white/10 text-white/40"
                  : "bg-white text-ink hover:bg-white/90",
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
        )}

        {unlock && (
          <div className="mt-10 inline-flex w-fit items-center gap-2 rounded-full bg-purple-ink/30 px-3 py-1 text-[11px] font-bold text-purple-100 ring-1 ring-purple-200/30">
            <Crown size={12} /> Режим creator разблокирован
          </div>
        )}

        <div className="mt-auto pt-12 text-[11px] text-white/30">
          © {new Date().getFullYear()} Халк Байк · v{import.meta.env.VITE_APP_VERSION ?? ""}
        </div>
      </div>
    </div>
  );
}

/* ========== Компоненты ========== */

function Tile({
  tile,
  selected,
  onClick,
}: {
  tile: LoginTile;
  selected: boolean;
  onClick: () => void;
}) {
  const bg = tileBg(tile.avatarColor);
  const initials = tile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const Icon = roleIcon(tile.role);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-[180px] w-[160px] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl p-4 transition-all",
        selected
          ? "scale-[1.02] ring-2 ring-white"
          : "ring-1 ring-white/10 hover:ring-white/30",
        bg,
      )}
    >
      {tile.role === "creator" && (
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/30 text-yellow-300">
          <Crown size={12} />
        </span>
      )}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 font-display text-[22px] font-extrabold text-white backdrop-blur">
        {initials || "?"}
      </div>
      <div className="text-center">
        <div className="text-[13px] font-bold text-white">{tile.name}</div>
        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/80">
          <Icon size={9} />
          {roleLabel(tile.role)}
        </div>
      </div>
    </button>
  );
}

function tileBg(color: string): string {
  switch (color) {
    case "purple":
      return "bg-gradient-to-br from-purple-500 to-purple-700";
    case "green":
      return "bg-gradient-to-br from-emerald-500 to-emerald-700";
    case "orange":
      return "bg-gradient-to-br from-orange-500 to-orange-700";
    case "pink":
      return "bg-gradient-to-br from-pink-500 to-pink-700";
    case "blue":
    default:
      return "bg-gradient-to-br from-blue-500 to-blue-700";
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

