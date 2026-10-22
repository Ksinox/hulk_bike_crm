import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePersistedFormState } from "@/lib/usePersistedState";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  House,
  IdCard,
  Image as ImageIcon,
  Megaphone,
  ScanLine,
  Smartphone,
  Stamp,
  UserRound,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { CheckBox, Picker } from "@/components/ui/picker";
import { Switch } from "@/components/ui/switch";
import { useIsMobile, useTabletLayout } from "@/lib/useIsMobile";
import { TABLET_DIALOG_OVERLAY, TABLET_DIALOG_PANEL } from "@/mobile/tablet";
import {
  getClientDetails,
  SOURCE_LABEL,
  type Client,
  type ClientSource,
} from "@/lib/mock/clients";
import { useApiClients, clientsKeys } from "@/lib/api/clients";
import {
  applicationsKeys,
  useApplications,
  type ApiApplication,
} from "@/lib/api/clientApplications";
import { applicationToFormInit } from "./applicationConvert";
import { api } from "@/lib/api";
import {
  DocUpload,
  DocUploadMulti,
  type UploadedFile,
} from "./DocUpload";
import { clientStore } from "./clientStore";
import { clientDocsKeys } from "@/lib/api/documents";
import { queryClient } from "@/lib/queryClient";
import { DatePicker } from "@/components/ui/date-picker";
import { toast, confirmDialog } from "@/lib/toast";
import type { ApplicationFormInit } from "./applicationConvert";
import { toTitleCaseRu } from "@/lib/textCase";

/**
 * v0.7.4: заливает выбранное фото клиента в client_documents
 * (kind='photo'), чтобы оно переживало reload. До этого фото жило
 * только в локальном clientStore.photos и пропадало после F5.
 */
const PHOTO_API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

async function uploadClientDocFile(
  clientId: number,
  kind: "photo" | "passport" | "license" | "extra",
  file: File,
  title: string,
): Promise<void> {
  const fd = new FormData();
  fd.append("clientId", String(clientId));
  fd.append("kind", kind);
  fd.append("title", title);
  fd.append("file", file);
  const res = await fetch(`${PHOTO_API_BASE}/api/client-documents/upload`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  queryClient.invalidateQueries({ queryKey: clientDocsKeys.byClient(clientId) });
}

async function uploadClientPhoto(
  clientId: number,
  file: File,
  title: string,
): Promise<void> {
  return uploadClientDocFile(clientId, "photo", file, title);
}

const SOURCE_OPTIONS: { id: ClientSource; label: string }[] = [
  { id: "avito", label: SOURCE_LABEL.avito },
  { id: "repeat", label: SOURCE_LABEL.repeat },
  { id: "ref", label: SOURCE_LABEL.ref },
  { id: "maps", label: SOURCE_LABEL.maps },
  { id: "other", label: SOURCE_LABEL.other },
];

/**
 * Спец-значение источника для выбора «свой вариант» — UI откроет
 * текстовое поле для произвольного источника. В DB сохраним как
 * source='other' + sourceCustom='<текст>'.
 */
type SourceChoice = ClientSource | "" | "custom";

type Form = {
  name: string;
  phone: string;
  phone2: string;
  birth: string;
  source: SourceChoice;
  sourceCustom: string;
  /** Гражданство: РФ → строгая форма паспорта; иностранец → свободная. */
  isForeigner: boolean;
  /** Произвольное описание паспорта для иностранца. */
  passportRaw: string;

  passSer: string;
  passNum: string;
  passIssuer: string;
  passDate: string;
  passCode: string;

  regAddr: string;
  sameAddr: boolean;
  liveAddr: string;

  photoFile: UploadedFile | null;
  passportMainFile: UploadedFile | null;
  passportRegFile: UploadedFile | null;
  licenseFile: UploadedFile | null;
  contractFile: UploadedFile | null;
  otherDocs: UploadedFile[];

  blacklisted: boolean;
  blReason: string;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  phone2: "",
  birth: "",
  source: "",
  sourceCustom: "",
  isForeigner: false,
  passportRaw: "",
  passSer: "",
  passNum: "",
  passIssuer: "",
  passDate: "",
  passCode: "",
  regAddr: "",
  sameAddr: true,
  liveAddr: "",
  photoFile: null,
  passportMainFile: null,
  passportRegFile: null,
  licenseFile: null,
  contractFile: null,
  otherDocs: [],
  blacklisted: false,
  blReason: "",
};

function validateName(v: string): string | null {
  const parts = v.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1])
    return "Нужно минимум Имя и Фамилия";
  return null;
}

function validatePhone(v: string): string | null {
  const digits = v.replace(/\D/g, "");
  if (digits.length !== 11) return "Введите 11 цифр телефона";
  return null;
}

function validateBirth(v: string): string | null {
  const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "Формат ДД.ММ.ГГГГ";
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const today = new Date();
  const age = today.getFullYear() - date.getFullYear();
  if (age < 18) return "Клиент должен быть 18+";
  if (age > 100) return "Проверьте дату рождения";
  return null;
}

function validateSeries(v: string): string | null {
  if (!/^\d{4}$/.test(v)) return "4 цифры";
  return null;
}

function validateNumber(v: string): string | null {
  if (!/^\d{6}$/.test(v)) return "6 цифр";
  return null;
}

/** Код подразделения NNN-NNN — обязателен для договора (R3). */
function validateDivisionCode(v: string): string | null {
  if (!/^\d{3}-\d{3}$/.test(v)) return "формат 000-000";
  return null;
}

function findDuplicateIn(phone: string, pool: { id: number; name: string; phone: string }[]): { id: number; name: string; phone: string } | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 11) return null;
  return pool.find((c) => c.phone.replace(/\D/g, "") === digits) ?? null;
}

/**
 * ДД.ММ.ГГГГ → ISO YYYY-MM-DD для столбцов date в Postgres.
 * Если строка пустая или невалидная — возвращаем null,
 * Drizzle/Zod примет это как «поле не заполнено».
 */
