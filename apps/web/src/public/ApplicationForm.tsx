import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import {
  ApiError,
  applicationApi,
  type ApplicationFields,
  type FileKind,
} from "./applicationApi";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type DraftSnapshot,
} from "./applicationDraft";
import { PhotoUpload } from "./PhotoUpload";
import {
  dateRuToIso,
  formatDateRu,
  formatDivisionCode,
  formatPhone,
  isoToDateRu,
  nullableTrim,
  validateBirth,
  validateName,
  validatePassportNumber,
  validatePhone,
  validateSeries,
} from "./formatters";

/**
 * Публичная форма анкеты клиента.
 *
 * Открывается по ссылке вида https://crm.hulk-bike.ru/apply без авторизации.
 * Постоянная ссылка — каждый заход = новая заявка (как Google Forms).
 *
 * Поток:
 *  Step 1 — контакты (ФИО, телефон, доп. телефон, ДР, гражданство)
 *  Step 2 — паспорт (РФ: серия+номер+выдан+код+регистрация; иностранец: passportRaw)
 *  Step 3 — адрес проживания
 *  Step 4 — 4 фото (паспорт главный, паспорт прописка, ВУ, селфи)
 *  Step 5 — подтверждение, согласие на ПДн, отправка
 *
 * Черновик автосохраняется в localStorage и через PATCH на сервер.
 */

type FormState = {
  // Контакты
  name: string;
  phone: string;
  extraPhone: string;
  birth: string; // ДД.ММ.ГГГГ
  isForeigner: boolean;

  // Паспорт
  passportRaw: string;
  passSer: string;
  passNum: string;
  passDate: string; // ДД.ММ.ГГГГ
  passIssuer: string;
  passCode: string;
  passRegistration: string;

  // Адрес
  sameAddress: boolean;
  liveAddress: string;

  // Согласие на ПДн (чекбокс на step 5)
  agreedPdn: boolean;

  // Honeypot — реальный клиент не видит, бот заполнит
  honeypot: string;
};

const EMPTY: FormState = {
  name: "",
  phone: "",
  extraPhone: "",
  birth: "",
  isForeigner: false,
  passportRaw: "",
  passSer: "",
  passNum: "",
  passDate: "",
  passIssuer: "",
  passCode: "",
  passRegistration: "",
  sameAddress: true,
  liveAddress: "",
  agreedPdn: false,
  honeypot: "",
};

const TOTAL_STEPS = 5;

function fieldsFromState(s: FormState): ApplicationFields {
  return {
    name: nullableTrim(s.name),
    phone: nullableTrim(s.phone),
    extraPhone: nullableTrim(s.extraPhone),
    isForeigner: s.isForeigner,
    passportRaw: s.isForeigner ? nullableTrim(s.passportRaw) : null,
    birthDate: dateRuToIso(s.birth),
    passportSeries: s.isForeigner ? null : nullableTrim(s.passSer),
    passportNumber: s.isForeigner ? null : nullableTrim(s.passNum),
    passportIssuedOn: s.isForeigner ? null : dateRuToIso(s.passDate),
    passportIssuer: s.isForeigner ? null : nullableTrim(s.passIssuer),
    passportDivisionCode: s.isForeigner ? null : nullableTrim(s.passCode),
    passportRegistration: s.isForeigner
      ? null
      : nullableTrim(s.passRegistration),
    sameAddress: s.sameAddress,
    liveAddress: s.sameAddress ? null : nullableTrim(s.liveAddress),
    honeypot: s.honeypot || null,
  };
}

function stateFromFields(f: ApplicationFields): Partial<FormState> {
  return {
    name: f.name ?? "",
    phone: f.phone ?? "",
    extraPhone: f.extraPhone ?? "",
    isForeigner: !!f.isForeigner,
    passportRaw: f.passportRaw ?? "",
    birth: isoToDateRu(f.birthDate),
    passSer: f.passportSeries ?? "",
    passNum: f.passportNumber ?? "",
    passDate: isoToDateRu(f.passportIssuedOn),
    passIssuer: f.passportIssuer ?? "",
    passCode: f.passportDivisionCode ?? "",
    passRegistration: f.passportRegistration ?? "",
    sameAddress: f.sameAddress ?? true,
    liveAddress: f.liveAddress ?? "",
  };
}

