import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  Package,
  ShieldCheck,
  X,
} from "lucide-react";
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
  formatDivisionCode,
  formatPhone,
  isCompleteDate,
  isoToDateRu,
  nullableTrim,
  validateBirth,
  validateDivisionCode,
  validateName,
  validatePassportNumber,
  validatePastDate,
  validatePhone,
  validateSeries,
} from "./formatters";
import { toTitleCaseRu } from "@/lib/textCase";
import { RENTAL_AGREEMENT_TEXT } from "@/lib/rentalAgreement";
import { ScooterCoverflow } from "./ScooterCoverflow";
import { DatePicker, InlineRangeCalendar } from "@/components/ui/date-picker";
import { periodForDays } from "@/lib/mock/rentals";
import type { RentalModel, RentalEquipment } from "./applicationApi";

/** Сегодня в ISO для maxDate ограничения. */
function todayIsoLocal(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

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
  | "wish_model"
  | "wish_equipment"
  | "wish_period"
  | "photo_passport_main"
  | "photo_passport_reg"
  | "photo_license"
  | "photo_selfie"
  | "source"
  | "agreement"
  | "confirm";

function getSteps(isForeigner: boolean): StepId[] {
  const all: StepId[] = [
    "contact",
    "passport",
    "address",
    "wish_model",
    "wish_equipment",
    "wish_period",
    "photo_passport_main",
    "photo_passport_reg",
    "photo_license",
    "photo_selfie",
    "source",
    "agreement",
    "confirm",
  ];
  return isForeigner ? all.filter((s) => s !== "photo_passport_reg") : all;
}

type ClientSourceChoice = "avito" | "repeat" | "ref" | "maps" | "other";

const SOURCE_OPTIONS: { id: ClientSourceChoice; label: string; hint?: string }[] = [
  { id: "avito", label: "Авито", hint: "Объявление на Авито" },
  { id: "maps", label: "Карты", hint: "Яндекс / 2ГИС / Google Maps" },
  { id: "ref", label: "Рекомендация", hint: "Друзья или знакомые посоветовали" },
  { id: "repeat", label: "Уже катался", hint: "Брал у нас раньше" },
  { id: "other", label: "Другое", hint: "Свой вариант" },
];

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

  // G3: предзаявка на аренду — имя выбранной модели каталога ("" если не выбрана)
  wantModel: string;
  wantDays: number;
  wantEquipmentIds: number[];
  /** G3: желаемая дата начала аренды (ISO YYYY-MM-DD; "" — не выбрана). */
  wantStartDate: string;

  // Источник: откуда о нас узнал
  source: ClientSourceChoice | "";
  sourceCustom: string;

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
  wantModel: "",
  wantDays: 7,
  wantEquipmentIds: [],
  wantStartDate: "",
  source: "",
  sourceCustom: "",
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
    source: s.source ? s.source : null,
    sourceCustom:
      s.source === "other" ? nullableTrim(s.sourceCustom) : null,
    requestedModel: modelNameToEnum(s.wantModel),
    requestedDays: s.wantModel && s.wantDays > 0 ? s.wantDays : null,
    requestedEquipmentIds: s.wantEquipmentIds.length ? s.wantEquipmentIds : null,
    requestedStartDate: s.wantStartDate || null,
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
    source: (f.source ?? "") as ClientSourceChoice | "",
    sourceCustom: f.sourceCustom ?? "",
    wantModel: enumToModelName(f.requestedModel ?? null),
    wantDays: f.requestedDays ?? 7,
    wantEquipmentIds: f.requestedEquipmentIds ?? [],
    wantStartDate: f.requestedStartDate ?? "",
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
  // R2.7: соглашение принимается на шаге подтверждения (локально, не шлём на
  // бэк) — кнопка «Принять» активна только после прокрутки текста до конца.
  const [agreedRules, setAgreedRules] = useState(false);
  const [rulesScrolledEnd, setRulesScrolledEnd] = useState(false);
  // R2.6: финальное окно-напоминание про оплату старта наличными.
  const [showCashReminder, setShowCashReminder] = useState(false);
  // Каталог для шагов «выбор аренды» (модель/экипировка/период). Грузим один
  // раз при входе в любой из wish-шагов и шарим между ними (не дёргаем API 3×).
  const [wishModels, setWishModels] = useState<RentalModel[]>([]);
  const [wishEquipment, setWishEquipment] = useState<RentalEquipment[]>([]);
  const [wishLoading, setWishLoading] = useState(false);
  const wishFetchedRef = useRef(false);

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

  // Каталог моделей/экипировки — лениво при входе в любой из wish-шагов.
  useEffect(() => {
    if (!currentStepId.startsWith("wish_") || wishFetchedRef.current) return;
    wishFetchedRef.current = true;
    setWishLoading(true);
    Promise.all([
      applicationApi.rentalModels().then((r) => setWishModels(r.items)),
      applicationApi.equipment().then((r) => setWishEquipment(r.items)),
    ])
      .catch(() => {
        /* каталог не загрузился — шаги можно пропустить */
      })
      .finally(() => setWishLoading(false));
  }, [currentStepId]);

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
      !validateDivisionCode(form.passCode) &&
      form.passRegistration.trim().length > 0;

  const canNextAddress = form.sameAddress || form.liveAddress.trim().length > 0;

  // Источник обязателен. Если выбран «другое» — обязательно текст-уточнение,
  // иначе уволочённое значение бесполезно для CRM.
  const canNextSource =
    form.source !== "" &&
    (form.source !== "other" || form.sourceCustom.trim().length > 0);

  const canSubmit =
    form.agreedPdn &&
    agreedRules &&
    canNextContact &&
    canNextPassport &&
    canNextAddress &&
    canNextSource &&
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
      case "wish_model":
      case "wish_equipment":
      case "wish_period":
        return true; // необязательные шаги — клиент может пропустить
      case "photo_passport_main":
        return uploaded.has("passport_main");
      case "photo_passport_reg":
        return uploaded.has("passport_reg");
      case "photo_license":
        return uploaded.has("license");
      case "photo_selfie":
        return uploaded.has("selfie");
      case "source":
        return canNextSource;
      case "agreement":
        return agreedRules;
      case "confirm":
        return true;
    }
  };

  // Подсказка «почему нельзя дальше» — чтобы серая кнопка «Продолжить» не
  // молчала. Возвращает короткий текст с тем, что нужно поправить на шаге.
  const stepHint = (): string | null => {
    if (canStepForward()) return null;
    switch (currentStepId) {
      case "contact": {
        const miss: string[] = [];
        if (validateName(form.name)) miss.push("ФИО (имя и фамилия)");
        if (validatePhone(form.phone)) miss.push("телефон (11 цифр)");
        if (validateBirth(form.birth)) miss.push("дата рождения");
        return miss.length ? `Проверьте: ${miss.join(", ")}.` : null;
      }
      case "passport": {
        if (form.isForeigner) {
          return "Опишите документ: тип, серия/номер, кем и когда выдан.";
        }
        const miss: string[] = [];
        if (validateSeries(form.passSer)) miss.push("серия (4 цифры)");
        if (validatePassportNumber(form.passNum)) miss.push("номер (6 цифр)");
        if (form.passIssuer.trim().length === 0) miss.push("кем выдан");
        if (!isCompleteDate(form.passDate) || validatePastDate(form.passDate))
          miss.push("дата выдачи (не позже сегодня)");
        if (validateDivisionCode(form.passCode))
          miss.push("код подразделения (000-000)");
        if (form.passRegistration.trim().length === 0)
          miss.push("адрес регистрации");
        return miss.length ? `Проверьте: ${miss.join(", ")}.` : null;
      }
      case "address":
        return "Укажите адрес проживания или отметьте, что он совпадает с регистрацией.";
      case "source":
        return form.source === ""
          ? "Выберите, откуда вы о нас узнали."
          : "Уточните вариант «Другое».";
      case "agreement":
        return rulesScrolledEnd
          ? "Нажмите «Принять правила», чтобы продолжить."
          : "Пролистайте правила до конца и примите их.";
      default:
        return null;
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
          {currentStepId === "wish_model" && (
            <WishModelStep
              form={form}
              setField={setField}
              models={wishModels}
              loading={wishLoading}
            />
          )}
          {currentStepId === "wish_equipment" && (
            <WishEquipmentStep
              form={form}
              setField={setField}
              models={wishModels}
              equipment={wishEquipment}
            />
          )}
          {currentStepId === "wish_period" && (
            <WishPeriodStep
              form={form}
              setField={setField}
              models={wishModels}
              equipment={wishEquipment}
            />
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
          {currentStepId === "source" && (
            <SourceStep form={form} setField={setField} />
          )}
          {currentStepId === "agreement" && (
            <AgreementStep
              agreedRules={agreedRules}
              rulesScrolledEnd={rulesScrolledEnd}
              onReachRulesEnd={() => setRulesScrolledEnd(true)}
              onToggleRules={(v) => setAgreedRules(v)}
            />
          )}
          {currentStepId === "confirm" && (
            <Confirm
              form={form}
              setField={setField}
              missingFields={missingFields}
              agreedRules={agreedRules}
              appId={appId}
              token={token}
              uploaded={uploaded}
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
                onClick={() => setShowCashReminder(true)}
                disabled={busy || !canSubmit}
                className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Отправляем…" : "Отправить заявку"}
                <Check size={16} />
              </button>
            )}
          </div>
          {/* Подсказка, почему кнопка «Продолжить» неактивна (не молчим). */}
          {!isPhotoStep && currentStepId !== "confirm" && !busy && stepHint() && (
            <div className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-700">
              <AlertCircle size={14} className="mt-px shrink-0" />
              <span>{stepHint()}</span>
            </div>
          )}
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

      {/* R2.6: финальное окно-напоминание про наличку перед отправкой. */}
      {showCashReminder && (
        <CashReminderModal
          busy={busy}
          onConfirm={() => {
            setShowCashReminder(false);
            void submit();
          }}
          onCancel={() => setShowCashReminder(false)}
        />
      )}
    </div>
  );
}

/**
 * R2.6: модальное окно перед отправкой заявки — напоминаем, что старт аренды
 * оплачивается наличными. Фирменный модал (не нативный confirm).
 */
function CashReminderModal({
  onConfirm,
  onCancel,
  busy,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-[28px]">
          💵
        </div>
        <h2 className="mt-4 text-[20px] font-bold text-slate-900">
          Старт аренды — наличными
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
          Внимание: старт аренды оплачивается <b>наличными</b>. Возьмите с собой
          наличные средства для оплаты при встрече с менеджером.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Отправляем…" : "Ок, возьму наличку"}
            <Check size={17} />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-[14px] font-semibold text-slate-500 disabled:opacity-50"
          >
            Вернуться
          </button>
        </div>
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
        <DatePicker
          value={
            isCompleteDate(form.birth) ? dateRuToIso(form.birth) : null
          }
          onChange={(iso) =>
            setField("birth", iso ? isoToDateRu(iso) : "")
          }
          maxDate={todayIsoLocal()}
          clearable={false}
        />
        {isCompleteDate(form.birth) && birthErr && (
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
            onChange={(e) => setField("passportRaw", toTitleCaseRu(e.target.value))}
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
            id="ap-pser"
            className={inputCls}
            placeholder="0000"
            inputMode="numeric"
            maxLength={4}
            value={form.passSer}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setField("passSer", v);
              // Авто-переход на «Номер», когда серия заполнена (4 цифры).
              if (v.length === 4) document.getElementById("ap-pnum")?.focus();
            }}
          />
          {serErr && <div className="mt-1 text-[12px] text-red-600">{serErr}</div>}
        </div>
        <div>
          <FieldLabel required>Номер</FieldLabel>
          <input
            id="ap-pnum"
            className={inputCls}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            value={form.passNum}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setField("passNum", v);
              // Авто-переход на «Кем выдан», когда номер заполнен (6 цифр).
              if (v.length === 6) document.getElementById("ap-pissuer")?.focus();
            }}
          />
          {numErr && <div className="mt-1 text-[12px] text-red-600">{numErr}</div>}
        </div>
      </div>

      <div>
        <FieldLabel required>Дата выдачи</FieldLabel>
        <DatePicker
          value={
            isCompleteDate(form.passDate) ? dateRuToIso(form.passDate) : null
          }
          onChange={(iso) =>
            setField("passDate", iso ? isoToDateRu(iso) : "")
          }
          maxDate={todayIsoLocal()}
          // После полного ввода даты — фокус на «Код подразделения».
          nextFieldId="ap-pcode"
        />
        {isCompleteDate(form.passDate) && validatePastDate(form.passDate) && (
          <div className="mt-1 text-[12px] text-red-600">
            {validatePastDate(form.passDate)}
          </div>
        )}
      </div>

      <div>
        <FieldLabel required>Кем выдан</FieldLabel>
        <textarea
          id="ap-pissuer"
          className="min-h-[80px] w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          placeholder="Например: ОУФМС России по г. Москве в районе…"
          value={form.passIssuer}
          onChange={(e) => setField("passIssuer", toTitleCaseRu(e.target.value))}
        />
      </div>

      <div>
        <FieldLabel required>Код подразделения</FieldLabel>
        <input
          id="ap-pcode"
          className={inputCls}
          placeholder="000-000"
          inputMode="numeric"
          maxLength={7}
          value={form.passCode}
          onChange={(e) => {
            const v = formatDivisionCode(e.target.value);
            setField("passCode", v);
            // Авто-переход на «Адрес регистрации», когда код заполнен (000-000).
            if (v.length === 7) document.getElementById("ap-regaddr")?.focus();
          }}
        />
        {form.passCode.length > 0 && validateDivisionCode(form.passCode) && (
          <div className="mt-1 text-[12px] text-red-600">
            {validateDivisionCode(form.passCode)}
          </div>
        )}
      </div>

      <div>
        <FieldLabel required>Адрес регистрации (как в паспорте)</FieldLabel>
        <textarea
          id="ap-regaddr"
          className="min-h-[80px] w-full rounded-xl border border-slate-300 bg-white p-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          placeholder="Город, улица, дом, квартира"
          value={form.passRegistration}
          onChange={(e) => setField("passRegistration", toTitleCaseRu(e.target.value))}
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
            onChange={(e) => setField("liveAddress", toTitleCaseRu(e.target.value))}
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

function SourceStep({
  form,
  setField,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-slate-900">
        Откуда вы о нас узнали?
      </h1>
      <p className="text-[14px] text-slate-600">
        Это нужно нам, чтобы понимать, какая реклама работает. Выбор не
        влияет на оформление аренды.
      </p>

      <div className="grid gap-2">
        {SOURCE_OPTIONS.map((opt) => {
          const active = form.source === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setField("source", opt.id);
                if (opt.id !== "other") setField("sourceCustom", "");
              }}
              className={
                active
                  ? "flex w-full items-start gap-3 rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-3 text-left text-white"
                  : "flex w-full items-start gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-left text-slate-900 hover:border-slate-500"
              }
            >
              <div className="flex-1">
                <div className="text-[16px] font-bold">{opt.label}</div>
                {opt.hint && (
                  <div
                    className={
                      active
                        ? "text-[12px] text-white/70"
                        : "text-[12px] text-slate-500"
                    }
                  >
                    {opt.hint}
                  </div>
                )}
              </div>
              {active && <Check size={20} />}
            </button>
          );
        })}
      </div>

      {form.source === "other" && (
        <div>
          <FieldLabel required>Опишите, откуда узнали</FieldLabel>
          <input
            className={inputCls}
            placeholder="Например: бывший прокат, реклама в подъезде…"
            value={form.sourceCustom}
            onChange={(e) =>
              setField("sourceCustom", e.target.value.slice(0, 200))
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * R2.7 (#83): Инструктаж при передаче скутера — отдельный полноэкранный шаг.
 * Крупный жирный заголовок, разделы выделены, текст дословный. Кнопка
 * «Принять правила» активна только после прокрутки до конца (или если текст
 * целиком помещается на экране). Без принятия дальше не пустит (canStepForward).
 */
function AgreementStep({
  agreedRules,
  rulesScrolledEnd,
  onReachRulesEnd,
  onToggleRules,
}: {
  agreedRules: boolean;
  rulesScrolledEnd: boolean;
  onReachRulesEnd: () => void;
  onToggleRules: (v: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = RENTAL_AGREEMENT_TEXT.split("\n");
  const titleLine = lines[0] ?? "Инструктаж при передаче скутера";
  const bodyLines = lines.slice(1);

  // Если текст помещается без прокрутки (большой экран) — сразу разрешаем.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) onReachRulesEnd();
  }, [onReachRulesEnd]);

  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-extrabold leading-tight text-slate-900">
        {titleLine}
      </h1>
      <p className="text-[14px] text-slate-600">
        Пожалуйста, прочитайте правила до конца — без принятия отправить заявку
        не получится.
      </p>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
            onReachRulesEnd();
          }
        }}
        className="max-h-[56vh] space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5"
      >
        {bodyLines.map((line, i) => {
          const t = line.trim();
          if (!t) return <div key={i} className="h-2" />;
          // Заголовки разделов (строка с двоеточием, не пункт-тире) — крупно/жирно.
          const isHeading = t.endsWith(":") && !t.startsWith("—");
          if (isHeading) {
            return (
              <h2
                key={i}
                className="pt-3 text-[18px] font-bold text-slate-900 first:pt-0"
              >
                {t}
              </h2>
            );
          }
          return (
            <p key={i} className="text-[14.5px] leading-relaxed text-slate-700">
              {t}
            </p>
          );
        })}
      </div>
      {agreedRules ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3.5 text-[15px] font-bold text-emerald-700">
          <Check size={18} /> Правила приняты
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onToggleRules(true)}
          disabled={!rulesScrolledEnd}
          className="h-12 w-full rounded-xl bg-slate-900 text-[15px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {rulesScrolledEnd ? "Принять правила" : "Пролистайте правила до конца"}
        </button>
      )}
    </div>
  );
}

