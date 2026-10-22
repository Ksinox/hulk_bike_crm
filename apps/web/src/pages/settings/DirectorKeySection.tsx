import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  LifeBuoy,
  Loader2,
  Printer,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApprovalsStatus } from "@/lib/api/approvals";
import { useCreateRecoveryCodes, useRecoveryCodesStatus } from "@/lib/api/auth";
import { DirectorCodeRing } from "@/components/DirectorCode";
import { toast } from "@/lib/toast";

/**
 * Защита директора (настройки). Видна ТОЛЬКО директору — из его аккаунта.
 *
 *  · Меняющийся код (22.10): 6 цифр, меняются каждые 30 секунд, считает
 *    сервер. Это и есть защита — без выключателя и постоянного ключа
 *    (заказчик). Главный путь — запрос директору и «Подтвердить» одной
 *    кнопкой; код — когда директор рядом и диктует.
 *  · Коды восстановления пароля — «как на GitHub»: 10 одноразовых кодов на
 *    случай, если директор забыл пароль.
 */
export function DirectorKeySection() {
  const { data } = useApprovalsStatus();
  if (!data?.isDirector) return null;
  return (
    <section className="rounded-2xl bg-surface p-5 shadow-card-sm">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck size={16} className="text-blue-600" />
        <div className="text-[14px] font-semibold text-ink">Защита директора</div>
        <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[11px] font-bold text-muted">
          видно только вам
        </span>
      </div>
      <p className="mb-4 max-w-xl text-[12.5px] leading-relaxed text-muted">
        Защищённые действия (удаление аренды, перенос техники между
        категориями, отмена старых операций, правка принятых денег) сотрудник
        выполняет только с вашего подтверждения: запрос приходит вам в CRM — на
        телефон или компьютер, — вы смотрите, что за операция, и жмёте
        «Подтвердить». Если вы рядом — продиктуйте сотруднику код.
      </p>
      <div className="flex flex-col gap-4">
        <CodeBlock />
        <RecoveryBlock />
      </div>
    </section>
  );
}

function CodeBlock() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0b1220] p-5 text-white">
      <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-blue-600/25 blur-[60px]" />
      <div className="relative flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <DirectorCodeRing size={208} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="font-display text-[18px] font-bold">Меняющийся код</div>
          <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-white/60">
            Новый код каждые 30 секунд, каждый срабатывает один раз. Код видите
            только вы — у сотрудников его нет. Открыть его можно и кнопкой
            «Код» в шапке.
          </p>
        </div>
      </div>
    </div>
  );
}

const CODES_FILE_NAME = "halk-bike-kody-vosstanovleniya.txt";

function codesText(codes: string[]): string {
  return [
    "Халк Байк CRM — коды восстановления пароля директора",
    `Созданы: ${new Date().toLocaleString("ru-RU")}`,
    "",
    "Каждый код срабатывает один раз. Храните отдельно от компьютера с CRM.",
    "Забыли пароль: экран входа → ваша плитка → «Забыли пароль?».",
    "",
    ...codes,
    "",
  ].join("\n");
}

function RecoveryBlock() {
  const { data } = useRecoveryCodesStatus();
  const create = useCreateRecoveryCodes();
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (!password) return;
    setError(null);
    try {
      const r = await create.mutateAsync(password);
      setCodes(r.codes);
      setAsking(false);
      setPassword("");
    } catch (e) {
      setError((e as { status?: number }).status === 403 ? "Неверный пароль." : "Не получилось — попробуйте ещё раз.");
    }
  };

  const download = () => {
    if (!codes) return;
    const url = URL.createObjectURL(new Blob([codesText(codes)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = CODES_FILE_NAME;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const print = () => {
    if (!codes) return;
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.appendChild(f);
    const d = f.contentDocument!;
    d.open();
    d.write(
      `<pre style="font:16px/1.7 ui-monospace,Consolas,monospace;padding:24px">${codesText(codes).replace(/</g, "&lt;")}</pre>`,
    );
    d.close();
    f.contentWindow!.focus();
    f.contentWindow!.print();
    setTimeout(() => f.remove(), 1000);
  };
  const copy = () => {
    if (!codes) return;
    navigator.clipboard?.writeText(codes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-ink">
        <LifeBuoy size={15} className="text-orange-600" /> Коды восстановления пароля
        {data && data.total > 0 && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold",
              data.left <= 2 ? "bg-red-soft text-red-ink" : "bg-green-soft text-green-ink",
            )}
          >
            осталось {data.left} из {data.total}
          </span>
        )}
      </div>
      <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">
        Если забудете пароль — на экране входа нажмите «Забыли пароль?», введите
        один из кодов и задайте новый пароль. Каждый код срабатывает один раз.
        Храните их не на этом компьютере: распечатайте или сохраните файлом.
      </p>

      {codes ? (
        <div className="mt-3 rounded-2xl border-2 border-orange-200 bg-orange-soft/25 p-4">
          <div className="text-[13px] font-bold text-orange-900">
            Сохраните коды сейчас — больше они не покажутся.
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[16px] font-bold tracking-wider text-ink sm:max-w-md">
            {codes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={download} className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-[13px] font-bold text-white hover:bg-blue-600">
              <Download size={15} /> Скачать файлом
            </button>
            <button type="button" onClick={print} className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-[13px] font-bold text-ink shadow-card-sm hover:bg-surface-soft">
              <Printer size={15} /> Распечатать
            </button>
            <button type="button" onClick={copy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-[13px] font-bold text-ink shadow-card-sm hover:bg-surface-soft">
              {copied ? <Check size={15} className="text-green-ink" /> : <Copy size={15} />}
              {copied ? "Скопировано" : "Скопировать"}
            </button>
            <button type="button" onClick={() => setCodes(null)} className="inline-flex h-11 items-center rounded-xl px-4 text-[13px] font-bold text-muted hover:text-ink">
              Я сохранил
            </button>
          </div>
        </div>
      ) : asking ? (
        <div className="mt-3 flex max-w-md flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={password}
            autoFocus
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ваш пароль для входа"
            autoComplete="current-password"
            className={cn(
              "h-11 min-w-0 flex-1 rounded-xl border-2 bg-surface px-3 text-[14px] font-semibold text-ink outline-none",
              error ? "border-red-300" : "border-border focus:border-blue-500",
            )}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!password || create.isPending}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[13.5px] font-bold text-white hover:bg-blue-600 disabled:opacity-40"
          >
            {create.isPending && <Loader2 size={15} className="animate-spin" />}
            Создать коды
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-[13.5px] font-bold text-white hover:bg-blue-600"
        >
          <LifeBuoy size={15} />
          {data && data.total > 0 ? "Создать новые коды (старые перестанут действовать)" : "Создать коды восстановления"}
        </button>
      )}
      {error && <div className="mt-2 text-[12.5px] font-semibold text-red-ink">{error}</div>}
    </div>
  );
}
