import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bike,
  Check,
  ChevronDown,
  ShieldCheck,
  Sparkles,
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
import { EquipmentCoverflow } from "./EquipmentCoverflow";
import { WishSummaryBar } from "./WishSummaryBar";
import { DatePicker, InlineRangeCalendar } from "@/components/ui/date-picker";
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
  // Ref на скролл-бокс правил (инструктаж) — чтобы единая нижняя кнопка
  // «Пролистайте правила до конца» могла доскроллить до конца по тапу.
  const agreementScrollRef = useRef<HTMLDivElement>(null);
  // R2.6: финальное окно-напоминание про оплату старта наличными.
  const [showCashReminder, setShowCashReminder] = useState(false);
  // Совет «возьмите подольше»: клиент может отклонить («Спасибо, не надо»).
  // Сбрасывается при смене срока (useEffect ниже) — на новый срок совет
  // показываем заново.
  const [upsellDismissed, setUpsellDismissed] = useState(false);
  // v0.9.5: сниппет «Ваш выбор» — управляемое раскрытие + флаг «трогал ли его
  // клиент сам». Логика: если клиент сам открывал сниппет — по «Продолжить»
  // НЕ раскрываем повторно (просто листаем). Если не открывал и есть выгодное
  // предложение — первый клик «Продолжить» РАСКРЫВАЕТ сниппет (чтобы клиент
  // точно увидел «можно выгоднее»), второй клик уже листает дальше.
  const [wishBarOpen, setWishBarOpen] = useState(false);
  const [wishBarTouched, setWishBarTouched] = useState(false);
  // Каталог для шагов «выбор аренды» (модель/экипировка/период). Грузим один
  // раз при входе в любой из wish-шагов и шарим между ними (не дёргаем API 3×).
  const [wishModels, setWishModels] = useState<RentalModel[]>([]);
  const [wishEquipment, setWishEquipment] = useState<RentalEquipment[]>([]);
  const [wishLoading, setWishLoading] = useState(false);
  const wishFetchedRef = useRef(false);
  // Направление перехода между шагами — для плавной анимации появления
  // (вперёд → въезд справа, назад → слева).
  const [navDir, setNavDir] = useState<"fwd" | "back">("fwd");

  // Новый срок → совет «возьмите подольше» показываем заново (сбрасываем
  // отказ). Если клиент сам выбрал рекомендованный срок — пересчитанный совет
  // (следующая ступень) тоже снова появится.
  useEffect(() => {
    setUpsellDismissed(false);
  }, [form.wantDays]);
  // v0.9.5: на каждый вход в новый шаг — сниппет свёрнут и «не трогали».
  useEffect(() => {
    setWishBarOpen(false);
    setWishBarTouched(false);
  }, [step]);

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
    setNavDir("fwd");
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
    setNavDir("back");
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  // Auto-advance после успешной загрузки фото на фото-шаге
  const advanceFromPhoto = () => {
    setNavDir("fwd");
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

  // Данные для выдвижного сниппета «Ваш выбор» (докнут над «Продолжить» на
  // шагах экипировки/периода). Цену считаем только на шаге периода.
  const isWishStep =
    currentStepId === "wish_equipment" || currentStepId === "wish_period";
  const wishModel = wishModels.find((m) => m.name === form.wantModel) ?? null;
  const wishSelEquip = wishEquipment.filter((e) =>
    form.wantEquipmentIds.includes(e.id),
  );
  const wishDays = form.wantDays > 0 ? form.wantDays : 7;
  const wishStart = form.wantStartDate || todayIsoLocal();
  const wishPrice =
    currentStepId === "wish_period" && wishModel
      ? (() => {
          const rate = rateForDays(wishModel, wishDays);
          const equipDaily = wishSelEquip
            .filter((e) => !e.isFree)
            .reduce((s, e) => s + e.price, 0);
          const rentSum = rate * wishDays;
          const equipSum = equipDaily * wishDays;
          const deposit = 2000;
          return { rentSum, equipSum, deposit, bring: rentSum + equipSum + deposit };
        })()
      : null;
  const wishPeriodLabel =
    currentStepId === "wish_period"
      ? `с ${isoToDDMM(wishStart)} по ${isoToDDMM(addDaysIso(wishStart, wishDays))} · ${wishDays} ${daysWord(wishDays)}`
      : null;
  // Есть ли выгодное предложение «возьмите подольше» — для приманки в сниппете.
  // Учитываем отказ клиента (upsellDismissed): после «Спасибо, не надо» ни
  // приманку в свёрнутой шапке, ни карточку внутри не показываем.
  const wishHasUpsell =
    currentStepId === "wish_period" &&
    wishModel != null &&
    !upsellDismissed &&
    computeWishUpsell(wishModel, wishDays) != null;

  // v0.9.5: «Продолжить». На шаге периода, если есть выгодное предложение и
  // клиент ещё НЕ открывал сниппет сам — первый клик раскрывает сниппет
  // (чтобы клиент точно увидел «можно выгоднее»), не листая дальше. Если уже
  // трогал сниппет (или выгоды нет) — обычный переход на следующий шаг.
  const handleContinue = () => {
    if (currentStepId === "wish_period" && wishHasUpsell && !wishBarTouched) {
      setWishBarOpen(true);
      setWishBarTouched(true);
      return;
    }
    void goNext();
  };

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
          {/* Плавный переход между шагами: key={step} ремонтит контейнер,
              анимация проигрывается при каждой смене шага (вперёд/назад). */}
          <style>{`@keyframes apStepFwd{from{opacity:0;transform:translateX(26px)}to{opacity:1;transform:none}}@keyframes apStepBack{from{opacity:0;transform:translateX(-26px)}to{opacity:1;transform:none}}`}</style>
          <div
            key={step}
            style={{
              animation: `${navDir === "fwd" ? "apStepFwd" : "apStepBack"} .3s cubic-bezier(.22,1,.36,1)`,
            }}
          >
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
              scrollRef={agreementScrollRef}
              rulesScrolledEnd={rulesScrolledEnd}
              onReachRulesEnd={() => setRulesScrolledEnd(true)}
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
          </div>

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">
              {error}
            </div>
          )}
        </main>

        <footer className="sticky bottom-0 -mx-4 mt-6 border-t border-slate-200 bg-slate-50 px-4 pb-4 pt-3">
          {/* Выдвижной сниппет «Ваш выбор» — над кнопками, на шагах аренды.
              Совет «возьмите подольше» прокинут ВНУТРЬ сниппета: клиент тапнул
              дату → открывает «Ваш выбор» → видит выгоду (в свёрнутом виде —
              приманка «можно выгоднее»). */}
          {isWishStep && wishModel && (
            <WishSummaryBar
              model={wishModel}
              selectedEquipment={wishSelEquip}
              price={wishPrice}
              periodLabel={wishPeriodLabel}
              hasUpsell={wishHasUpsell}
              open={wishBarOpen}
              onOpenChange={(o) => {
                setWishBarOpen(o);
                // Клиент сам открыл сниппет — отмечаем, чтобы по «Продолжить»
                // не раскрывать его повторно (просто листать дальше).
                if (o) setWishBarTouched(true);
              }}
              upsell={
                currentStepId === "wish_period" && !upsellDismissed ? (
                  <WishUpsell
                    model={wishModel}
                    days={wishDays}
                    onApply={(d) => setField("wantDays", d)}
                    onDismiss={() => setUpsellDismissed(true)}
                  />
                ) : null
              }
            />
          )}
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
            {!isPhotoStep &&
              currentStepId !== "confirm" &&
              currentStepId !== "agreement" && (
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={busy || !canStepForward()}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Сохраняем…" : "Продолжить"}
                  <ArrowRight size={16} />
                </button>
              )}
            {/* Инструктаж: ЕДИНАЯ нижняя кнопка вместо двух (внутренней
                «Принять» + футерной «Продолжить»). Пока не долистали —
                кнопка доскроллит правила; долистали — превращается в
                «Принять и продолжить» (принимает + переходит дальше). */}
            {currentStepId === "agreement" &&
              (rulesScrolledEnd ? (
                <button
                  type="button"
                  onClick={() => {
                    setAgreedRules(true);
                    void goNext();
                  }}
                  disabled={busy}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Сохраняем…" : "Принять правила и продолжить"}
                  <Check size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    agreementScrollRef.current?.scrollTo({
                      top: agreementScrollRef.current.scrollHeight,
                      behavior: "smooth",
                    })
                  }
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 text-[14px] font-semibold text-white"
                >
                  Пролистайте правила до конца
                  <ChevronDown size={16} className="animate-bounce" />
                </button>
              ))}
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
          {/* Подсказка, почему кнопка «Продолжить» неактивна (не молчим).
              На шаге «agreement» не показываем — там единая кнопка сама ведёт. */}
          {!isPhotoStep &&
            currentStepId !== "confirm" &&
            currentStepId !== "agreement" &&
            !busy &&
            stepHint() && (
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
  scrollRef,
  rulesScrolledEnd,
  onReachRulesEnd,
}: {
  scrollRef: React.RefObject<HTMLDivElement>;
  rulesScrolledEnd: boolean;
  onReachRulesEnd: () => void;
}) {
  const lines = RENTAL_AGREEMENT_TEXT.split("\n");
  const titleLine = lines[0] ?? "Инструктаж при передаче скутера";
  const bodyLines = lines.slice(1);

  // Если текст помещается без прокрутки (большой экран) — сразу разрешаем.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) onReachRulesEnd();
  }, [scrollRef, onReachRulesEnd]);

  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-extrabold leading-tight text-slate-900">
        {titleLine}
      </h1>
      <p className="text-[14px] text-slate-600">
        Пролистайте правила до конца — кнопка «Принять» внизу разблокируется
        автоматически.
      </p>
      {/* Скролл-бокс правил с нижним fade-градиентом: визуально видно, что
          текст продолжается ниже (клиенты не замечали, что надо листать). */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
              onReachRulesEnd();
            }
          }}
          className="max-h-[52vh] space-y-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5"
        >
          {bodyLines.map((line, i) => {
            const t = line.trim();
            if (!t) return <div key={i} className="h-2" />;
            // Заголовки разделов (строка с двоеточием, не пункт-тире).
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
        {/* Fade + бейдж «листайте» — пока не долистали до конца. */}
        {!rulesScrolledEnd && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center rounded-b-2xl bg-gradient-to-t from-white via-white/90 to-transparent pt-10 pb-3">
            <span className="flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3 py-1 text-[12px] font-semibold text-white animate-bounce">
              <ChevronDown size={14} /> листайте до конца
            </span>
          </div>
        )}
      </div>
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
  // Ставка ₽/сут берётся из каталога «Модели» как прописано:
  //   1–2 дня → dayRate (короткий прокат дороже),
  //   3–6 → shortRate, 7–29 → weekRate, 30+ → monthRate.
  // periodForDays здесь НЕ используем — она для backend-поля tariffPeriod
  // (enum БД не знает 'day' и для 1-2 отдаёт short). Цена же — по dayRate.
  if (days <= 2) return m.dayRate;
  if (days <= 6) return m.shortRate;
  if (days <= 29) return m.weekRate;
  return m.monthRate;
}

/**
 * Рекомендация-апселл: «возьмите подольше — дешевле тариф». Каскад по тарифным
 * ступеням каталога (как в rateForDays): 1-2 → 3 → 7 → 30. Цену считаем через
 * rateForDays, поэтому апселл и сниппет всегда совпадают.
 *
 * Экономия (решение заказчика, 2026-06): берём ЦЕЛЕВОЙ срок и сравниваем его
 * стоимость по новому тарифу против того же срока по старому тарифу:
 *   savings = targetDays × (curRate − nextRate).
 * Смысл: «возьмёте {targetDays} дней — все они посчитаются по {nextRate} ₽/сут
 * вместо {curRate}, сэкономите столько-то». null — клиент уже на самом дешёвом
 * тарифе (30+) либо следующая ступень не дешевле.
 */
function computeWishUpsell(m: RentalModel, days: number) {
  // Целевой день — минимум следующей (более дешёвой) ступени.
  let targetDays: number;
  if (days <= 2) targetDays = 3;
  else if (days <= 6) targetDays = 7;
  else if (days <= 29) targetDays = 30;
  else return null; // уже самый дешёвый тариф (30+)
  if (targetDays <= days) return null;
  const curRate = rateForDays(m, days);
  const nextRate = rateForDays(m, targetDays);
  if (nextRate >= curRate) return null; // следующая ступень не дешевле — пропускаем
  const perDaySave = curRate - nextRate; // экономия за сутки
  return {
    targetDays,
    addDays: targetDays - days,
    curRate,
    nextRate,
    perDaySave,
    // Экономия за весь целевой срок по новому тарифу vs тот же срок по старому.
    savings: targetDays * perDaySave,
  };
}

/**
 * Карточка-рекомендация «возьмите подольше — дешевле» на шаге периода.
 * Живёт ПОД расчётом цены в сниппете (вместо кнопки «Продолжить»). Помогает
 * продать больший срок: показывает экономию и переход на более дешёвый тариф,
 * по тапу применяет рекомендованное число дней. Есть мягкий отказ «Спасибо,
 * не надо» (onDismiss) — чтобы не быть навязчивым.
 */
function WishUpsell({
  model,
  days,
  onApply,
  onDismiss,
}: {
  model: RentalModel;
  days: number;
  onApply: (d: number) => void;
  onDismiss?: () => void;
}) {
  const up = computeWishUpsell(model, days);
  if (!up) return null;
  const rub = (n: number) => n.toLocaleString("ru-RU");
  return (
    // key={targetDays} — при смене рекомендации карточка переанимируется.
    <div
      key={up.targetDays}
      style={{ animation: "apUpsellIn .38s cubic-bezier(.22,1,.36,1)" }}
      className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 p-[1.5px] shadow-lg shadow-emerald-500/20"
    >
      <style>{`@keyframes apUpsellIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}`}</style>
      <div className="rounded-[15px] bg-white p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30">
            <Sparkles size={16} />
          </div>
          <div className="text-[14.5px] font-bold text-slate-900">
            Можно сэкономить
          </div>
          <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-1 text-[12.5px] font-extrabold tabular-nums text-emerald-700">
            −{rub(up.savings)} ₽
          </span>
        </div>
        <div className="mt-2 text-[13.5px] leading-snug text-slate-600">
          Возьмите ещё{" "}
          <b className="text-slate-900">
            {up.addDays} {daysWord(up.addDays)}
          </b>{" "}
          — и платите <b className="text-slate-900">{rub(up.nextRate)} ₽/сут</b>{" "}
          вместо {rub(up.curRate)} ₽.
        </div>
        <button
          type="button"
          onClick={() => onApply(up.targetDays)}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-[14.5px] font-semibold text-white shadow-sm shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-700 active:scale-[.98]"
        >
          Взять {up.targetDays} {daysWord(up.targetDays)}
          <ArrowRight size={16} />
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-1.5 w-full text-center text-[12.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            Спасибо, не надо
          </button>
        )}
      </div>
    </div>
  );
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
      <h1 className="text-[22px] font-bold text-slate-900">
        Выберите экипировку
      </h1>
      <p className="text-[14px] text-slate-600">
        Для <span className="font-semibold text-slate-700">{selected.name}</span>{" "}
        — по желанию: шлем, цепь и прочее. Можно пропустить.
      </p>

      {equipment.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">
          Экипировку подберём при выдаче.
        </div>
      )}
      {equipment.length > 0 && (
        <EquipmentCoverflow
          items={equipment}
          selectedIds={form.wantEquipmentIds}
          onToggle={toggleEquip}
        />
      )}
    </div>
  );
}