export function ApplicationForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [appId, setAppId] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Set<FileKind>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Восстановление черновика при mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setForm((prev) => ({ ...prev, ...stateFromFields(draft.fields) }));
      setAppId(draft.applicationId);
      setToken(draft.uploadToken);
      setTokenExpiresAt(draft.expiresAt);
      setUploaded(new Set(draft.uploadedKinds));
      setStep(Math.min(draft.step ?? 1, TOTAL_STEPS));
    }
  }, []);

  // Автосохранение черновика в localStorage (debounced)
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const snapshot: DraftSnapshot = {
        applicationId: appId,
        uploadToken: token,
        expiresAt: tokenExpiresAt,
        fields: fieldsFromState(form),
        step,
        uploadedKinds: Array.from(uploaded),
        savedAt: new Date().toISOString(),
      };
      saveDraft(snapshot);
    }, 500);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [form, appId, token, tokenExpiresAt, uploaded, step]);

  /** Обеспечить наличие черновика на сервере: создаёт новый или обновляет существующий. */
  const ensureDraft = async (): Promise<{ id: number; tok: string }> => {
    const fields = fieldsFromState(form);
    if (appId && token) {
      try {
        await applicationApi.patch(appId, token, fields);
        return { id: appId, tok: token };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          // токен истёк — сбрасываем и создаём новый черновик
          setAppId(null);
          setToken(null);
          setTokenExpiresAt(null);
          setUploaded(new Set());
        } else {
          throw e;
        }
      }
    }
    const created = await applicationApi.create(fields);
    setAppId(created.applicationId);
    setToken(created.uploadToken);
    setTokenExpiresAt(created.expiresAt);
    return { id: created.applicationId, tok: created.uploadToken };
  };

  // Step transitions ─────────────────────────────────────────────────────
  const canNextStep1 =
    !validateName(form.name) &&
    !validatePhone(form.phone) &&
    !validateBirth(form.birth);

  const canNextStep2 = form.isForeigner
    ? form.passportRaw.trim().length > 0
    : !validateSeries(form.passSer) &&
      !validatePassportNumber(form.passNum) &&
      form.passIssuer.trim().length > 0 &&
      !!dateRuToIso(form.passDate) &&
      form.passRegistration.trim().length > 0;

  const canNextStep3 = form.sameAddress || form.liveAddress.trim().length > 0;

  const canNextStep4 = form.isForeigner
    ? uploaded.has("passport_main") &&
      uploaded.has("license") &&
      uploaded.has("selfie")
    : uploaded.has("passport_main") &&
      uploaded.has("passport_reg") &&
      uploaded.has("license") &&
      uploaded.has("selfie");

  const canSubmit = form.agreedPdn && canNextStep1 && canNextStep2 && canNextStep3 && canNextStep4;

  const goNext = async () => {
    setError(null);
    setBusy(true);
    try {
      // Перед переходом на следующий шаг — синкаем поля с сервером
      // (или создаём черновик если ещё нет)
      await ensureDraft();
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setError("Слишком частые запросы. Подождите минуту и попробуйте снова.");
      } else {
        setError("Не удалось сохранить. Проверьте интернет-соединение.");
      }
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const submit = async () => {
    if (!appId || !token) {
      setError("Черновик не создан. Перезагрузите страницу.");
      return;
    }
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    setMissingFields([]);
    try {
      // Финальный sync полей перед submit
      await applicationApi.patch(appId, token, fieldsFromState(form));
      await applicationApi.submit(appId, token);
      clearDraft();
      setSubmitted(true);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 400 && e.body && typeof e.body === "object") {
          const body = e.body as { error?: string; missing?: string[] };
          if (body.error === "incomplete" && Array.isArray(body.missing)) {
            setMissingFields(body.missing);
            setError("Пожалуйста, заполните все обязательные поля.");
            return;
          }
        }
        if (e.status === 401) {
          setError("Сессия истекла. Перезагрузите страницу и заполните заявку заново.");
          return;
        }
      }
      setError("Не удалось отправить. Попробуйте ещё раз через минуту.");
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return <SuccessScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
        <header className="mb-4">
          <div className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
            <ShieldCheck size={20} className="text-emerald-600" />
            Анкета клиента · Халк Байк
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          <div className="mt-1 text-[12px] text-slate-500">
            Шаг {step} из {TOTAL_STEPS}
          </div>
        </header>

        <main className="flex-1">
          {step === 1 && <Step1 form={form} setField={setField} />}
          {step === 2 && <Step2 form={form} setField={setField} />}
          {step === 3 && <Step3 form={form} setField={setField} />}
          {step === 4 && (
            <Step4
              applicationId={appId}
              uploadToken={token}
              isForeigner={form.isForeigner}
              uploaded={uploaded}
              onUploaded={(k) =>
                setUploaded((prev) => {
                  const next = new Set(prev);
                  next.add(k);
                  return next;
                })
              }
              onRemoved={(k) =>
                setUploaded((prev) => {
                  const next = new Set(prev);
                  next.delete(k);
                  return next;
                })
              }
            />
          )}
          {step === 5 && (
            <Step5
              form={form}
              setField={setField}
              missingFields={missingFields}
            />
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}
        </main>

        <footer className="sticky bottom-0 -mx-4 mt-6 border-t border-slate-200 bg-slate-50 px-4 pb-4 pt-3">
          <div className="flex gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                disabled={busy}
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-700 disabled:opacity-50"
              >
                <ArrowLeft size={16} /> Назад
              </button>
            )}
            {step < TOTAL_STEPS && (
              <button
                type="button"
                onClick={goNext}
                disabled={busy || !canStepForward(step, { canNextStep1, canNextStep2, canNextStep3, canNextStep4 })}
                className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Сохраняем…" : "Продолжить"}
                <ArrowRight size={16} />
              </button>
            )}
            {step === TOTAL_STEPS && (
              <button
                type="button"
                onClick={submit}
                disabled={busy || !canSubmit}
                className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Отправляем…" : "Отправить заявку"}
                <Check size={16} />
              </button>
            )}
          </div>
          <input
            type="text"
            name="company_website"
            value={form.honeypot}
            onChange={(e) => setField("honeypot", e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: "absolute", left: -9999, opacity: 0, pointerEvents: "none" }}
          />
        </footer>
      </div>
    </div>
  );
}

