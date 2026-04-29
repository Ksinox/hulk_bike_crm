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
  LicenseSample,
  PassportMainSample,
  PassportRegSample,
  SelfieSample,
} from "./PhotoSamples";
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
  validatePastDate,
  validatePhone,
  validateSeries,
} from "./formatters";

/**
 * Публичная форма анкеты клиента (как Google Forms, постоянная ссылка #/apply).
 *
 * Шаги (для гражданина РФ):
 *   1. contact          — ФИО, телефон, ДР, гражданство
 *   2. passport         — серия/номер/выдан/код/регистрация
 *   3. address          — адрес проживания
 *   4. photo:passport_main
 *   5. photo:passport_reg
 *   6. photo:license
 *   7. photo:selfie
 *   8. confirm          — подтверждение и согласие на ПДн
 *
 * Для иностранца шаг 5 (прописка) пропускается.
 *
 * Каждый фото-шаг занимает отдельный экран с образцом сверху, кнопками
 * «Сфотографировать» / «Из галереи» и auto-advance к следующему шагу
 * после успешной загрузки. Менеджер ведёт клиента «за руку».
 */

type StepId =
  | "contact"
  | "passport"
  | "address"
  | "photo_passport_main"
  | "photo_passport_reg"
  | "photo_license"
  | "photo_selfie"
  | "confirm";

