import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Loader2, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useApprovalsStatus, type DirectorCode } from "@/lib/api/approvals";
import { toast } from "@/lib/toast";

/**
 * 22.10 — меняющийся код директора (как в Google Authenticator).
 *
 * Код считает сервер, сюда он приходит только в аккаунт директора.
 * Зелёная линия бежит по кругу 30 секунд, кончилась — новый код. Ближе к
 * концу линия желтеет и краснеет: диктовать такой код уже поздно.
 */

const PERIOD_MS = 30_000;

/** Сколько осталось до смены окна — по часам сервера (offset), без запросов. */
function useCountdown(offsetMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const t = now + offsetMs;
  return PERIOD_MS - (t % PERIOD_MS);
}

/** Живой код: запрос при открытии и ровно в момент смены окна. */
function useLiveCode() {
  const [data, setData] = useState<DirectorCode | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const sent = Date.now();
    try {
      const r = await api.get<DirectorCode>("/api/approvals/code");
      const got = Date.now();
      setOffset(r.serverNow - (sent + got) / 2);
      setData(r);
      setError(null);
      const wait = Math.max(300, r.endsAt - r.serverNow + 250);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, wait);
    } catch {
      setError("Код не получен — проверьте связь");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(load, 3000);
    }
  }, []);

  useEffect(() => {
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [load]);

  return { data, offset, error };
}

function ringColor(leftMs: number) {
  if (leftMs <= 5_000) return "#f87171";
  if (leftMs <= 10_000) return "#fbbf24";
  return "#34d399";
}

/** Большое кольцо с кодом внутри. */
export function DirectorCodeRing({ size = 248 }: { size?: number }) {
  const { data, offset, error } = useLiveCode();
  const left = useCountdown(offset);
  const stroke = Math.round(size * 0.034);
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const frac = left / PERIOD_MS;
  const color = ringColor(left);
  const secs = Math.ceil(left / 1000);
  // Код, пришедший до смены окна, в последние миллисекунды не показываем как
  // «свежий»: если окно сменилось, а ответа ещё нет — точки вместо цифр.
  const stale = data ? Date.now() + offset >= data.endsAt + 50 : true;
  const code = data && !stale ? data.code : null;

  // 22.10 (заказчик): аккуратная кнопка «Скопировать» — код можно
  // переслать в мессенджер. Живёт он мало (это окно и следующее, до ~1 мин).
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => toast.error("Не скопировалось", "Продиктуйте код голосом"),
    );
  };

  return (
    <div className="flex flex-col items-center gap-4">
    <div
      className="relative mx-auto block select-none rounded-full"
      style={{ width: size, height: size }}
    >
      {/* мягкое свечение цвета линии */}
      <span
        className="pointer-events-none absolute inset-[12%] rounded-full blur-[38px] transition-colors duration-700"
        style={{ backgroundColor: color, opacity: 0.22 }}
      />
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke 600ms ease", filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/45">
          Код директора
        </span>
        {code ? (
          <span
            key={code}
            className="dc-flip mt-1.5 font-display font-extrabold tabular-nums leading-none text-white"
            style={{ fontSize: size * 0.165, letterSpacing: "0.04em" }}
          >
            {code.slice(0, 3)}
            <span className="inline-block" style={{ width: size * 0.05 }} />
            {code.slice(3)}
          </span>
        ) : (
          <span className="mt-3 flex h-[1em] items-center text-white/50" style={{ fontSize: size * 0.165 }}>
            {error ? (
              <span className="text-[13px] font-semibold text-red-200">{error}</span>
            ) : (
              <Loader2 className="animate-spin" size={size * 0.1} />
            )}
          </span>
        )}
        <span
          className="mt-2.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold tabular-nums transition-colors"
          style={{ color, backgroundColor: `${color}1f` }}
        >
          {secs} с
        </span>
      </span>
      <style>{`
        @keyframes dcFlip {
          0%   { opacity: 0; transform: translateY(10px) scale(0.96); filter: blur(4px); }
          100% { opacity: 1; transform: none; filter: none; }
        }
        .dc-flip { animation: dcFlip 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
      `}</style>
    </div>
    <button
      type="button"
      onClick={copy}
      disabled={!code}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-bold transition-colors disabled:opacity-40",
        copied ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/85 hover:bg-white/15 active:bg-white/20",
      )}
    >
      {copied ? <Check size={15} strokeWidth={3} /> : <Copy size={15} />}
      {copied ? "Скопировано" : "Скопировать"}
    </button>
    </div>
  );
}

/** Маленькое кольцо для кнопки в шапке — идёт по часам, без запроса кода. */
function MiniRing({ size = 18 }: { size?: number }) {
  const left = useCountdown(0);
  const stroke = 2.5;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={ringColor(left)}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - left / PERIOD_MS)}
      />
    </svg>
  );
}

/**
 * Кнопка «Код» в шапке — только у директора и только когда код включён.
 * У администратора её нет вовсе: код ему диктуют, сам он его не видит.
 */
export function DirectorCodeButton({ compact = false }: { compact?: boolean }) {
  const { data } = useApprovalsStatus();
  const [open, setOpen] = useState(false);
  if (!data?.isDirector || data.mode !== "code") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Меняющийся код директора"
        className={cn(
          "flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink text-[12.5px] font-bold text-white transition-transform hover:scale-[1.03] active:scale-95",
          compact ? "px-2.5" : "px-3",
        )}
      >
        <MiniRing />
        Код
      </button>
      {open && <DirectorCodeSheet onClose={() => setOpen(false)} />}
    </>
  );
}

export function DirectorCodeSheet({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[185] flex items-end justify-center bg-ink/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        data-director-code-sheet
        className="relative w-full max-w-[400px] overflow-hidden rounded-t-[28px] bg-[#0b1220] px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-5 text-white shadow-card-lg sm:rounded-[28px]"
      >
        <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-blue-600/30 blur-[60px]" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <ShieldCheck size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
              Виден только вам
            </div>
            <div className="font-display text-[17px] font-bold leading-tight">Меняющийся код</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>
        <div className="relative py-6">
          <DirectorCodeRing />
        </div>
        <p className="relative text-center text-[13px] leading-relaxed text-white/60">
          Продиктуйте код сотруднику или скопируйте и отправьте — он введёт
          его в окне подтверждения. Код срабатывает один раз; новый — каждые
          30&nbsp;секунд.
        </p>
      </div>
    </div>,
    document.body,
  );
}