// Helpers ──────────────────────────────────────────────────────────────────

function canStepForward(
  step: number,
  flags: {
    canNextStep1: boolean;
    canNextStep2: boolean;
    canNextStep3: boolean;
    canNextStep4: boolean;
  },
): boolean {
  if (step === 1) return flags.canNextStep1;
  if (step === 2) return flags.canNextStep2;
  if (step === 3) return flags.canNextStep3;
  if (step === 4) return flags.canNextStep4;
  return true;
}

// Steps ────────────────────────────────────────────────────────────────────

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1 block text-[13px] font-semibold text-slate-700">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );
}

const inputCls =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none";

function Step1({
  form,
  setField,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  const phoneErr = useMemo(() => validatePhone(form.phone), [form.phone]);
  const birthErr = useMemo(() => validateBirth(form.birth), [form.birth]);
  const nameErr = useMemo(() => validateName(form.name), [form.name]);

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-slate-900">Контактные данные</h1>
      <p className="text-[14px] text-slate-600">
        Эти данные нужны менеджеру, чтобы связаться с вами и оформить аренду.
      </p>

      <div>
        <FieldLabel required>ФИО полностью</FieldLabel>
        <input
          className={inputCls}
          placeholder="Иван Иванов Иванович"
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
        />
        {form.name.length > 0 && nameErr && (
          <div className="mt-1 text-[12px] text-red-600">{nameErr}</div>
        )}
      </div>

      <div>
        <FieldLabel required>Телефон</FieldLabel>
        <input
          className={inputCls}
          placeholder="+7 (___) ___-__-__"
          inputMode="tel"
          value={form.phone}
          onChange={(e) => setField("phone", formatPhone(e.target.value))}
        />
        {form.phone.length > 0 && phoneErr && (
          <div className="mt-1 text-[12px] text-red-600">{phoneErr}</div>
        )}
      </div>

      <div>
        <FieldLabel>Дополнительный телефон</FieldLabel>
        <input
          className={inputCls}
          placeholder="+7 (___) ___-__-__"
          inputMode="tel"
          value={form.extraPhone}
          onChange={(e) => setField("extraPhone", formatPhone(e.target.value))}
        />
        <div className="mt-1 text-[12px] text-slate-500">Если есть — телефон супруги, родителей, друга.</div>
      </div>

      <div>
        <FieldLabel required>Дата рождения</FieldLabel>
        <input
          className={inputCls}
          placeholder="ДД.ММ.ГГГГ"
          inputMode="numeric"
          value={form.birth}
          onChange={(e) => setField("birth", formatDateRu(e.target.value))}
        />
        {form.birth.length >= 10 && birthErr && (
          <div className="mt-1 text-[12px] text-red-600">{birthErr}</div>
        )}
      </div>

      <div>
        <FieldLabel required>Гражданство</FieldLabel>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setField("isForeigner", false)}
            className={`flex-1 rounded-xl border px-4 py-3 text-[14px] font-semibold ${
              !form.isForeigner
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            Россия
          </button>
          <button
            type="button"
            onClick={() => setField("isForeigner", true)}
            className={`flex-1 rounded-xl border px-4 py-3 text-[14px] font-semibold ${
              form.isForeigner
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            Другая страна
          </button>
        </div>
      </div>
    </div>
  );
}

function Step2({
  form,
  setField,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  if (form.isForeigner) {
    return (
      <div className="space-y-4">
        <h1 className="text-[22px] font-bold text-slate-900">Документ</h1>
        <p className="text-[14px] text-slate-600">
          Опишите ваш документ, удостоверяющий личность: название, серия и номер, страна, дата выдачи. Менеджер потом сверит данные с фото.
        </p>
        <div>
          <FieldLabel required>Описание документа</FieldLabel>
          <textarea
            className="min-h-[140px] w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            placeholder="Например: Паспорт гражданина Узбекистана AB1234567, выдан 12.05.2018 МВД Ташкента"
            value={form.passportRaw}
            onChange={(e) => setField("passportRaw", e.target.value)}
          />
        </div>
      </div>
    );
  }

  const serErr = form.passSer.length > 0 ? validateSeries(form.passSer) : null;
  const numErr =
    form.passNum.length > 0 ? validatePassportNumber(form.passNum) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-slate-900">Паспорт РФ</h1>
      <p className="text-[14px] text-slate-600">
        Все поля — как в паспорте на главном развороте.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel required>Серия</FieldLabel>
          <input
            className={inputCls}
            placeholder="0000"
            inputMode="numeric"
            maxLength={4}
            value={form.passSer}
            onChange={(e) => setField("passSer", e.target.value.replace(/\D/g, ""))}
          />
          {serErr && <div className="mt-1 text-[12px] text-red-600">{serErr}</div>}
        </div>
        <div>
          <FieldLabel required>Номер</FieldLabel>
          <input
            className={inputCls}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            value={form.passNum}
            onChange={(e) => setField("passNum", e.target.value.replace(/\D/g, ""))}
          />
          {numErr && <div className="mt-1 text-[12px] text-red-600">{numErr}</div>}
        </div>
      </div>

      <div>
        <FieldLabel required>Дата выдачи</FieldLabel>
        <input
          className={inputCls}
          placeholder="ДД.ММ.ГГГГ"
          inputMode="numeric"
          value={form.passDate}
          onChange={(e) => setField("passDate", formatDateRu(e.target.value))}
        />
      </div>

      <div>
        <FieldLabel required>Кем выдан</FieldLabel>
        <textarea
          className="min-h-[80px] w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          placeholder="Например: ОУФМС России по г. Москве в районе…"
          value={form.passIssuer}
          onChange={(e) => setField("passIssuer", e.target.value)}
        />
      </div>

      <div>
        <FieldLabel>Код подразделения</FieldLabel>
        <input
          className={inputCls}
          placeholder="000-000"
          inputMode="numeric"
          maxLength={7}
          value={form.passCode}
          onChange={(e) => setField("passCode", formatDivisionCode(e.target.value))}
        />
      </div>

      <div>
        <FieldLabel required>Адрес регистрации (как в паспорте)</FieldLabel>
        <textarea
          className="min-h-[80px] w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          placeholder="Город, улица, дом, квартира"
          value={form.passRegistration}
          onChange={(e) => setField("passRegistration", e.target.value)}
        />
      </div>
    </div>
  );
}

function Step3({
  form,
  setField,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-slate-900">Адрес проживания</h1>
      <p className="text-[14px] text-slate-600">
        По какому адресу вы живёте сейчас. Может отличаться от прописки.
      </p>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white p-3">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5"
          checked={form.sameAddress}
          onChange={(e) => setField("sameAddress", e.target.checked)}
        />
        <span className="text-[14px] text-slate-800">
          Совпадает с {form.isForeigner ? "адресом регистрации" : "адресом по паспорту"}
        </span>
      </label>

      {!form.sameAddress && (
        <div>
          <FieldLabel required>Фактический адрес</FieldLabel>
          <textarea
            className="min-h-[100px] w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            placeholder="Город, улица, дом, квартира"
            value={form.liveAddress}
            onChange={(e) => setField("liveAddress", e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

function Step4({
  applicationId,
  uploadToken,
  isForeigner,
  uploaded,
  onUploaded,
  onRemoved,
}: {
  applicationId: number | null;
  uploadToken: string | null;
  isForeigner: boolean;
  uploaded: Set<FileKind>;
  onUploaded: (k: FileKind) => void;
  onRemoved: (k: FileKind) => void;
}) {
  if (!applicationId || !uploadToken) {
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-[13px] text-amber-800">
        Сначала заполните контактные данные на предыдущих шагах.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-slate-900">Фото документов</h1>
      <p className="text-[14px] text-slate-600">
        Чёткие фото, чтобы менеджер видел все данные. Можно фотографировать прямо с телефона.
      </p>

      <PhotoUpload
        applicationId={applicationId}
        uploadToken={uploadToken}
        kind="passport_main"
        label="Паспорт — главный разворот"
        hint="С фотографией и личными данными"
        required
        uploaded={uploaded.has("passport_main")}
        onUploaded={() => onUploaded("passport_main")}
        onRemoved={() => onRemoved("passport_main")}
      />

      {!isForeigner && (
        <PhotoUpload
          applicationId={applicationId}
          uploadToken={uploadToken}
          kind="passport_reg"
          label="Паспорт — страница с пропиской"
          required
          uploaded={uploaded.has("passport_reg")}
          onUploaded={() => onUploaded("passport_reg")}
          onRemoved={() => onRemoved("passport_reg")}
        />
      )}

      <PhotoUpload
        applicationId={applicationId}
        uploadToken={uploadToken}
        kind="license"
        label="Водительское удостоверение"
        hint="Фото лицевой стороны"
        required
        uploaded={uploaded.has("license")}
        onUploaded={() => onUploaded("license")}
        onRemoved={() => onRemoved("license")}
      />

      <PhotoUpload
        applicationId={applicationId}
        uploadToken={uploadToken}
        kind="selfie"
        label="Селфи с паспортом"
        hint="Держите паспорт рядом с лицом"
        required
        uploaded={uploaded.has("selfie")}
        onUploaded={() => onUploaded("selfie")}
        onRemoved={() => onRemoved("selfie")}
      />
    </div>
  );
}

function Step5({
  form,
  setField,
  missingFields,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  missingFields: string[];
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-slate-900">Подтверждение</h1>
      <p className="text-[14px] text-slate-600">
        Проверьте данные перед отправкой. После отправки изменить не получится — менеджер свяжется с вами для уточнений.
      </p>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-[14px]">
        <Row label="ФИО" value={form.name} />
        <Row label="Телефон" value={form.phone} />
        {form.extraPhone && <Row label="Доп. телефон" value={form.extraPhone} />}
        <Row label="Дата рождения" value={form.birth} />
        <Row label="Гражданство" value={form.isForeigner ? "Иностранец" : "Россия"} />
        {form.isForeigner ? (
          <Row label="Документ" value={form.passportRaw} />
        ) : (
          <>
            <Row label="Паспорт" value={`${form.passSer} ${form.passNum}`} />
            <Row label="Кем выдан" value={form.passIssuer} />
            <Row label="Дата выдачи" value={form.passDate} />
            {form.passCode && <Row label="Код подразделения" value={form.passCode} />}
            <Row label="Регистрация" value={form.passRegistration} />
          </>
        )}
        <Row
          label="Адрес проживания"
          value={form.sameAddress ? "Совпадает с регистрацией" : form.liveAddress}
        />
      </div>

      {missingFields.length > 0 && (
        <div className="rounded-xl bg-red-50 p-3 text-[13px] text-red-700">
          Не заполнены поля: {missingFields.join(", ")}. Вернитесь назад и проверьте.
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white p-3">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          checked={form.agreedPdn}
          onChange={(e) => setField("agreedPdn", e.target.checked)}
        />
        <span className="text-[13px] text-slate-700">
          Я согласен(а) на обработку моих персональных данных Халк Байк в целях оформления договора аренды транспортного средства.
        </span>
      </label>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-[12px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="text-right text-[14px] font-medium text-slate-900">
        {value || "—"}
      </span>
    </div>
  );
}

function SuccessScreen() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <Check size={40} className="text-emerald-600" />
        </div>
        <h1 className="mt-6 text-[24px] font-bold text-slate-900">
          Заявка отправлена!
        </h1>
        <p className="mt-3 text-[14px] text-slate-600">
          Менеджер Халк Байк свяжется с вами по указанному телефону, чтобы согласовать время приезда и оформить аренду.
        </p>
        <div className="mt-8 rounded-xl bg-white p-4 text-[13px] text-slate-700 shadow-sm">
          Эту страницу можно закрыть.
        </div>
      </div>
    </div>
  );
}