function getSteps(isForeigner: boolean): StepId[] {
  const all: StepId[] = [
    "contact",
    "passport",
    "address",
    "photo_passport_main",
    "photo_passport_reg",
    "photo_license",
    "photo_selfie",
    "confirm",
  ];
  return isForeigner ? all.filter((s) => s !== "photo_passport_reg") : all;
}

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
  passDate: string;
  passIssuer: string;
  passCode: string;
  passRegistration: string;

  // Адрес
  sameAddress: boolean;
  liveAddress: string;

  // Согласие
  agreedPdn: boolean;

  // Honeypot
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
  // По требованию пользователя: «галочка совпадает с адресом регистрации
  // по умолчанию отжата» — клиент сам решит, ставить или нет.
  sameAddress: false,
  liveAddress: "",
  agreedPdn: false,
  honeypot: "",
};

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
    sameAddress: f.sameAddress ?? false,
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

  const steps = useMemo(() => getSteps(form.isForeigner), [form.isForeigner]);
  const totalSteps = steps.length;
  const currentStepId: StepId = steps[Math.min(step - 1, totalSteps - 1)];

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Восстановление черновика
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setForm((prev) => ({ ...prev, ...stateFromFields(draft.fields) }));
      setAppId(draft.applicationId);
      setToken(draft.uploadToken);
      setTokenExpiresAt(draft.expiresAt);
      setUploaded(new Set(draft.uploadedKinds));
      // step может оказаться вне диапазона если isForeigner поменялся —
      // clamp по факту перед рендером.
      setStep(Math.max(1, draft.step ?? 1));
    }
  }, []);

  // Авто-сохранение черновика
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

  const ensureDraft = async (): Promise<{ id: number; tok: string }> => {
    const fields = fieldsFromState(form);
    if (appId && token) {
      try {
        await applicationApi.patch(appId, token, fields);
        return { id: appId, tok: token };
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
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

  // Валидация по шагам (для not-photo)
  const canNextContact =
    !validateName(form.name) &&
    !validatePhone(form.phone) &&
    !validateBirth(form.birth);

  const canNextPassport = form.isForeigner
    ? form.passportRaw.trim().length > 0
    : !validateSeries(form.passSer) &&
      !validatePassportNumber(form.passNum) &&
      form.passIssuer.trim().length > 0 &&
      !validatePastDate(form.passDate) &&
      form.passRegistration.trim().length > 0;

  const canNextAddress = form.sameAddress || form.liveAddress.trim().length > 0;

  const canSubmit =
    form.agreedPdn &&
    canNextContact &&
    canNextPassport &&
    canNextAddress &&
    uploaded.has("passport_main") &&
    uploaded.has("license") &&
    uploaded.has("selfie") &&
    (form.isForeigner || uploaded.has("passport_reg"));

  const canStepForward = (): boolean => {
    switch (currentStepId) {
      case "contact":
        return canNextContact;
      case "passport":
        return canNextPassport;
      case "address":
        return canNextAddress;
      case "photo_passport_main":
        return uploaded.has("passport_main");
      case "photo_passport_reg":
        return uploaded.has("passport_reg");
      case "photo_license":
        return uploaded.has("license");
      case "photo_selfie":
        return uploaded.has("selfie");
      case "confirm":
        return true;
    }
  };

  const goNext = async () => {
    setError(null);
    setBusy(true);
    try {
      // Не PATCHим если на фото-шаге (там файлы уже на сервере, поля не менялись)
      if (!currentStepId.startsWith("photo_")) {
        await ensureDraft();
      }
      setStep((s) => Math.min(s + 1, totalSteps));
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

  // Auto-advance после успешной загрузки фото на фото-шаге
  const advanceFromPhoto = () => {
    setStep((s) => Math.min(s + 1, totalSteps));
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
          setError(
            "Сессия истекла. Перезагрузите страницу и заполните заявку заново.",
          );
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

  const isPhotoStep = currentStepId.startsWith("photo_");
  const photoKind = isPhotoStep
    ? (currentStepId.replace("photo_", "") as FileKind)
    : null;

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
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
          <div className="mt-1 text-[12px] text-slate-500">
            Шаг {step} из {totalSteps}
          </div>
        </header>

        <main className="flex-1">
          {currentStepId === "contact" && (
            <Step1 form={form} setField={setField} />
          )}
          {currentStepId === "passport" && (
            <Step2 form={form} setField={setField} />
          )}
          {currentStepId === "address" && (
            <Step3 form={form} setField={setField} />
          )}
          {isPhotoStep && photoKind && (
            <PhotoStep
              kind={photoKind}
              applicationId={appId}
              uploadToken={token}
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
              onAdvance={advanceFromPhoto}
            />
          )}
          {currentStepId === "confirm" && (
            <Confirm
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
                aria-label="Назад"
              >
                <ArrowLeft size={16} /> Назад
              </button>
            )}
            {/* На фото-шаге Продолжить НЕ показываем — auto-advance после загрузки */}
            {!isPhotoStep && currentStepId !== "confirm" && (
              <button
                type="button"
                onClick={goNext}
                disabled={busy || !canStepForward()}
                className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Сохраняем…" : "Продолжить"}
                <ArrowRight size={16} />
              </button>
            )}
            {currentStepId === "confirm" && (
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
          {/* Honeypot — невидимое поле для ботов */}
          <input
            type="text"
            name="company_website"
            value={form.honeypot}
            onChange={(e) => setField("honeypot", e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{
              position: "absolute",
              left: -9999,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        </footer>
      </div>
    </div>
  );
}

// ─────────────────────────── Steps ───────────────────────────

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
        <div className="mt-1 text-[12px] text-slate-500">
          Если есть — телефон супруги, родителей, друга.
        </div>
      </div>

      <div>
        <FieldLabel required>Дата рождения</FieldLabel>
        <input
          className={inputCls}
          placeholder="ДД.ММ.ГГГГ"
          inputMode="numeric"
          value={form.birth}
          maxLength={10}
          onChange={(e) => setField("birth", formatDateRu(e.target.value))}
        />
        {form.birth.length > 0 && form.birth.length < 10 && (
          <div className="mt-1 text-[12px] text-amber-600">
            Введите год полностью — 4 цифры (например, 1990)
          </div>
        )}
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
          Опишите ваш документ, удостоверяющий личность: название, серия и
          номер, страна, дата выдачи. Менеджер потом сверит данные с фото.
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
          maxLength={10}
          onChange={(e) => setField("passDate", formatDateRu(e.target.value))}
        />
        {form.passDate.length > 0 && form.passDate.length < 10 && (
          <div className="mt-1 text-[12px] text-amber-600">
            Введите год полностью — 4 цифры (например, 2024)
          </div>
        )}
        {form.passDate.length >= 10 && validatePastDate(form.passDate) && (
          <div className="mt-1 text-[12px] text-red-600">
            {validatePastDate(form.passDate)}
          </div>
        )}
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

      {/* Поле адреса показывается всегда, кроме случая когда чекбокс активен */}
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

      {/* Чекбокс — НИЖЕ поля, по умолчанию отжат (см. EMPTY) */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white p-3">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          checked={form.sameAddress}
          onChange={(e) => setField("sameAddress", e.target.checked)}
        />
        <span className="text-[14px] text-slate-800">
          Совпадает с{" "}
          {form.isForeigner ? "адресом регистрации" : "адресом по паспорту"}
        </span>
      </label>
    </div>
  );
}

const PHOTO_STEP_META: Record<
  FileKind,
  { title: string; hint: string; sample: React.ReactNode; facing: "user" | "environment" }
> = {
  passport_main: {
    title: "Паспорт — главный разворот",
    hint: "Страница с фотографией и личными данными. Весь разворот должен быть в кадре, без бликов.",
    sample: <PassportMainSample />,
    facing: "environment",
  },
  passport_reg: {
    title: "Паспорт — страница с пропиской",
    hint: "Сфотографируйте страницу со штампом регистрации. Адрес должен быть читаем целиком.",
    sample: <PassportRegSample />,
    facing: "environment",
  },
  license: {
    title: "Водительское удостоверение",
    hint: "Лицевая сторона ВУ — категории, фото и срок действия должны быть видны.",
    sample: <LicenseSample />,
    facing: "environment",
  },
  selfie: {
    title: "Селфи",
    hint: "Расположите лицо в овальной рамке (как в Uber/Я.Такси). Глаза открыты, очки лучше снять, волосы не закрывают лицо.",
    sample: <SelfieSample />,
    facing: "user",
  },
};

function PhotoStep({
  kind,
  applicationId,
  uploadToken,
  uploaded,
  onUploaded,
  onRemoved,
  onAdvance,
}: {
  kind: FileKind;
  applicationId: number | null;
  uploadToken: string | null;
  uploaded: Set<FileKind>;
  onUploaded: (k: FileKind) => void;
  onRemoved: (k: FileKind) => void;
  onAdvance: () => void;
}) {
  if (!applicationId || !uploadToken) {
    return (
      <div className="rounded-xl bg-amber-50 p-4 text-[13px] text-amber-800">
        Сначала заполните контактные данные на предыдущих шагах.
      </div>
    );
  }
  const meta = PHOTO_STEP_META[kind];
  return (
    <PhotoUpload
      applicationId={applicationId}
      uploadToken={uploadToken}
      kind={kind}
      title={meta.title}
      hint={meta.hint}
      sample={meta.sample}
      cameraFacing={meta.facing}
      uploaded={uploaded.has(kind)}
      onUploaded={() => onUploaded(kind)}
      onRemoved={() => onRemoved(kind)}
      onAdvance={onAdvance}
    />
  );
}

function Confirm({
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
        Проверьте данные перед отправкой. После отправки изменить не получится —
        менеджер свяжется с вами для уточнений.
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
          Не заполнены поля: {missingFields.join(", ")}. Вернитесь назад и
          проверьте.
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
          Я согласен(а) на обработку моих персональных данных Халк Байк в целях
          оформления договора аренды транспортного средства.
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
          Менеджер Халк Байк свяжется с вами по указанному телефону, чтобы
          согласовать время приезда и оформить аренду.
        </p>
        <div className="mt-8 rounded-xl bg-white p-4 text-[13px] text-slate-700 shadow-sm">
          Эту страницу можно закрыть.
        </div>
      </div>
    </div>
  );
}