/** Шаг выбора аренды №3 — когда и на сколько + итоговая цена. */
function WishPeriodStep({
  form,
  setField,
  models,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  models: RentalModel[];
}) {
  const days = form.wantDays > 0 ? form.wantDays : 7;
  const selected = models.find((m) => m.name === form.wantModel) ?? null;
  // Старт по умолчанию — сегодня (чтобы календарь и сводка всегда были
  // наполнены); реальный wantStartDate проставится при выборе на календаре.
  const startIso = form.wantStartDate || todayIsoLocal();
  const endIso = addDaysIso(startIso, days);
  if (!selected) return <WishNoModelNote what="период" />;

  // Срок задаётся ТАПОМ по календарю (начало → конец). Без пресетов/степпера:
  // даты, цена и совет «выгоднее» — в нижнем сниппете «Ваш выбор».
  return (
    <div className="space-y-3">
      <h1 className="text-[22px] font-bold text-slate-900">Выберите период</h1>
      <InlineRangeCalendar
        from={startIso}
        to={endIso}
        minDate={todayIsoLocal()}
        onChange={({ from, to }) => {
          setField("wantStartDate", from);
          setField("wantDays", Math.max(1, daysBetweenIso(from, to)));
        }}
      />
      <div className="text-center text-[13px] leading-snug text-slate-500">
        Тапните дату начала, затем дату конца. Стоимость и подсказки — в блоке
        «Ваш выбор» внизу.
      </div>
    </div>
  );
}