function dateRuToIso(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

/**
 * DD.MM.YYYY ↔ YYYY-MM-DD конверторы для DatePicker. Контракт DatePicker —
 * ISO; форма AddClientModal внутри хранит «русский» формат с автомаской.
 * Эти helpers переводят туда-обратно.
 */
function ruToIsoDate(ru: string): string | null {
  return dateRuToIso(ru);
}
function isoToRuDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
function todayIso(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** F8: разумный месяц для открытия календаря даты рождения — ~25 лет назад
 *  (типичный возраст арендатора), чтобы не листать от текущего года. */
function birthDefaultMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear() - 25}-01-01`;
}

/** Trim + null если пусто — чтобы не отправлять "" в API. */
function nullableTrim(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

/**
 * Автоформат кода подразделения паспорта XXX-XXX —
 * тире после 3 цифр.
 */
function formatDivisionCode(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

function formatPhone(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  const d = digits.startsWith("8") || digits.startsWith("7") ? digits : "7" + digits;
  const p = d.slice(0, 11);
  const parts = [
    "+7",
    p.slice(1, 4) && ` (${p.slice(1, 4)}`,
    p.slice(4, 7) && `) ${p.slice(4, 7)}`,
    p.slice(7, 9) && `-${p.slice(7, 9)}`,
    p.slice(9, 11) && `-${p.slice(9, 11)}`,
  ].filter(Boolean);
  return parts.join("");
}

function docToUploaded(
  doc: { name: string; date: string } | null,
): UploadedFile | null {
  if (!doc) return null;
  return { name: doc.name, label: `загружено ${doc.date}`, existing: true };
}

function initialForm(editing: Client | null): Form {
  if (!editing) return EMPTY;
  // Лог удобен на проде в DevTools, чтобы увидеть какие поля реально
  // прилетели из API в форму редактирования. Если editing.passport*
  // пустые — значит adaptClient/useApiClients не пробросил их (или
  // user смотрит старый bundle до hard-reload).
  // eslint-disable-next-line no-console
  console.info("[initialForm] editing:", editing);
  const d = getClientDetails(editing);
  // eslint-disable-next-line no-console
  console.info("[initialForm] details:", d);
  const sameAddr =
    d.liveAddr === "совпадает с регистрацией" || d.liveAddr === d.regAddr;
  return {
    name: editing.name,
    phone: editing.phone,
    phone2: editing.extraPhone ?? clientStore.getExtraPhone(editing.id) ?? "",
    birth: d.birth === "—" ? "" : d.birth,
    source: editing.source,
    sourceCustom: "",
    // Без этих двух строк форма редактирования теряла признак иностранца:
    // открыли карточку, переключили в «Иностранный гражданин», заполнили
    // паспорт текстом, сохранили → API записал is_foreigner=true. На
    // повторном открытии initialForm возвращал isForeigner:false /
    // passportRaw:"" — UI показывал «Гражданин РФ» с пустыми полями,
    // данные «исчезали».
    isForeigner: !!editing.isForeigner,
    passportRaw: editing.passportRaw ?? "",
    passSer: d.passport.ser === "—" ? "" : d.passport.ser,
    passNum:
      d.passport.num === "—" ? "" : d.passport.num.replace(/\s/g, ""),
    passIssuer: d.passport.issuer === "—" ? "" : d.passport.issuer,
    passDate: d.passport.date === "—" ? "" : d.passport.date,
    passCode: d.passport.code === "—" ? "" : d.passport.code,
    regAddr: d.regAddr === "—" ? "" : d.regAddr,
    sameAddr,
    liveAddr: sameAddr ? "" : d.liveAddr,
    photoFile: clientStore.getPhoto(editing.id),
    passportMainFile: docToUploaded(d.docs.passport_main),
    passportRegFile: docToUploaded(d.docs.passport_reg),
    licenseFile: docToUploaded(d.docs.license),
    contractFile: null,
    otherDocs: [],
    blacklisted: !!editing.blacklisted,
    blReason: d.blReason || "",
  };
}

export function AddClientModal({
  editing,
  onClose,
  onCreated,
  applicationId,
  initialData,
  saveLabel,
}: {
  editing?: Client | null;
  onClose: () => void;
  onCreated?: (client: Client) => void;
  /** Своя подпись кнопки сохранения (из мастера аренды — «…к выбору скутера»). */
  saveLabel?: string;
  /** Если задан — после save вызвать convert API и удалить заявку. */
  applicationId?: number;
  /** Предзаполненные поля из публичной заявки (мерджатся в EMPTY). */
  initialData?: ApplicationFormInit;
}) {
  const isEdit = !!editing;
  const qc = useQueryClient();
  // v1.0.4: черновик формы переживает случайное обновление страницы.
  // Ключ — по сущности (заявка/новый), чтобы черновики не путались. Файлы
  // (селфи/сканы) не сохраняем (см. omit). Редактирование не черновим.
  const draftKey = `client-form:${
    editing
      ? `edit-${editing.id}`
      : applicationId
        ? `app-${applicationId}`
        : "new"
  }`;
  const [f, setF, clearDraft] = usePersistedFormState<Form>(
    draftKey,
    () => {
    const base = initialForm(editing ?? null);
    if (!editing && initialData) {
      return {
        ...base,
        name: initialData.name || base.name,
        phone: initialData.phone || base.phone,
        phone2: initialData.phone2 || base.phone2,
        birth: initialData.birth || base.birth,
        isForeigner: initialData.isForeigner,
        passportRaw: initialData.passportRaw || base.passportRaw,
        passSer: initialData.passSer || base.passSer,
        passNum: initialData.passNum || base.passNum,
        passIssuer: initialData.passIssuer || base.passIssuer,
        passDate: initialData.passDate || base.passDate,
        passCode: initialData.passCode || base.passCode,
        regAddr: initialData.regAddr || base.regAddr,
        sameAddr: initialData.sameAddr,
        liveAddr: initialData.liveAddr || base.liveAddr,
        // Источник: если клиент сам выбрал в анкете — подставляем,
        // иначе оставляем дефолт формы (менеджер выберет).
        source: initialData.source ?? base.source,
        sourceCustom: initialData.sourceCustom || base.sourceCustom,
        // F18: фото из заявки сразу подставляем в слоты сканов — оператор
        // видит их как уже приложенные (превью + можно заменить/удалить).
        // Бэкенд /convert сам перенесёт эти файлы в client_documents,
        // поэтому форма их не перезаливает (см. keepFiles при сохранении).
        photoFile: initialData.photoFile ?? base.photoFile,
        passportMainFile: initialData.passportMainFile ?? base.passportMainFile,
        passportRegFile: initialData.passportRegFile ?? base.passportRegFile,
        licenseFile: initialData.licenseFile ?? base.licenseFile,
      };
    }
    return base;
    },
    {
      // Файлы (UploadedFile-обёртки) не сериализуются в sessionStorage —
      // после refresh их прикладывают заново; напечатанный текст вернётся.
      omit: [
        "photoFile",
        "passportMainFile",
        "passportRegFile",
        "licenseFile",
        "contractFile",
      ],
      disabled: isEdit,
    },
  );
  const [closing, setClosing] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>(() =>
    isEdit
      ? ({
          name: true,
          phone: true,
          birth: true,
          passSer: true,
          passNum: true,
        } as Record<string, boolean>)
      : ({} as Record<string, boolean>),
  );
  /** Если оператор подтянул данные из найденной заявки — здесь её id.
   *  При сохранении клиента вызовется convert (как если бы он зашёл
   *  через виджет «Новые заявки»). */
  const [linkedAppId, setLinkedAppId] = useState<number | null>(null);
  /** Подсказка отклонена («Скрыть») — больше не показываем. */
  const [hintDismissed, setHintDismissed] = useState(false);
  /** Дебаунсенный запрос для авто-поиска похожих заявок. */
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    if (isEdit || applicationId || linkedAppId || hintDismissed) {
      setDebouncedQuery("");
      return;
    }
    const name = f.name.trim();
    const phone = f.phone.replace(/\D/g, "");
    const next = name.length >= 3 ? name : phone.length >= 5 ? phone : "";
    if (next === debouncedQuery) return;
    const handle = window.setTimeout(() => setDebouncedQuery(next), 250);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.name, f.phone, isEdit, applicationId, linkedAppId, hintDismissed]);
  const isFromApplication = !!applicationId || !!linkedAppId;
  const matchedAppsQ = useApplications({
    status: "all",
    q: debouncedQuery,
    poll: false,
    enabled: !isEdit && !isFromApplication && debouncedQuery.length > 0,
  });
  const matchedApp: ApiApplication | null = useMemo(() => {
    const list = matchedAppsQ.data ?? [];
    // Не предлагаем уже принятые заявки (accepted=это тот же клиент).
    return (
      list.find(
        (a) =>
          a.status === "new" ||
          a.status === "viewed" ||
          a.status === "rejected" ||
          a.status === "spam",
      ) ?? null
    );
  }, [matchedAppsQ.data]);

  // F7: форма «грязная» — пользователь что-то ввёл/изменил. Закрытие
  // (Esc / крестик / Отмена) тогда требует подтверждения, чтобы случайно
  // не потерять введённые данные.
  const dirtyRef = useRef(false);

  const doClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 160);
  };

  const requestClose = () => {
    if (closing) return;
    if (!dirtyRef.current) {
      doClose();
      return;
    }
    void confirmDialog({
      title: "Закрыть без сохранения?",
      message: "В форме есть несохранённые данные — они будут потеряны.",
      confirmText: "Закрыть",
      cancelText: "Остаться",
      danger: true,
    }).then((ok) => {
      if (ok) {
        // Пользователь подтвердил «данные будут потеряны» — чистим и черновик,
        // иначе при следующем открытии той же заявки текст «воскреснет».
        clearDraft();
        doClose();
      }
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = useMemo(
    () => ({
      name: validateName(f.name),
      phone: validatePhone(f.phone),
      birth: validateBirth(f.birth),
      // Для иностранца паспорт в свободной форме — структурные поля не валидируем.
      passSer: f.isForeigner ? null : validateSeries(f.passSer),
      passNum: f.isForeigner ? null : validateNumber(f.passNum),
      passCode: f.isForeigner ? null : validateDivisionCode(f.passCode),
      passportRaw:
        f.isForeigner && f.passportRaw.trim().length === 0
          ? "Опишите документ"
          : null,
      // Адрес регистрации обязателен для РФ (нужен для договора). Для
      // иностранца «прописки по паспорту РФ» нет — не требуем.
      regAddr:
        f.isForeigner || f.regAddr.trim().length > 0
          ? null
          : "Укажите адрес регистрации",
      source:
        !f.source
          ? "Выберите источник"
          : null,
      sourceCustom:
        f.source === "custom" && f.sourceCustom.trim().length === 0
          ? "Укажите свой вариант"
          : null,
      blReason:
        f.blacklisted && f.blReason.trim().length === 0
          ? "Укажите причину"
          : null,
    }),
    [f],
  );

  const { data: apiClients } = useApiClients();
  const duplicate = useMemo(() => {
    const pool = (apiClients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
    }));
    const d = findDuplicateIn(f.phone, pool);
    if (d && editing && d.id === editing.id) return null;
    return d;
  }, [f.phone, editing, apiClients]);

  const required = [
    errors.name,
    errors.phone,
    errors.birth,
    errors.passSer,
    errors.passNum,
    errors.passCode,
    errors.passportRaw,
    errors.regAddr,
    errors.source,
    errors.sourceCustom,
  ];
  const ok = required.filter((e) => e === null).length;
  const total = required.length;
  const progress = Math.round((ok / total) * 100);
  const canSave = required.every((e) => e === null) && !errors.blReason;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    dirtyRef.current = true; // F7: пользователь редактирует форму
    setF((prev) => ({ ...prev, [key]: value }));
  };

  const showErr = (key: string) =>
    (touched[key] && errors[key as keyof typeof errors]) || null;

  const markTouched = (key: string) =>
    setTouched((prev) => ({ ...prev, [key]: true }));

  /**
   * 22.10 (заказчик): на телефоне и планшете анкета — по шагам, как в
   * приложениях («Кто клиент? → Паспорт → Адрес → Документы»), а не все
   * поля разом. Компьютер не меняется. Шаги не размонтируются (hidden), так
   * что введённое и прикреплённые сканы не теряются при «Назад».
   */
  const tabletLayout = useTabletLayout();
  const stepMode = useIsMobile();
  const colCls = "contents";
  /**
   * 22.10 (заказчик, ЖЕЛЕЗНО): «одна мысль — один экран». Экран — крупный
   * вопрос и поля одной мысли (кто это / как связаться / паспорт…), первое
   * поле сразу активно и клавиатура открыта, Enter — дальше; у
   * необязательного — «Пропустить»; в конце — экран проверки всех данных.
   * На планшете рядом собирается живая карточка клиента.
   */
  const microMode = stepMode && !isEdit;
  const MICROS = microList(f.isForeigner);
  const [micro, setMicro] = useState<MicroId>("photo");
  const microIdx = Math.max(0, MICROS.indexOf(micro));
  /** Поле видно, если его экран — текущий. */
  const M = (fid: FieldId) => (!microMode || FIELD_SCREEN[fid] === micro ? "contents" : "hidden");
  const microErrors = (id: MicroId): string[] =>
    (MICRO_META[id].keys as readonly string[]).filter(
      (k) => !!errors[k as keyof typeof errors],
    );
  const microFilled = (id: MicroId): boolean => {
    switch (id) {
      case "photo": return !!f.photoFile;
      case "scans": return !!(f.passportMainFile || f.passportRegFile);
      case "docs": return !!f.licenseFile || f.otherDocs.length > 0;
      default: return true;
    }
  };
  const focusMicro = () => {
    // Клавиатура на iPhone/iPad открывается, только если фокус дан прямо в
    // обработчике нажатия, — поэтому flushSync, а не эффект после рендера.
    const el = document.querySelector<HTMLElement>(
      "[data-micro-active] input:not([type=file]):not([type=checkbox]), [data-micro-active] textarea",
    );
    if (el) {
      el.setAttribute("enterkeyhint", "next");
      el.focus();
    }
  };
  const goTo = (id: MicroId) => {
    flushSync(() => setMicro(id));
    focusMicro();
  };
  const goNext = () => {
    const errs = microErrors(micro);
    if (errs.length > 0 || (micro === "contact" && duplicate)) {
      setTouched((prev) => ({ ...prev, ...Object.fromEntries(errs.map((k) => [k, true])) }));
      return;
    }
    const nx = MICROS[microIdx + 1];
    if (nx) goTo(nx);
  };
  const goBack = () => {
    const pv = MICROS[microIdx - 1];
    if (pv) goTo(pv);
    else requestClose();
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/50 p-0 backdrop-blur-sm sm:p-6",
        tabletLayout && TABLET_DIALOG_OVERLAY,
        closing ? "animate-backdrop-out" : "animate-backdrop-in",
      )}
    >
      <div
        className={cn(
          "min-h-[100dvh] w-full overflow-hidden rounded-none bg-surface shadow-card-lg sm:min-h-0 sm:max-w-[720px] sm:rounded-2xl",
          // Мастер на телефоне: шапка и кнопки на месте, едет только шаг.
          stepMode && !isEdit && "flex h-[100dvh] flex-col",
          tabletLayout && TABLET_DIALOG_PANEL,
          closing ? "animate-modal-out" : "animate-modal-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {microMode ? (
          <MicroHeader
            micros={MICROS}
            current={micro}
            tablet={tabletLayout}
            foreigner={f.isForeigner}
            onGroup={(id) => goTo(id)}
            canOpen={(id) => MICROS.slice(0, MICROS.indexOf(id)).every((m) => microErrors(m).length === 0)}
            onClose={requestClose}
          />
        ) : (
        <div className="relative border-b border-border bg-surface-soft px-6 py-4">
          <button
            type="button"
            onClick={requestClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-border hover:text-ink"
            title="Закрыть (Esc)"
          >
            <X size={16} />
          </button>
          <h2 className="font-display text-[22px] font-extrabold text-ink">
            {isEdit ? `Редактировать: ${editing!.name}` : "Новый клиент"}
          </h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {isEdit ? (
              <>id #{String(editing!.id).padStart(4, "0")}</>
            ) : (
              <>
                Заполните данные —{" "}
                <span className="text-red-ink">*</span> обязательные поля
              </>
            )}
          </p>
        </div>
        )}

        {/* Body (+ на планшете справа живая карточка клиента) */}
        <div className={microMode && tabletLayout ? "flex min-h-0 flex-1" : "contents"}>
        <div
          className={cn(
            "max-h-[calc(100vh-260px)] overflow-y-auto px-6 py-5",
            // Планшет: анкета в две колонки — иначе поля тянутся на 1180px
            // в одну строку, а форма уходит в долгую прокрутку.
            // Планшет: анкета в две колонки, каждая прокручивается сама —
            // окно целиком не едет, а поля не растягиваются на 1180px.
            microMode && "micro-xl !max-h-none min-h-0 w-full flex-1 px-5 py-6",
            tabletLayout &&
              (microMode
                ? "tab-xl flex flex-col px-12 py-8"
                : "!max-h-none grid min-h-0 flex-1 grid-cols-2 items-start gap-x-8 overflow-hidden px-7 py-5"),
          )}
          onKeyDown={(e) => {
            if (!microMode || e.key !== "Enter" || e.shiftKey) return;
            e.preventDefault();
            if (micro !== "review") goNext();
          }}
        >
          {/* Планшет: блок экрана — по оптическому центру (my-auto), при
              нехватке места просто прокручивается. */}
          <div className={microMode && tabletLayout ? "mx-auto my-auto w-full max-w-[640px]" : "contents"}>
          {microMode && tabletLayout && (
            <LiveClientStrip f={f} className="mb-6 landscape:hidden" />
          )}
          {microMode && (
            <MicroQuestion id={micro} tablet={tabletLayout} />
          )}
          {microMode && micro === "review" && (
            <MicroReview
              f={f}
              foreigner={f.isForeigner}
              duplicateName={duplicate?.name ?? null}
              onEdit={(id) => goTo(id)}
            />
          )}
          <div className={colCls}>
          <div className="contents">
          {/* Photo (optional) */}
          <div className={M("photo")} {...(FIELD_SCREEN.photo === micro && microMode ? { "data-micro-active": "" } : {})}>
          {microMode ? (
            <MicroCapture
              file={f.photoFile}
              onChange={(v) => set("photoFile", v)}
              selfie
              tablet={tabletLayout}
            />
          ) : (
          <div className="mb-6 flex items-center gap-4">
            <PhotoSlot
              file={f.photoFile}
              onChange={(v) => set("photoFile", v)}
              fallback={f.name || (editing?.name ?? "")}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">
                Фото клиента
              </div>
              <div className="mt-0.5 text-[12px] text-muted">
                Необязательно — но помогает узнать клиента в лицо. Для{" "}
                проблемных клиентов особенно полезно.
              </div>
            </div>
          </div>
          )}
          </div>

          {matchedApp && !isFromApplication && (
            <ApplicationMatchHint
              app={matchedApp}
              onPull={() => {
                const init = applicationToFormInit(matchedApp);
                // Заказчик 06.09 (п.3): «показывает ФИО из заявки, а не
                // введённое» — то, что оператор уже напечатал, не трогаем,
                // из заявки подставляются только пустые поля.
                setF((prev) => ({
                  ...prev,
                  name: prev.name.trim() ? prev.name : init.name || prev.name,
                  phone: prev.phone.replace(/\D/g, "").length >= 11 ? prev.phone : init.phone || prev.phone,
                  phone2: init.phone2 || prev.phone2,
                  birth: init.birth || prev.birth,
                  isForeigner: init.isForeigner,
                  passportRaw: init.passportRaw || prev.passportRaw,
                  passSer: init.passSer || prev.passSer,
                  passNum: init.passNum || prev.passNum,
                  passIssuer: init.passIssuer || prev.passIssuer,
                  passDate: init.passDate || prev.passDate,
                  passCode: init.passCode || prev.passCode,
                  regAddr: init.regAddr || prev.regAddr,
                  sameAddr: init.sameAddr,
                  liveAddr: init.liveAddr || prev.liveAddr,
                  source: init.source ?? prev.source,
                  sourceCustom: init.sourceCustom || prev.sourceCustom,
                  // F18: фото из подтянутой заявки — в слоты сканов.
                  photoFile: init.photoFile ?? prev.photoFile,
                  passportMainFile:
                    init.passportMainFile ?? prev.passportMainFile,
                  passportRegFile: init.passportRegFile ?? prev.passportRegFile,
                  licenseFile: init.licenseFile ?? prev.licenseFile,
                }));
                setLinkedAppId(matchedApp.id);
              }}
              onDismiss={() => setHintDismissed(true)}
            />
          )}

          {/* Section 1 — Основные */}
          <Section bare={stepMode && !isEdit} num={1} title="Основные" badge="обязательно">
<div className={M("name")} {...(FIELD_SCREEN.name === micro && microMode ? { "data-micro-active": "" } : {})}>
            <Field
              label="ФИО"
              required
              error={showErr("name")}
              htmlFor="f-name"
            >
              <input
                id="f-name"
                type="text"
                value={f.name}
                placeholder="Например: Иванов Иван Иванович"
                onChange={(e) => set("name", e.target.value)}
                onBlur={() => markTouched("name")}
                className={inputClass(showErr("name"))}
              />
            </Field>
</div>

<div className={M("phone")} {...(FIELD_SCREEN.phone === micro && microMode ? { "data-micro-active": "" } : {})}>
            <Field
              label="Телефон"
              required
              error={showErr("phone")}
              hint="Формат +7 (XXX) XXX-XX-XX"
              htmlFor="f-phone"
            >
              <input
                id="f-phone"
                type="tel"
                value={f.phone}
                placeholder="+7 (___) ___-__-__"
                onChange={(e) => set("phone", formatPhone(e.target.value))}
                onBlur={() => markTouched("phone")}
                className={inputClass(showErr("phone"))}
              />
              {/* Подсказку об уже существующем клиенте не показываем
                  во время заполнения — это новый клиент по определению.
                  Дубль ловим на сохранении и блокируем со стилизованной
                  ошибкой, чтобы не было случайных дублей. */}
            </Field>
</div>

<div className={M("phone2")} {...(FIELD_SCREEN.phone2 === micro && microMode ? { "data-micro-active": "" } : {})}>
            <Field
              label="Доп. контакт"
              hint="Родственник, жена, водитель — тот кто ответит если основной недоступен"
              htmlFor="f-phone2"
            >
              <input
                id="f-phone2"
                type="tel"
                value={f.phone2}
                placeholder="+7 (___) ___-__-__"
                onChange={(e) => set("phone2", formatPhone(e.target.value))}
                className={inputClass(null)}
              />
            </Field>
</div>

            <Row micro={microMode}>
<div className={M("birth")} {...(FIELD_SCREEN.birth === micro && microMode ? { "data-micro-active": "" } : {})}>
              <Field
                label="Дата рождения"
                required
                error={showErr("birth")}
                htmlFor="f-birth"
              >
                <DatePicker
                  id="f-birth"
                  value={ruToIsoDate(f.birth)}
                  onChange={(iso) => {
                    set("birth", iso ? isoToRuDate(iso) : "");
                    markTouched("birth");
                  }}
                  defaultMonth={birthDefaultMonthIso()}
                  maxDate={todayIso()}
                  clearable={false}
                  typeOnly={microMode}
                />
              </Field>
</div>
<div className={M("source")} data-micro-single {...(FIELD_SCREEN.source === micro && microMode ? { "data-micro-active": "" } : {})}>
              <Field
                label="Источник"
                required
                error={showErr("source")}
                htmlFor="f-source"
              >
                {microMode ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {[...SOURCE_OPTIONS.map((x) => ({ value: x.id as SourceChoice, label: x.label })), { value: "custom" as SourceChoice, label: "Свой вариант" }].map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          set("source", o.value);
                          // выбор сделан — сразу следующий шаг (проверка
                          // здесь не нужна: источник только что выбран)
                          const nx = MICROS[microIdx + 1];
                          if (o.value !== "custom" && nx) window.setTimeout(() => goTo(nx), 150);
                        }}
                        className={cn(
                          "min-h-[60px] rounded-2xl border-2 px-4 text-left text-[17px] font-bold transition-colors",
                          f.source === o.value ? "border-blue-600 bg-blue-50 text-blue-700" : "border-border bg-surface text-ink active:bg-surface-soft",
                        )}
                      >
                        {o.label.charAt(0).toUpperCase() + o.label.slice(1)}
                      </button>
                    ))}
                  </div>
                ) : (
                <Picker
                  id="f-source"
                  value={f.source === "" ? null : (f.source as SourceChoice)}
                  onChange={(v) => set("source", v)}
                  invalid={!!showErr("source")}
                  placeholder="Выберите источник…"
                  options={[
                    ...SOURCE_OPTIONS.map((s) => ({ value: s.id as SourceChoice, label: s.label })),
                    { value: "custom" as SourceChoice, label: "Свой вариант…" },
                  ]}
                />
                )}
                {f.source === "custom" && (
                  <input
                    type="text"
                    value={f.sourceCustom}
                    onChange={(e) => set("sourceCustom", e.target.value)}
                    placeholder="Откуда узнал о нас"
                    className={cn(
                      inputClass(showErr("sourceCustom")),
                      "mt-1.5",
                    )}
                  />
                )}
              </Field>
</div>
            </Row>
          </Section>
          </div>

          {/* Section 2 — Паспорт */}
          <div className="contents">
          <Section bare={stepMode && !isEdit} num={2} title="Паспортные данные" badge="для договора">
            <div className={M("doc")} {...(FIELD_SCREEN.doc === micro && microMode ? { "data-micro-active": "" } : {})}>
            <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-border bg-surface-soft p-2">
              <button
                type="button"
                onClick={() => set("isForeigner", false)}
                className={cn(
                  "flex-1 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  !f.isForeigner
                    ? "bg-blue-600 text-white"
                    : "text-muted hover:text-ink",
                )}
              >
                Гражданин РФ
              </button>
              <button
                type="button"
                onClick={() => set("isForeigner", true)}
                className={cn(
                  "flex-1 rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  f.isForeigner
                    ? "bg-blue-600 text-white"
                    : "text-muted hover:text-ink",
                )}
              >
                Иностранный гражданин
              </button>
            </div>

            {f.isForeigner && (
              <Field
                label="Документ удостоверяющий личность"
                hint={
                  <span className="text-[10px] text-muted-2">
                    в свободной форме — серия/номер паспорта, гражданство, кем
                    выдан, дата
                  </span>
                }
                htmlFor="f-praw"
              >
                <textarea
                  id="f-praw"
                  rows={4}
                  value={f.passportRaw}
                  onChange={(e) => set("passportRaw", toTitleCaseRu(e.target.value))}
                  placeholder="Например: Паспорт гражданина Узбекистана AB1234567, выдан МВД Респ. Узбекистан 12.03.2019, действителен до 12.03.2029"
                  className="w-full resize-y rounded-[10px] border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-blue-600"
                />
              </Field>
            )}
            </div>
            {!f.isForeigner && (
            <>
            <div className={M("passSerNum")} {...(FIELD_SCREEN.passSerNum === micro && microMode ? { "data-micro-active": "" } : {})}>
            <Row>
              <Field
                label="Серия"
                required
                error={showErr("passSer")}
                htmlFor="f-pser"
              >
                <input
                  id="f-pser"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={f.passSer}
                  placeholder="0000"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    set("passSer", v);
                    // v0.3.7: автопереход на следующее поле, когда серия заполнена
                    if (v.length === 4) {
                      document.getElementById("f-pnum")?.focus();
                    }
                  }}
                  onBlur={() => markTouched("passSer")}
                  className={inputClass(showErr("passSer"))}
                />
              </Field>
              <Field
                label="Номер"
                required
                error={showErr("passNum")}
                htmlFor="f-pnum"
              >
                <input
                  id="f-pnum"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={f.passNum}
                  placeholder="000000"
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    set("passNum", v);
                    // v0.3.7: автопереход на «Кем выдан», когда номер заполнен
                    if (v.length === 6 && !microMode) {
                      document.getElementById("f-pissuer")?.focus();
                    }
                  }}
                  onBlur={() => markTouched("passNum")}
                  className={inputClass(showErr("passNum"))}
                />
              </Field>
            </Row>
            </div>
<div className={M("issuer")} {...(FIELD_SCREEN.issuer === micro && microMode ? { "data-micro-active": "" } : {})}>
            <Field label="Кем выдан" htmlFor="f-pissuer">
              <input
                id="f-pissuer"
                type="text"
                value={f.passIssuer}
                placeholder="ОВД района…"
                onChange={(e) => set("passIssuer", toTitleCaseRu(e.target.value))}
                className={inputClass(null)}
              />
            </Field>
</div>
            <Row>
<div className={M("pdate")} {...(FIELD_SCREEN.pdate === micro && microMode ? { "data-micro-active": "" } : {})}>
              <Field label="Дата выдачи" htmlFor="f-pdate">
                <DatePicker
                  id="f-pdate"
                  value={ruToIsoDate(f.passDate)}
                  onChange={(iso) =>
                    set("passDate", iso ? isoToRuDate(iso) : "")
                  }
                  maxDate={todayIso()}
                  // После полного ввода (DD.MM.YYYY) — фокус на «Код
                  // подразделения», как было в старой паспортной форме.
                  nextFieldId={microMode ? undefined : "f-pcode"}
                  typeOnly={microMode}
                />
              </Field>
</div>
<div className={M("pcode")} {...(FIELD_SCREEN.pcode === micro && microMode ? { "data-micro-active": "" } : {})}>
              <Field
                label="Код подразделения"
                required
                error={showErr("passCode")}
                htmlFor="f-pcode"
              >
                <input
                  id="f-pcode"
                  type="text"
                  inputMode="numeric"
                  value={f.passCode}
                  placeholder="000-000"
                  maxLength={7}
                  onChange={(e) => {
                    const v = formatDivisionCode(e.target.value);
                    set("passCode", v);
                    // v0.4.46: автопереход на «Адрес регистрации» когда
                    // код подразделения заполнен (000-000 = 7 символов).
                    if (v.length === 7 && !microMode) {
                      document.getElementById("f-regaddr")?.focus();
                    }
                  }}
                  onBlur={() => markTouched("passCode")}
                  className={inputClass(showErr("passCode"))}
                />
              </Field>
</div>
            </Row>
<div className={M("scans")} {...(FIELD_SCREEN.scans === micro && microMode ? { "data-micro-active": "" } : {})}>
            {microMode ? (
              <div className="grid grid-cols-2 gap-3">
                <MicroCapture label="Разворот с фото" file={f.passportMainFile} onChange={(v) => set("passportMainFile", v)} tablet={tabletLayout} />
                <MicroCapture label="Прописка" file={f.passportRegFile} onChange={(v) => set("passportRegFile", v)} tablet={tabletLayout} />
              </div>
            ) : (
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <DocUpload
                label="Скан паспорта (основной разворот)"
                hint="JPG или PDF"
                file={f.passportMainFile}
                onChange={(v) => set("passportMainFile", v)}
              />
              <DocUpload
                label="Скан паспорта (прописка)"
                hint="JPG или PDF"
                file={f.passportRegFile}
                onChange={(v) => set("passportRegFile", v)}
              />
            </div>
            )}
</div>
            </>
            )}
          </Section>
          </div>

          {/* Section 3 — Адрес */}
          </div>
          <div className={colCls}>
          <div className="contents">
          <Section bare={stepMode && !isEdit} num={3} title="Адрес" badge="регистрация и проживание">
<div className={M("reg")} {...(FIELD_SCREEN.reg === micro && microMode ? { "data-micro-active": "" } : {})}>
            <Field
              label="Адрес регистрации (по паспорту)"
              required={!f.isForeigner}
              error={showErr("regAddr")}
              htmlFor="f-regaddr"
              hint="Как указано в паспорте на странице «прописка»"
            >
              <textarea
                id="f-regaddr"
                value={f.regAddr}
                placeholder="Индекс, регион, город, улица, дом, кв."
                onChange={(e) => set("regAddr", toTitleCaseRu(e.target.value))}
                onBlur={() => markTouched("regAddr")}
                className={cn(inputClass(showErr("regAddr")), "min-h-[56px] resize-y")}
              />
            </Field>
</div>
<div className={M("live")} {...(FIELD_SCREEN.live === micro && microMode ? { "data-micro-active": "" } : {})}>
            <CheckBox
              checked={f.sameAddr}
              onChange={(v) => set("sameAddr", v)}
              label="Фактический адрес совпадает с регистрацией"
            />
            {!f.sameAddr && (
              <Field label="Фактический адрес" htmlFor="f-liveaddr">
                <textarea
                  id="f-liveaddr"
                  value={f.liveAddr}
                  placeholder="Индекс, регион, город, улица, дом, кв."
                  onChange={(e) => set("liveAddr", toTitleCaseRu(e.target.value))}
                  className={cn(inputClass(null), "min-h-[56px] resize-y")}
                />
              </Field>
            )}
</div>
          </Section>
          </div>

          {/* Section 4 — Водительское */}
          <div className="contents">
          <div className={M("license")} {...(FIELD_SCREEN.license === micro && microMode ? { "data-micro-active": "" } : {})}>
          <Section bare={microMode} num={4} title="Водительское" badge="если есть">
            {microMode ? (
              <MicroCapture label="Водительское (обе стороны)" file={f.licenseFile} onChange={(v) => set("licenseFile", v)} tablet={tabletLayout} wide />
            ) : (
            <DocUpload
              label="Скан водительского"
              hint="обе стороны одним файлом или PDF. Если ВУ нет — оставьте пустым (клиент сможет взять только скутеры до 50 куб.см)"
              file={f.licenseFile}
              onChange={(v) => set("licenseFile", v)}
            />
            )}
          </Section>
          </div>

          {/* Section 5 — Доп. документы (паспорт, ВУ — выше; здесь
              остальное: справки, расписки и т.п.). Договоры в карточку
              клиента НЕ загружаем — они хранятся при сделке (аренде/
              рассрочке/выкупе), там и видны. Раньше тут был «Скан
              подписанного договора» — убран, чтобы не возникало
              двух разных мест для одного и того же файла. */}
          <div className={M("other")} {...(FIELD_SCREEN.other === micro && microMode ? { "data-micro-active": "" } : {})}>
          <Section bare={microMode} num={5} title="Прочие документы" badge="опционально">
            <DocUploadMulti
              label="Справки, расписки и прочее"
              hint="акты, расписки, чеки — можно несколько файлов"
              files={f.otherDocs}
              onChange={(v) => set("otherDocs", v)}
            />
          </Section>
          </div>

          {/* Section 6 — Статус */}
          {/* Чёрный список при заведении нового клиента — редкость: в
              микрошагах его нет, ставится в карточке клиента. */}
          <div className={microMode ? "hidden" : "contents"}>
          <Section num={6} title="Статус">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-border p-3">
              <div>
                <div className="text-[13px] font-semibold text-ink">
                  Чёрный список
                </div>
                <div className="text-[11px] text-muted">
                  Клиенту будет запрещена аренда
                </div>
              </div>
              <Switch
                checked={f.blacklisted}
                onChange={(v) => set("blacklisted", v)}
                label="Чёрный список"
              />
            </label>
            {f.blacklisted && (
              <Field
                label="Причина"
                required
                error={showErr("blReason")}
                htmlFor="f-blreason"
              >
                <textarea
                  id="f-blreason"
                  value={f.blReason}
                  placeholder="Например: повредил скутер #12, не оплатил ремонт"
                  onChange={(e) => set("blReason", e.target.value)}
                  onBlur={() => markTouched("blReason")}
                  className={cn(
                    inputClass(showErr("blReason")),
                    "min-h-[56px] resize-y",
                  )}
                />
              </Field>
            )}
          </Section>
          </div>
          </div>
          </div>
          </div>
        </div>
        {microMode && tabletLayout && (
          <LiveClientCard f={f} current={micro} onEdit={(id) => goTo(id)} />
        )}
        </div>

        {/* Footer: мастер — Назад / Далее, на последнем шаге — сохранить */}
        {microMode && micro !== "review" ? (
          <div
            className={cn(
              "flex items-center gap-2 border-t border-border bg-surface px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]",
              tabletLayout && "justify-end gap-4 px-10 py-5",
            )}
          >
            <button
              type="button"
              onClick={goBack}
              className={cn(
                "flex min-h-[48px] items-center justify-center gap-1 rounded-xl border border-border px-4 text-[14px] font-semibold text-muted active:bg-surface-soft",
                tabletLayout && "h-16 min-w-[190px] rounded-2xl text-[18px]",
              )}
            >
              <ChevronLeft size={tabletLayout ? 22 : 18} />
              {microIdx === 0 ? "Отмена" : "Назад"}
            </button>
            <button
              type="button"
              onClick={goNext}
              className={cn(
                "flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px] font-bold transition-colors",
                tabletLayout && "h-16 flex-none min-w-[320px] rounded-2xl text-[19px]",
                MICRO_META[micro].optional && !microFilled(micro)
                  ? "bg-surface-soft text-ink active:bg-border"
                  : microErrors(micro).length === 0
                    ? "bg-blue-600 text-white active:bg-blue-700"
                    : "bg-surface-soft text-muted-2",
              )}
            >
              {MICRO_META[micro].optional && !microFilled(micro) ? "Пропустить" : "Далее"}
              <ArrowRight size={tabletLayout ? 22 : 16} />
            </button>
          </div>
        ) : (
        <div
          className={cn(
            "border-t border-border px-6 py-4",
            stepMode && !isEdit && "px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]",
            tabletLayout && stepMode && !isEdit && "px-10 py-5",
          )}
        >
          <div className={cn("mb-3 flex items-center gap-3", stepMode && !isEdit && "hidden")}>
            <span className="text-[11px] font-semibold text-muted-2">
              {ok} / {total} обязательных
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-soft">
              <div
                className={cn(
                  "h-full transition-all",
                  progress === 100 ? "bg-green-ink" : "bg-blue-600",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-muted-2">
              {progress}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={cn("text-[11px] text-muted-2", stepMode && !isEdit && "hidden")}>
              Esc — закрыть · Ctrl+Enter — сохранить
            </span>
            <div className={cn("flex gap-2", stepMode && !isEdit && "flex-1 justify-end", tabletLayout && stepMode && !isEdit && "gap-4")}>
              <button
                type="button"
                onClick={microMode ? goBack : requestClose}
                className={cn(
                  "rounded-full border border-border px-4 py-1.5 text-[12px] font-semibold text-muted hover:bg-surface-soft",
                  stepMode && !isEdit && "flex min-h-[48px] items-center gap-1 rounded-xl text-[14px]",
                  tabletLayout && stepMode && !isEdit && "h-16 min-w-[190px] justify-center rounded-2xl text-[18px]",
                )}
              >
                {stepMode && !isEdit ? (
                  <>
                    <ChevronLeft size={tabletLayout ? 22 : 18} /> Назад
                  </>
                ) : (
                  "Отмена"
                )}
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={async () => {
                  if (!editing && duplicate) {
                    // 06.09 (п.3): говорим, ЧЬЁ имя в базе и что ввёл
                    // оператор — иначе казалось, что форма подменила ФИО.
                    const typed = f.name.trim();
                    const same =
                      typed.toLowerCase() === duplicate.name.trim().toLowerCase();
                    toast.error(
                      "Клиент с этим номером уже есть",
                      same
                        ? `«${duplicate.name}» уже в базе. Откройте его карточку, не создавайте дубль.`
                        : `В базе он записан как «${duplicate.name}», вы ввели «${typed || "—"}». Откройте его карточку и поправьте ФИО там, а не создавайте дубль.`,
                    );
                    return;
                  }
                  // Если выбран «свой вариант» — отправляем
                  // source='other' + sourceCustom='<текст>'.
                  const finalSource: ClientSource =
                    f.source === "custom" || f.source === ""
                      ? "other"
                      : (f.source as ClientSource);
                  const finalSourceCustom =
                    f.source === "custom" ? f.sourceCustom.trim() : null;
                  // Паспорт + адрес + дата рождения — общие для CREATE и PATCH.
                  // Для иностранца паспортные поля не строгие (форма скрывает
                  // их и заполняется passportRaw), поэтому отправляем null.
                  const passportFields = f.isForeigner
                    ? {
                        birthDate: dateRuToIso(f.birth),
                        passportSeries: null,
                        passportNumber: null,
                        passportIssuedOn: null,
                        passportIssuer: null,
                        passportDivisionCode: null,
                        passportRegistration: nullableTrim(f.regAddr),
                      }
                    : {
                        birthDate: dateRuToIso(f.birth),
                        passportSeries: nullableTrim(f.passSer),
                        passportNumber: nullableTrim(f.passNum),
                        passportIssuedOn: dateRuToIso(f.passDate),
                        passportIssuer: nullableTrim(f.passIssuer),
                        passportDivisionCode: nullableTrim(f.passCode),
                        passportRegistration: nullableTrim(f.regAddr),
                      };

                  if (editing) {
                    try {
                      await clientStore.patchClientAsync(editing.id, {
                        name: f.name.trim(),
                        phone: f.phone,
                        extraPhone: nullableTrim(f.phone2),
                        source: finalSource,
                        sourceCustom: finalSourceCustom,
                        isForeigner: f.isForeigner,
                        passportRaw: f.isForeigner
                          ? nullableTrim(f.passportRaw)
                          : null,
                        blacklisted: f.blacklisted,
                        blacklistReason: f.blacklisted
                          ? nullableTrim(f.blReason)
                          : null,
                        ...passportFields,
                      });
                      // Фото: оптимистично показываем локально + грузим
                      // в client_documents если выбран новый файл.
                      clientStore.setPhoto(editing.id, f.photoFile);
                      if (f.photoFile?.file) {
                        uploadClientPhoto(
                          editing.id,
                          f.photoFile.file,
                          `Фото · ${f.name.trim()}`,
                        )
                          .then(() => clientStore.setPhoto(editing.id, null))
                          .catch((e) =>
                            toast.error(
                              "Фото не сохранилось на сервере",
                              (e as Error).message ?? "",
                            ),
                          );
                      }
                      clientStore.setExtraPhone(
                        editing.id,
                        f.phone2 || null,
                      );
                      // Список заполненных полей — короткий чек, что
                      // реально ушло в API. Без этого пользователь
                      // не уверен, прошло ли сохранение.
                      const filled: string[] = [];
                      if (passportFields.passportSeries) filled.push("серия");
                      if (passportFields.passportNumber) filled.push("номер");
                      if (passportFields.passportIssuedOn)
                        filled.push("дата выдачи");
                      if (passportFields.passportIssuer)
                        filled.push("кем выдан");
                      if (passportFields.passportDivisionCode)
                        filled.push("код подр.");
                      if (passportFields.passportRegistration)
                        filled.push("адрес рег.");
                      if (passportFields.birthDate)
                        filled.push("дата рожд.");
                      toast.success(
                        "Клиент сохранён",
                        filled.length > 0
                          ? `Обновлено: ${filled.join(", ")}.`
                          : "Изменения переданы на сервер.",
                      );
                      // Сохранено успешно — снимаем «грязный» флаг, чтобы
                      // закрытие не спросило «закрыть без сохранения?».
                      dirtyRef.current = false;
                      requestClose();
                    } catch (e) {
                      toast.error(
                        "Не удалось сохранить клиента",
                        (e as Error).message ?? "",
                      );
                    }
                    return;
                  }
                  // Если открыты из заявки или оператор подтянул данные
                  // через auto-search — идём через convert API: он
                  // создаёт клиента, переносит файлы из заявки в
                  // client_documents и помечает заявку accepted.
                  const effectiveAppId = applicationId ?? linkedAppId;
                  if (effectiveAppId) {
                    // F18: keepFiles управляет переносом файлов заявки.
                    // По умолчанию бэкенд копирует все 4 вида. Теперь слоты
                    // формы предзаполнены превью этих файлов:
                    //  - слот не тронут (appFileKind остался) → keep=true,
                    //    бэкенд скопирует файл заявки (как и раньше);
                    //  - слот очищен (null) → keep=false, файл не переносим;
                    //  - слот заменён новым File (appFileKind пропал) →
                    //    keep=false + после convert грузим новый файл.
                    // Так избегаем дублей: файл заявки переносится РОВНО
                    // один раз и только если он остался в слоте.
                    const slotKind = (
                      uf: UploadedFile | null,
                    ): UploadedFile["appFileKind"] | undefined =>
                      uf?.appFileKind;
                    const keepFiles: Record<string, boolean> = {
                      passport_main:
                        slotKind(f.passportMainFile) === "passport_main",
                      passport_reg:
                        slotKind(f.passportRegFile) === "passport_reg",
                      license: slotKind(f.licenseFile) === "license",
                      selfie: slotKind(f.photoFile) === "selfie",
                    };
                    try {
                      const created = await api.post<{ id: number; name: string; phone: string }>(
                        `/api/client-applications/${effectiveAppId}/convert`,
                        {
                          name: f.name.trim(),
                          phone: f.phone,
                          extraPhone: nullableTrim(f.phone2),
                          source: finalSource,
                          sourceCustom: finalSourceCustom,
                          isForeigner: f.isForeigner,
                          passportRaw: f.isForeigner
                            ? nullableTrim(f.passportRaw)
                            : null,
                          blacklisted: f.blacklisted,
                          blacklistReason: f.blacklisted
                            ? nullableTrim(f.blReason)
                            : null,
                          keepFiles,
                          ...passportFields,
                        },
                      );
                      // Заменённые в форме файлы (новый File вместо файла
                      // заявки) — заливаем после convert. Файл заявки для
                      // них уже не перенесён (keep=false выше).
                      const createdId = (created as { id: number }).id;
                      const uploads: Promise<void>[] = [];
                      const clientName = f.name.trim();
                      if (f.photoFile?.file) {
                        uploads.push(
                          uploadClientDocFile(
                            createdId,
                            "photo",
                            f.photoFile.file,
                            `Фото · ${clientName}`,
                          ),
                        );
                      }
                      if (f.passportMainFile?.file) {
                        uploads.push(
                          uploadClientDocFile(
                            createdId,
                            "passport",
                            f.passportMainFile.file,
                            "Паспорт (главный разворот)",
                          ),
                        );
                      }
                      if (f.passportRegFile?.file) {
                        uploads.push(
                          uploadClientDocFile(
                            createdId,
                            "passport",
                            f.passportRegFile.file,
                            "Паспорт (прописка)",
                          ),
                        );
                      }
                      if (f.licenseFile?.file) {
                        uploads.push(
                          uploadClientDocFile(
                            createdId,
                            "license",
                            f.licenseFile.file,
                            "Водительское удостоверение",
                          ),
                        );
                      }
                      if (uploads.length > 0) {
                        Promise.all(uploads).catch((e) =>
                          toast.error(
                            "Часть файлов не сохранилась на сервере",
                            (e as Error).message ?? "",
                          ),
                        );
                      }
                      qc.invalidateQueries({ queryKey: clientsKeys.all });
                      qc.invalidateQueries({ queryKey: applicationsKeys.all });
                      // Снимаем «грязный» флаг ДО onCreated/закрытия: convert
                      // прошёл, данные на сервере — спрашивать «закрыть без
                      // сохранения?» нельзя (иначе диалог всплыл бы поверх
                      // следующего шага — оформления аренды).
                      dirtyRef.current = false;
                      clearDraft();
                      onCreated?.({
                        ...(created as unknown as Client),
                      });
                      requestClose();
                    } catch (e) {
                      toast.error(
                        "Не удалось оформить клиента из заявки",
                        (e as Error).message ?? "",
                      );
                    }
                    return;
                  }
                  try {
                    // Async: ждём реальный id из API. Иначе onCreated
                    // получит stub-id, и если консьюмер сразу шлёт его
                    // в API (например, привязывает к новой аренде) —
                    // получим 400 «client not found».
                    const created = await clientStore.addClientAsync({
                      name: f.name.trim(),
                      phone: f.phone,
                      extraPhone: nullableTrim(f.phone2),
                      rating: 68,
                      rents: 0,
                      debt: 0,
                      source: finalSource,
                      sourceCustom: finalSourceCustom,
                      isForeigner: f.isForeigner,
                      passportRaw: f.isForeigner
                        ? f.passportRaw.trim() || null
                        : null,
                      added: "13.10.26",
                      blacklisted: f.blacklisted || undefined,
                      blacklistReason: f.blacklisted
                        ? nullableTrim(f.blReason)
                        : null,
                      comment: f.blReason || undefined,
                      ...passportFields,
                    });
                    if (f.photoFile) {
                      clientStore.setPhoto(created.id, f.photoFile);
                      if (f.photoFile.file) {
                        uploadClientPhoto(
                          created.id,
                          f.photoFile.file,
                          `Фото · ${f.name.trim()}`,
                        )
                          .then(() => clientStore.setPhoto(created.id, null))
                          .catch((e) =>
                            toast.error(
                              "Фото не сохранилось на сервере",
                              (e as Error).message ?? "",
                            ),
                          );
                      }
                    }
                    if (f.phone2) clientStore.setExtraPhone(created.id, f.phone2);
                    dirtyRef.current = false;
                    clearDraft();
                    onCreated?.(created);
                    requestClose();
                  } catch (e) {
                    toast.error(
                      "Не удалось создать клиента",
                      (e as Error).message ?? "",
                    );
                  }
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors",
                  stepMode && !isEdit && "min-h-[48px] flex-1 rounded-xl text-[14px] font-bold",
                  tabletLayout && stepMode && !isEdit && "h-16 flex-none min-w-[320px] rounded-2xl text-[19px]",
                  canSave
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-surface-soft text-muted-2",
                )}
              >
                {isEdit
                  ? "Сохранить изменения"
                  : saveLabel ?? "Сохранить и открыть карточку →"}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/* =================== Helpers =================== */

function Section({
  num,
  title,
  badge,
  children,
  bare,
}: {
  num: number;
  title: string;
  badge?: string;
  children: React.ReactNode;
  /** Мастер: шаг уже назван вопросом сверху — свой заголовок не нужен. */
  bare?: boolean;
}) {
  return (
    <section className="mb-6 last:mb-0">
      <header className={cn("mb-3 flex items-center gap-2", bare && "hidden")}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
          {num}
        </span>
        <h3 className="font-display text-[18px] font-extrabold text-ink">
          {title}
        </h3>
        {badge && (
          <span className="rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {badge}
          </span>
        )}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Row({ children, micro }: { children: React.ReactNode; micro?: boolean }) {
  // Микрошаг: в ряду видно одно поле — оно во всю ширину.
  return <div className={micro ? "contents" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>{children}</div>;
}

function Field({
  label,
  required,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-[12px] font-semibold text-ink"
      >
        {label}
        {required && <span className="ml-0.5 text-red-ink">*</span>}
      </label>
      {children}
      {error ? (
        <div className="mt-1 text-[11px] text-red-ink">{error}</div>
      ) : hint ? (
        <div className="mt-1 text-[11px] text-muted-2">{hint}</div>
      ) : null}
    </div>
  );
}

function inputClass(error: string | null) {
  return cn(
    "h-9 w-full rounded-[10px] border bg-surface px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted-2",
    error
      ? "border-red focus:border-red"
      : "border-border focus:border-blue-600",
  );
}

function PhotoSlot({
  file,
  fallback,
  onChange,
}: {
  file: UploadedFile | null;
  fallback: string;
  onChange: (next: UploadedFile | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    const uf: UploadedFile = {
      name: f.name,
      size: f.size,
      thumbUrl: URL.createObjectURL(f),
      // v0.7.4: сырой File — нужен чтобы при сохранении формы залить
      // фото в client_documents (kind='photo'), иначе оно теряется при F5.
      file: f,
    };
    onChange(uf);
  };

  const initials = fallback
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-surface-soft text-[20px] font-bold text-muted transition-colors hover:border-blue-600"
        title={file ? "Заменить фото" : "Загрузить фото"}
      >
        {file?.thumbUrl ? (
          <img
            src={file.thumbUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{initials || "?"}</span>
        )}
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-ink/60 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
          {file ? "заменить" : "загрузить"}
        </span>
      </button>
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red text-white shadow-card transition-colors hover:bg-red-ink"
          title="Убрать фото"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function ApplicationMatchHint({
  app,
  onPull,
  onDismiss,
}: {
  app: ApiApplication;
  onPull: () => void;
  onDismiss: () => void;
}) {
  const dateStr = app.submittedAt
    ? new Date(app.submittedAt).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "long",
      })
    : "недавно";
  return (
    <div className="rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
          <span className="text-[16px]">!</span>
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-bold text-blue-900">
            Похожая {app.purpose === "sale" ? "анкета покупателя" : "заявка на аренду"} от{" "}
            {dateStr} — подтянуть данные?
          </div>
          <div className="mt-0.5 text-[12px] text-blue-900/80">
            {app.name || "без имени"} · {app.phone || "тел. не указан"}.
            Подставятся только пустые поля и фото — то, что вы уже ввели, останется.
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onPull}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700"
            >
              Подтянуть
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-blue-900 ring-1 ring-blue-200 hover:bg-blue-100"
            >
              Скрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════ Анкета по экранам «одна мысль» (телефон и планшет, 22.10) ═══════════════ */

/** Поле анкеты (обёртка в разметке формы). */
type FieldId =
  | "photo" | "name" | "phone" | "phone2" | "birth" | "source"
  | "doc" | "passSerNum" | "issuer" | "pdate" | "pcode" | "scans"
  | "reg" | "live" | "license" | "other";

/** Экран мастера — одна мысль. */
type MicroId =
  | "photo" | "who" | "contact" | "source" | "passport" | "issued"
  | "scans" | "address" | "docs" | "review";

/** На каком экране живёт поле. */
const FIELD_SCREEN: Record<FieldId, MicroId> = {
  photo: "photo",
  name: "who",
  birth: "who",
  phone: "contact",
  phone2: "contact",
  source: "source",
  doc: "passport",
  passSerNum: "passport",
  issuer: "issued",
  pdate: "issued",
  pcode: "issued",
  scans: "scans",
  reg: "address",
  live: "address",
  license: "docs",
  other: "docs",
};

const MICRO_META: Record<
  MicroId,
  {
    title: string;
    q: string;
    hint?: string;
    optional?: boolean;
    keys: readonly string[];
    Icon: typeof Camera;
    tone: string;
  }
> = {
  photo: { title: "Фото", q: "Сфотографируйте клиента", hint: "Так его проще узнать в лицо", optional: true, keys: [], Icon: Camera, tone: "bg-violet-50 text-violet-600" },
  who: { title: "Кто", q: "Кто клиент?", hint: "Как в паспорте", keys: ["name", "birth"], Icon: UserRound, tone: "bg-blue-50 text-blue-600" },
  contact: { title: "Связь", q: "Как связаться?", hint: "Запасной — кто ответит, если клиент недоступен", keys: ["phone"], Icon: Smartphone, tone: "bg-green-soft text-green-ink" },
  source: { title: "Откуда", q: "Откуда узнал о нас?", keys: ["source", "sourceCustom"], Icon: Megaphone, tone: "bg-orange-soft text-orange-ink" },
  passport: { title: "Паспорт", q: "Паспорт", hint: "Гражданство и номер документа", keys: ["passportRaw", "passSer", "passNum"], Icon: IdCard, tone: "bg-blue-50 text-blue-600" },
  issued: { title: "Выдан", q: "Кем и когда выдан?", hint: "Код подразделения — шесть цифр, например 230-001", keys: ["passCode"], Icon: Stamp, tone: "bg-blue-50 text-blue-600" },
  scans: { title: "Фото паспорта", q: "Фото паспорта", hint: "Разворот с фото и страница с пропиской", optional: true, keys: [], Icon: ScanLine, tone: "bg-violet-50 text-violet-600" },
  address: { title: "Адрес", q: "Где живёт?", hint: "Адрес регистрации — как в паспорте на странице «прописка»", keys: ["regAddr"], Icon: House, tone: "bg-amber-50 text-amber-700" },
  docs: { title: "Документы", q: "Права и документы", hint: "Без прав — только скутеры до 50 куб.см. Можно пропустить", optional: true, keys: [], Icon: FileText, tone: "bg-surface-soft text-ink-2" },
  review: { title: "Проверка", q: "Проверьте данные", hint: "Нажмите на строку, чтобы исправить", keys: [], Icon: ClipboardCheck, tone: "bg-green-soft text-green-ink" },
};

function microList(foreigner: boolean): MicroId[] {
  return foreigner
    ? ["photo", "who", "contact", "source", "passport", "address", "docs", "review"]
    : ["photo", "who", "contact", "source", "passport", "issued", "scans", "address", "docs", "review"];
}

function MicroQuestion({ id, tablet }: { id: MicroId; tablet: boolean }) {
  const m = MICRO_META[id];
  return (
    <div className={cn("mb-6 flex items-center gap-4", tablet && "mb-8 gap-5")}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl",
          tablet ? "h-16 w-16" : "h-12 w-12",
          m.tone,
        )}
      >
        <m.Icon size={tablet ? 30 : 23} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <h2 className={cn("font-display text-[24px] font-extrabold leading-tight tracking-tight text-ink", tablet && "text-[32px]")}>
          {m.q}
        </h2>
        {m.hint && <p className={cn("mt-1 text-[14.5px] leading-snug text-muted", tablet && "text-[17px]")}>{m.hint}</p>}
      </div>
    </div>
  );
}

function MicroHeader({
  micros,
  current,
  tablet,
  canOpen,
  onGroup,
  onClose,
}: {
  micros: MicroId[];
  current: MicroId;
  tablet: boolean;
  foreigner: boolean;
  canOpen: (id: MicroId) => boolean;
  onGroup: (id: MicroId) => void;
  onClose: () => void;
}) {
  const idx = micros.indexOf(current);
  return (
    <div className={cn("shrink-0 border-b border-border bg-surface px-5 pb-3 pt-4", tablet && "px-10 pb-4 pt-5")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className={cn("font-display text-[18px] font-extrabold text-ink", tablet && "text-[24px]")}>Новый клиент</div>
          <div className={cn("text-[13px] font-semibold text-muted-2", tablet && "text-[15px]")}>
            Шаг {idx + 1} из {micros.length} · {MICRO_META[current].title}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className={cn("flex h-11 w-11 items-center justify-center rounded-full bg-surface-soft text-muted active:bg-border", tablet && "h-12 w-12")}
        >
          <X size={tablet ? 22 : 19} />
        </button>
      </div>
      {/* Шкала шагов: отрезок на каждую мысль; на планшете — с названиями */}
      <div className={cn("mt-3 flex gap-1.5", tablet && "mt-4 gap-2")}>
        {micros.map((m, i) => {
          const open = canOpen(m);
          return (
            <button
              key={m}
              type="button"
              disabled={!open}
              onClick={() => onGroup(m)}
              className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
              aria-label={MICRO_META[m].title}
            >
              <span
                className={cn(
                  "h-1.5 w-full rounded-full transition-colors",
                  i < idx ? "bg-blue-600" : i === idx ? "bg-blue-600" : "bg-surface-soft",
                  i === idx && "shadow-[0_0_0_3px_rgba(37,99,235,0.15)]",
                )}
              />
              {tablet && (
                <span
                  className={cn(
                    "truncate text-[13px] font-bold",
                    i === idx ? "text-blue-600" : open ? "text-ink-2" : "text-muted-2",
                  )}
                >
                  {MICRO_META[m].title}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Живая карточка клиента (планшет): собирается по мере ввода ───────── */

function initialsOfName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function ageOf(birth: string): number | null {
  const m = birth.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

function sourceLabel(f: Form): string | null {
  if (f.source === "custom") return f.sourceCustom.trim() || null;
  const l = SOURCE_OPTIONS.find((x) => x.id === f.source)?.label;
  return l ? l.charAt(0).toUpperCase() + l.slice(1) : null;
}

function Avatar({ f, size }: { f: Form; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 font-display font-extrabold text-blue-700"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {f.photoFile?.thumbUrl ? (
        <img src={f.photoFile.thumbUrl} alt="" className="h-full w-full object-cover" />
      ) : f.name.trim() ? (
        initialsOfName(f.name)
      ) : (
        <UserRound size={size * 0.45} strokeWidth={1.6} />
      )}
    </span>
  );
}

/** Планшет стоя: карточка — компактной полоской над вопросом. */
function LiveClientStrip({ f, className }: { f: Form; className?: string }) {
  if (!f.name.trim() && !f.phone && !f.photoFile) return null;
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-surface-soft px-4 py-3", className)}>
      <Avatar f={f} size={44} />
      <div className="min-w-0">
        <div className="truncate text-[17px] font-bold text-ink">{f.name.trim() || "Новый клиент"}</div>
        <div className="truncate text-[14px] text-muted">{[f.phone, sourceLabel(f)].filter(Boolean).join(" · ") || "заполняется…"}</div>
      </div>
    </div>
  );
}

/** Планшет лёжа: карточка справа — видно, что уже собрано, нажал строку — к шагу. */
function LiveClientCard({
  f,
  current,
  onEdit,
}: {
  f: Form;
  current: MicroId;
  onEdit: (id: MicroId) => void;
}) {
  const age = ageOf(f.birth);
  const rows: { id: MicroId; label: string; value: string | null }[] = [
    { id: "contact", label: "Телефон", value: f.phone || null },
    { id: "source", label: "Откуда", value: sourceLabel(f) },
    {
      id: "passport",
      label: "Паспорт",
      value: f.isForeigner
        ? f.passportRaw.trim() ? "иностранный" : null
        : f.passSer || f.passNum ? `${f.passSer} ${f.passNum}`.trim() : null,
    },
    ...(!f.isForeigner ? [{ id: "issued" as MicroId, label: "Код подразд.", value: f.passCode || null }] : []),
    { id: "address", label: "Адрес", value: f.regAddr.trim() || null },
  ];
  const docs: { id: MicroId; label: string; ok: boolean }[] = [
    { id: "photo", label: "Фото", ok: !!f.photoFile },
    ...(!f.isForeigner ? [{ id: "scans" as MicroId, label: "Паспорт", ok: !!(f.passportMainFile || f.passportRegFile) }] : []),
    { id: "docs", label: "Права", ok: !!f.licenseFile },
  ];
  return (
    <aside className="hidden w-[380px] shrink-0 flex-col border-l border-border bg-surface-soft/60 px-7 py-8 landscape:flex">
      <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-muted-2">Карточка клиента</div>
      <div className="mt-4 rounded-3xl bg-surface p-5 shadow-card">
        <button type="button" onClick={() => onEdit("who")} className="flex w-full items-center gap-4 text-left">
          <Avatar f={f} size={64} />
          <span className="min-w-0">
            <span className={cn("block text-[19px] font-extrabold leading-tight", f.name.trim() ? "text-ink" : "text-muted-2")}>
              {f.name.trim() || "Имя клиента"}
            </span>
            <span className="mt-0.5 block text-[14.5px] text-muted">
              {f.birth ? `${f.birth}${age != null ? ` · ${age} ${age % 10 === 1 && age % 100 !== 11 ? "год" : age % 10 >= 2 && age % 10 <= 4 && (age % 100 < 12 || age % 100 > 14) ? "года" : "лет"}` : ""}` : "дата рождения"}
            </span>
          </span>
        </button>
        <div className="mt-4 flex flex-col">
          {rows.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => onEdit(r.id)}
              className={cn(
                "flex items-start justify-between gap-3 border-t border-border py-2.5 text-left",
                r.id === current && "text-blue-700",
              )}
            >
              <span className="shrink-0 text-[14px] text-muted">{r.label}</span>
              <span className={cn("min-w-0 break-words text-right text-[15px] font-semibold leading-snug", r.value ? "text-ink" : "text-muted-2")}>
                {r.value ?? "—"}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2 border-t border-border pt-3">
          {docs.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => onEdit(d.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13.5px] font-bold",
                d.ok ? "bg-green-soft text-green-ink" : "bg-surface-soft text-muted-2",
              )}
            >
              {d.ok ? <Check size={15} strokeWidth={3} /> : <Camera size={15} />}
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** Поля для экрана проверки. */
const REVIEW_FIELDS: { id: FieldId; label: string; optional?: boolean; long?: boolean }[] = [
  { id: "name", label: "ФИО" },
  { id: "birth", label: "Дата рождения" },
  { id: "phone", label: "Телефон" },
  { id: "phone2", label: "Запасной контакт", optional: true },
  { id: "source", label: "Откуда узнал" },
  { id: "doc", label: "Документ", long: true },
  { id: "passSerNum", label: "Серия и номер" },
  { id: "pcode", label: "Код подразделения" },
  { id: "issuer", label: "Кем выдан", optional: true, long: true },
  { id: "pdate", label: "Дата выдачи", optional: true },
  { id: "reg", label: "Регистрация", long: true },
  { id: "live", label: "Фактический адрес", optional: true, long: true },
  { id: "photo", label: "Фото", optional: true },
  { id: "scans", label: "Фото паспорта", optional: true },
  { id: "license", label: "Водительское", optional: true },
  { id: "other", label: "Другие документы", optional: true },
];

/** Экран проверки: все введённые данные целиком; нажал строку — вернулся к шагу. */
function MicroReview({
  f,
  foreigner,
  duplicateName,
  onEdit,
}: {
  f: Form;
  foreigner: boolean;
  duplicateName: string | null;
  onEdit: (id: MicroId) => void;
}) {
  const val = (id: FieldId): string | null => {
    switch (id) {
      case "photo": return f.photoFile ? "есть" : null;
      case "name": return f.name.trim() || null;
      case "phone": return f.phone || null;
      case "phone2": return f.phone2 || null;
      case "birth": return f.birth || null;
      case "source": return sourceLabel(f);
      case "doc": return f.isForeigner ? `Иностранный · ${f.passportRaw.trim()}` : "Паспорт РФ";
      case "passSerNum": return f.passSer || f.passNum ? `${f.passSer} ${f.passNum}`.trim() : null;
      case "issuer": return f.passIssuer.trim() || null;
      case "pdate": return f.passDate || null;
      case "pcode": return f.passCode || null;
      case "scans": {
        const n = [f.passportMainFile, f.passportRegFile].filter(Boolean).length;
        return n ? `${n} из 2` : null;
      }
      case "reg": return f.regAddr.trim() || null;
      case "live": return f.sameAddr ? "совпадает с регистрацией" : f.liveAddr.trim() || null;
      case "license": return f.licenseFile ? "есть" : null;
      case "other": return f.otherDocs.length ? `${f.otherDocs.length} шт.` : null;
    }
  };
  const all = REVIEW_FIELDS.filter(
    (x) => !foreigner || !["passSerNum", "pcode", "issuer", "pdate", "scans"].includes(x.id),
  );
  const shown = all.filter((x) => !x.optional || val(x.id) != null);
  const skipped = all.filter((x) => x.optional && val(x.id) == null);
  return (
    <div className="flex flex-col gap-3">
      {duplicateName && (
        <div className="rounded-2xl bg-red-soft px-4 py-3 text-[15px] font-semibold text-red-ink">
          Клиент с этим телефоном уже есть: «{duplicateName}». Не создавайте дубль — откройте его карточку.
        </div>
      )}
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border landscape:grid-cols-2 landscape:grid-flow-dense">
        {shown.map((x) => {
          const v = val(x.id);
          return (
            <button
              key={x.id}
              type="button"
              onClick={() => onEdit(FIELD_SCREEN[x.id])}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b border-border bg-surface px-4 py-2 text-left active:bg-surface-soft",
                x.long ? "landscape:col-span-2" : "landscape:border-r",
              )}
            >
              <span className="text-[13px] text-muted">{x.label}</span>
              <span className={cn("break-words text-[16px] font-semibold leading-snug", v ? "text-ink" : "text-red-ink")}>
                {v ?? "не заполнено"}
              </span>
            </button>
          );
        })}
      </div>
      {skipped.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] text-muted">Пропущено:</span>
          {skipped.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => onEdit(FIELD_SCREEN[x.id])}
              className="rounded-full bg-surface-soft px-3 py-1.5 text-[13.5px] font-semibold text-ink-2 active:bg-border"
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Фото с камеры устройства или из галереи — крупно, под палец. */
function MicroCapture({
  file,
  onChange,
  label,
  selfie = false,
  tablet,
  wide = false,
}: {
  file: UploadedFile | null;
  onChange: (v: UploadedFile | null) => void;
  label?: string;
  selfie?: boolean;
  tablet: boolean;
  wide?: boolean;
}) {
  // две плитки в ряд (разворот + прописка) — узко, всё компактнее
  const compact = !selfie && !wide;
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const take = (fl: File | undefined) => {
    if (!fl) return;
    onChange({
      name: fl.name,
      size: fl.size,
      thumbUrl: fl.type.startsWith("image/") ? URL.createObjectURL(fl) : undefined,
      file: fl,
    });
  };
  return (
    <div className="flex flex-col gap-2.5">
      {label && <div className={cn("text-[14px] font-bold text-ink", tablet && "text-[16px]")}>{label}</div>}
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden border-2 border-dashed border-border bg-surface-soft",
          // высота ограничена — вместе с кнопками шаг помещается на экран
          selfie
            ? "mx-auto aspect-square w-[min(52vw,220px)] rounded-full"
            : wide
              ? "mx-auto aspect-[16/10] max-h-[30vh] w-full rounded-3xl landscape:max-h-[22vh]"
              : "aspect-[4/3] max-h-[26vh] w-full rounded-3xl",
        )}
      >
        {file?.thumbUrl ? (
          <img src={file.thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : file ? (
          <span className="px-3 text-center text-[14px] font-semibold text-ink">{file.name}</span>
        ) : (
          <Camera size={selfie ? 52 : 38} strokeWidth={1.4} className="text-muted-2" />
        )}
        {file && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Убрать"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-white"
          >
            <X size={17} />
          </button>
        )}
      </div>
      {/* Две плитки рядом (паспорт) — подписи короче, кнопки друг под другом;
          одна плитка — кнопки рядом на планшете, столбиком на телефоне. */}
      <div
        className={cn(
          "grid gap-2",
          compact ? "grid-cols-1" : tablet ? "mx-auto w-full max-w-[520px] grid-cols-2" : "grid-cols-1",
        )}
      >
        <button
          type="button"
          onClick={() => cam.current?.click()}
          className={cn(
            "flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-ink px-3 font-bold text-white active:scale-[0.98]",
            compact ? "h-12 text-[15px]" : "h-14 text-[16px]",
          )}
        >
          <Camera size={19} /> {file ? "Переснять" : compact ? "Снять" : "Сфотографировать"}
        </button>
        <button
          type="button"
          onClick={() => gal.current?.click()}
          className={cn(
            "flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-surface-soft px-3 font-bold text-ink active:bg-border",
            compact ? "h-12 text-[15px]" : "h-14 text-[16px]",
          )}
        >
          <ImageIcon size={19} /> {compact ? "Галерея" : "Из галереи"}
        </button>
      </div>
      {/* capture — сразу камера телефона/планшета (фронтальная для клиента) */}
      <input ref={cam} type="file" accept="image/*" capture={selfie ? "user" : "environment"} className="hidden" onChange={(e) => take(e.target.files?.[0])} />
      <input ref={gal} type="file" accept={selfie ? "image/*" : "image/*,application/pdf"} className="hidden" onChange={(e) => take(e.target.files?.[0])} />
    </div>
  );
}