/** #85: подписи фото-видов для миниатюр на экране подтверждения. */
const CONFIRM_PHOTO_KINDS: { kind: FileKind; label: string }[] = [
  { kind: "passport_main", label: "Паспорт" },
  { kind: "passport_reg", label: "Прописка" },
  { kind: "license", label: "Права" },
  { kind: "selfie", label: "Селфи" },
];

function Confirm({
  form,
  setField,
  missingFields,
  agreedRules,
  appId,
  token,
  uploaded,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  missingFields: string[];
  /** R2.7: принято ли соглашение (на отдельном шаге «Инструктаж»). */
  agreedRules: boolean;
  /** #85: для миниатюр загруженных фото (кликабельны → просмотр). */
  appId: number | null;
  token: string | null;
  uploaded: Set<FileKind>;
}) {
  // #85: лайтбокс — полноразмерный просмотр фото по клику на миниатюру.
  const [lightbox, setLightbox] = useState<string | null>(null);
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
        <Row
          label="Откуда узнали"
          value={
            form.source === ""
              ? ""
              : form.source === "other"
                ? form.sourceCustom
                : (SOURCE_OPTIONS.find((o) => o.id === form.source)?.label ?? "")
          }
        />
      </div>

      {/* #85: миниатюры загруженных фото — клик открывает полный размер,
          чтобы клиент мог проверить качество перед отправкой. */}
      {appId && token && uploaded.size > 0 && (
        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-slate-700">
            Загруженные фото — нажмите, чтобы проверить
          </div>
          <div className="flex flex-wrap gap-3">
            {CONFIRM_PHOTO_KINDS.filter((p) => uploaded.has(p.kind)).map((p) => (
              <button
                key={p.kind}
                type="button"
                onClick={() =>
                  setLightbox(applicationApi.fileUrl(appId, token, p.kind, "view"))
                }
                className="group flex flex-col items-center gap-1"
              >
                <img
                  src={applicationApi.fileUrl(appId, token, p.kind, "thumb")}
                  alt={p.label}
                  className="h-20 w-20 rounded-xl border-2 border-slate-200 object-cover transition-colors group-hover:border-slate-900"
                />
                <span className="text-[11px] text-slate-500">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Просмотр фото"
            className="max-h-[90vh] max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur"
            aria-label="Закрыть"
          >
            <X size={22} />
          </button>
        </div>
      )}

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

      {/* R2.7: соглашение принимается на отдельном шаге «Инструктаж» (до
          подтверждения). Здесь — только статус, read-only. */}
      <div
        className={`flex items-start gap-3 rounded-xl border p-3 ${
          agreedRules
            ? "border-emerald-200 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        {agreedRules ? (
          <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />
        ) : (
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        )}
        <span
          className={`text-[13px] ${agreedRules ? "text-emerald-800" : "text-amber-800"}`}
        >
          {agreedRules
            ? "Инструктаж при передаче скутера — принят."
            : "Вернитесь на шаг «Инструктаж» и примите правила — без этого заявку не отправить."}
        </span>
      </div>
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

// ─────────────── G3: предзаявка на аренду (модель + срок) ───────────────

const WISH_DAY_PRESETS = [1, 3, 7, 14, 30];
const MODEL_ENUMS = ["jog", "gear", "honda", "tank"] as const;

/** Имя модели каталога → enum scooter_model (для requestedModel). Кастомные
 *  модели вне enum → null (тогда при конвертации фильтр аренды не ставится). */
function modelNameToEnum(name: string): string | null {
  const k = name.trim().toLowerCase();
  return (MODEL_ENUMS as readonly string[]).includes(k) ? k : null;
}
/** enum → отображаемое имя (для восстановления выбора из черновика). */
function enumToModelName(e: string | null): string {
  if (!e) return "";
  return e.charAt(0).toUpperCase() + e.slice(1);
}

/** Ставка ₽/сут модели по числу дней (тот же принцип, что в аренде). */
function rateForDays(m: RentalModel, days: number): number {
  const p = periodForDays(days);
  if (p === "day") return m.dayRate;
  if (p === "short") return m.shortRate;
  if (p === "week") return m.weekRate;
  return m.monthRate;
}

/** Прибавить дни к ISO-дате (YYYY-MM-DD). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
/** ISO → ДД.ММ для компактного показа периода. */
function isoToDDMM(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}` : iso;
}
/** Кол-во дней между двумя ISO-датами (to − from). */
function daysBetweenIso(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = new Date(fy!, fm! - 1, fd!).getTime();
  const b = new Date(ty!, tm! - 1, td!).getTime();
  return Math.round((b - a) / 86_400_000);
}
/** Множественное «день/дня/дней». */
function daysWord(n: number): string {
  return n === 1 ? "день" : n < 5 ? "дня" : "дней";
}

/** Мини-карточка выбранного скутера — закреплена сверху на шагах экипировки
 *  и периода, чтобы клиент видел, что уже выбрал. */
function PinnedScooter({
  model,
  subtitle,
}: {
  model: RentalModel;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-900 bg-white p-3 shadow-sm">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
        {model.avatarUrl ? (
          <img
            src={applicationApi.modelAvatarUrl(model.avatarUrl + "?variant=thumb")}
            alt={model.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <Bike size={26} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Выбранный скутер
        </div>
        <div className="text-[16px] font-bold leading-tight text-slate-900">
          {model.name}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-[12px] text-slate-500">{subtitle}</div>
        )}
      </div>
      <Check size={18} className="ml-auto shrink-0 text-slate-900" />
    </div>
  );
}

/** Подсказка, когда модель не выбрана (шаги экипировки/периода опциональны). */
function WishNoModelNote({ what }: { what: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
        <Bike size={32} strokeWidth={1.5} className="mx-auto text-slate-300" />
        <p className="mt-3 text-[14px] text-slate-500">
          Вы не выбрали модель. Вернитесь назад, чтобы указать {what}, — или
          пропустите: менеджер подберёт при звонке.
        </p>
      </div>
    </div>
  );
}

/** Шаг выбора аренды №1 — модель: coverflow-карусель + тарифы центральной. */
function WishModelStep({
  form,
  setField,
  models,
  loading,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  models: RentalModel[];
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold text-slate-900">Какой скутер?</h1>
      <p className="text-[14px] text-slate-600">
        Необязательно — можно пропустить, менеджер подберёт при звонке.
      </p>

      {loading ? (
        <div className="flex justify-center gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[300px] w-[210px] shrink-0 animate-pulse rounded-[26px] bg-slate-100"
            />
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">
          Модели уточним при звонке.
        </div>
      ) : (
        <ScooterCoverflow
          models={models}
          value={form.wantModel}
          onSelect={(name) => setField("wantModel", name)}
        />
      )}
    </div>
  );
}

/** Шаг выбора аренды №2 — экипировка. Сверху закреплён выбранный скутер. */
function WishEquipmentStep({
  form,
  setField,
  models,
  equipment,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  models: RentalModel[];
  equipment: RentalEquipment[];
}) {
  const selected = models.find((m) => m.name === form.wantModel) ?? null;
  const toggleEquip = (id: number) => {
    const has = form.wantEquipmentIds.includes(id);
    setField(
      "wantEquipmentIds",
      has
        ? form.wantEquipmentIds.filter((x) => x !== id)
        : [...form.wantEquipmentIds, id],
    );
  };
  if (!selected) return <WishNoModelNote what="экипировку" />;

  return (
    <div className="space-y-4">
      <PinnedScooter model={selected} />
      <h1 className="text-[22px] font-bold text-slate-900">
        Выберите экипировку
      </h1>
      <p className="text-[14px] text-slate-600">
        По желанию — шлем, цепь и прочее. Можно пропустить.
      </p>

      {equipment.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">
          Экипировку подберём при выдаче.
        </div>
      )}
      {equipment.length > 0 && (
        <div>
          <FieldLabel>Доступная экипировка</FieldLabel>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {equipment.map((e) => {
              const active = form.wantEquipmentIds.includes(e.id);
              const free = e.isFree || e.price === 0;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggleEquip(e.id)}
                  className={`relative w-[128px] shrink-0 overflow-hidden rounded-2xl border-2 text-left transition-all ${
                    active
                      ? "border-slate-900 shadow-md"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <div className="relative aspect-square w-full bg-white">
                    {e.avatarUrl ? (
                      <img
                        src={applicationApi.modelAvatarUrl(
                          e.avatarUrl + "?variant=thumb",
                        )}
                        alt={e.name}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                        <Package size={30} strokeWidth={1.5} />
                      </div>
                    )}
                    {active && (
                      <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
                        <Check size={14} />
                      </div>
                    )}
                  </div>
                  <div className="px-2.5 py-2">
                    <div className="truncate text-[14px] font-semibold leading-tight text-slate-900">
                      {e.name}
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-500">
                      {free ? "бесплатно" : `+${e.price.toLocaleString("ru-RU")} ₽/сут`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Шаг выбора аренды №3 — когда и на сколько + итоговая цена. */
function WishPeriodStep({
  form,
  setField,
  models,
  equipment,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  models: RentalModel[];
  equipment: RentalEquipment[];
}) {
  const days = form.wantDays > 0 ? form.wantDays : 7;
  const selected = models.find((m) => m.name === form.wantModel) ?? null;
  const equipDaily = equipment
    .filter((e) => form.wantEquipmentIds.includes(e.id) && !e.isFree)
    .reduce((s, e) => s + e.price, 0);
  const calc = useMemo(() => {
    if (!selected) return null;
    const rate = rateForDays(selected, days);
    return {
      rate, // ставка аренды ₽/сут (без экипировки)
      rentSum: rate * days, // аренда за весь срок
      equipSum: equipDaily * days, // экипировка за весь срок
      deposit: 2000, // залог (вернётся)
      bring: rate * days + equipDaily * days + 2000, // взять с собой
    };
  }, [selected, days, equipDaily]);
  // Старт по умолчанию — сегодня (чтобы календарь и сводка всегда были
  // наполнены); реальный wantStartDate проставится при выборе на календаре.
  const startIso = form.wantStartDate || todayIsoLocal();
  const endIso = addDaysIso(startIso, days);
  if (!selected) return <WishNoModelNote what="период" />;

  return (
    <div className="space-y-4">
      <PinnedScooter
        model={selected}
        subtitle={
          equipDaily > 0
            ? `+ экипировка ${equipDaily.toLocaleString("ru-RU")} ₽/сут`
            : "без платной экипировки"
        }
      />
      <h1 className="text-[22px] font-bold text-slate-900">
        Когда и на сколько?
      </h1>

          <div>
            <FieldLabel>Выберите период на календаре</FieldLabel>
            {/* Сводка периода сверху — «с … по …». */}
            <div className="mb-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[15px] font-semibold text-white">
              {startIso ? (
                <>
                  с {isoToDDMM(startIso)} по {isoToDDMM(endIso)} ·{" "}
                  <span className="text-white/80">
                    {days} {daysWord(days)}
                  </span>
                </>
              ) : (
                "Тапните дату начала, затем дату конца"
              )}
            </div>
            <InlineRangeCalendar
              from={startIso}
              to={endIso}
              minDate={todayIsoLocal()}
              onChange={({ from, to }) => {
                setField("wantStartDate", from);
                setField("wantDays", Math.max(1, daysBetweenIso(from, to)));
              }}
            />
            <div className="mt-1 text-[12px] text-slate-500">
              Тапните дату начала, затем дату конца — или поправьте срок
              кнопками ниже. Бронь плюс-минус, придержим.
            </div>
          </div>

          <div>
            <FieldLabel>На сколько дней</FieldLabel>
            <div className="mb-1.5 text-[12px] text-slate-500">
              Быстрый выбор — или укажите любой срок ниже
            </div>
            <div className="flex flex-wrap gap-2">
              {WISH_DAY_PRESETS.map((n) => {
                const active = days === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setField("wantDays", n)}
                    className={`h-11 min-w-[56px] rounded-xl border-2 px-3 text-[15px] font-semibold transition-colors ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
                    }`}
                  >
                    {n} {n === 1 ? "день" : n < 5 ? "дня" : "дней"}
                  </button>
                );
              })}
            </div>
            {/* Любой срок — степпер. Заготовки выше лишь помощь; клиент может
                выбрать ровно столько дней, сколько нужно (напр. 8). */}
            <div className="mt-3 flex items-center gap-3">
              <div className="inline-flex items-center overflow-hidden rounded-xl border-2 border-slate-200">
                <button
                  type="button"
                  aria-label="На день меньше"
                  onClick={() => setField("wantDays", Math.max(1, days - 1))}
                  className="flex h-12 w-12 items-center justify-center text-[24px] font-semibold leading-none text-slate-500 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  value={days}
                  onChange={(e) =>
                    setField(
                      "wantDays",
                      Math.max(1, Math.min(90, Number(e.target.value) || 1)),
                    )
                  }
                  className="h-12 w-16 border-x-2 border-slate-200 text-center text-[17px] font-bold text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label="На день больше"
                  onClick={() => setField("wantDays", Math.min(90, days + 1))}
                  className="flex h-12 w-12 items-center justify-center text-[24px] font-semibold leading-none text-slate-500 transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  +
                </button>
              </div>
              <span className="text-[14px] text-slate-600">
                {days === 1 ? "день" : days < 5 ? "дня" : "дней"} — любой срок
              </span>
            </div>
          </div>

          {calc && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {/* Разбивка: аренда + экипировка + залог = взять с собой. */}
              <div className="space-y-1.5 text-[14px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-slate-600">
                    Аренда {selected.name} · {days} {daysWord(days)}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {calc.rentSum.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-slate-600">Экипировка</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    + {calc.equipSum.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-slate-600">
                    Залог{" "}
                    <span className="text-slate-400">(вернётся при сдаче)</span>
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {calc.deposit.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-3">
                <span className="text-[15px] font-bold text-slate-900">
                  Итого взять с собой
                </span>
                <span className="text-[22px] font-extrabold tabular-nums text-slate-900">
                  {calc.bring.toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <div className="mt-2 text-[12px] text-slate-400">
                Период с {isoToDDMM(startIso)} по {isoToDDMM(endIso)}. Точную
                цену и наличие подтвердит менеджер.
              </div>
            </div>
          )}
    </div>
  );
}
