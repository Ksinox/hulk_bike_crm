import { useMemo, useState } from "react";
import {
  Plus,
  Star,
  Tag,
  Trash2,
  Pencil,
  X,
  Check,
  Loader2,
  Image as ImageIcon,
  Wallet,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useApiScooterModels,
  useCreateScooterModel,
  useDeleteScooterModel,
  useDeleteScooterModelAvatar,
  usePatchScooterModel,
  useUploadScooterModelAvatar,
  type ApiScooterModel,
  type CreateModelInput,
} from "@/lib/api/scooter-models";
import { fileUrl } from "@/lib/files";
import { AvatarUpload } from "./AvatarUpload";
import { confirmDialog } from "@/lib/toast";

export function ModelsCatalog() {
  const { data: items = [], isLoading } = useApiScooterModels();
  const [editing, setEditing] = useState<ApiScooterModel | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.quickPick !== b.quickPick) return a.quickPick ? -1 : 1;
        return a.name.localeCompare(b.name, "ru");
      }),
    [items],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-muted">
          {isLoading
            ? "Загрузка…"
            : `${items.length} ${plural(items.length, ["модель", "модели", "моделей"])} · ${items.filter((x) => x.quickPick).length} в быстром выборе`}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-600"
        >
          <Plus size={14} /> Добавить модель
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((m) => (
          <ModelCard key={m.id} model={m} onEdit={() => setEditing(m)} />
        ))}
        {sorted.length === 0 && !isLoading && (
          <div className="col-span-full rounded-2xl bg-surface p-8 text-center text-muted shadow-card-sm">
            <Tag size={24} className="mx-auto mb-2" />
            Пока ни одной модели. Добавьте первую.
          </div>
        )}
      </div>

      {addOpen && <ModelFormModal onClose={() => setAddOpen(false)} />}
      {editing && (
        <ModelFormModal
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ModelCard({
  model,
  onEdit,
}: {
  model: ApiScooterModel;
  onEdit: () => void;
}) {
  const del = useDeleteScooterModel();
  const onDelete = async () => {
    const ok = await confirmDialog({
      title: `Удалить модель «${model.name}»?`,
      message:
        "Модель пропадёт из каталога. Скутеры, которые на неё ссылаются, потеряют привязку к тарифам.",
      confirmText: "Удалить модель",
      danger: true,
    });
    if (ok) del.mutate(model.id);
  };
  const avatarSrc = fileUrl(model.avatarKey);
  const isInactive = model.active === false;
  return (
    <div
      className={cn(
        "group relative flex w-full flex-col overflow-visible rounded-2xl border border-border bg-surface shadow-card-sm transition-transform hover:-translate-y-1",
        isInactive && "opacity-70",
      )}
    >
      {/* Светлый фото-блок: белый фон, без glow. Берём с лендинга только
          форму карточки и крупность аватарки — фотография крупная, на
          прозрачном фоне, слегка приподнята так что часть скутера
          визуально торчит над карточкой. */}
      <div className="relative aspect-[4/3] overflow-visible rounded-t-2xl bg-white">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={model.name}
            className="absolute inset-0 h-full w-full object-contain p-2 drop-shadow-[0_12px_18px_rgba(15,23,42,0.18)] transition-transform duration-200 group-hover:scale-110"
            style={{ transform: "translateY(-6%) scale(1.18)" }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-2">
            <Tag size={48} strokeWidth={1.5} />
          </div>
        )}

        {/* Top-left: бейдж quickPick */}
        {model.quickPick && model.active !== false && (
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-400/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow">
            <Star size={10} className="fill-amber-950" /> быстрый
          </div>
        )}
        {/* Top-right: бейдж «не активна» */}
        {isInactive && (
          <div className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted shadow">
            не активна
          </div>
        )}

        {/* Кнопки управления — поверх фото, видны при hover */}
        <div className="absolute right-2 bottom-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            title="Изменить"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-ink shadow hover:bg-blue-50 hover:text-blue-700"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Удалить"
            disabled={del.isPending}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-muted shadow hover:bg-red-soft hover:text-red-ink"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Body карточки — как на лендинге */}
      <div className="relative z-10 flex flex-col gap-2 rounded-b-2xl bg-surface p-4">
        <div
          className={cn(
            "truncate text-[16px] font-bold",
            isInactive ? "text-muted-2" : "text-ink",
          )}
        >
          {model.name}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-2">
          <span>
            1–2 дн: <b className="text-ink">{model.dayRate}₽</b>
          </span>
          <span>
            3–6 дн: <b className="text-ink">{model.shortRate}₽</b>
          </span>
          <span>
            7–29 дн: <b className="text-ink">{model.weekRate}₽</b>
          </span>
          <span>
            30+ дн: <b className="text-ink">{model.monthRate}₽</b>
          </span>
        </div>
        {model.note && (
          <div className="text-[11px] text-muted line-clamp-2">{model.note}</div>
        )}
      </div>
    </div>
  );
}

function ModelFormModal({
  initial,
  onClose,
}: {
  initial?: ApiScooterModel;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const createMut = useCreateScooterModel();
  const patchMut = usePatchScooterModel();

  const [name, setName] = useState(initial?.name ?? "");
  const [dayRate, setDayRate] = useState(initial?.dayRate ?? 1300);
  const [shortRate, setShortRate] = useState(initial?.shortRate ?? 700);
  const [weekRate, setWeekRate] = useState(initial?.weekRate ?? 500);
  const [monthRate, setMonthRate] = useState(initial?.monthRate ?? 400);
  const [quickPick, setQuickPick] = useState(initial?.quickPick ?? false);
  // active=true по умолчанию для новой модели. Если редактируем —
  // берём текущее значение. false означает «модель в систему добавлена,
  // но временно не используется» — её скрывают везде в CRM и на лендинге.
  const [active, setActive] = useState(initial?.active ?? true);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState<string>(
    initial?.maxSpeedKmh != null ? String(initial.maxSpeedKmh) : "",
  );
  const [tankVolumeL, setTankVolumeL] = useState<string>(initial?.tankVolumeL ?? "");
  const [fuelLPer100Km, setFuelLPer100Km] = useState<string>(
    initial?.fuelLPer100Km ?? "",
  );
  const [coolingType, setCoolingType] = useState<"" | "air" | "liquid">(
    initial?.coolingType ?? "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [err, setErr] = useState<string | null>(null);

  const pending = createMut.isPending || patchMut.isPending;
  const canSave = name.trim().length >= 1;

  const submit = async () => {
    setErr(null);
    const speedNum = maxSpeedKmh.trim() ? Number(maxSpeedKmh) : null;
    const tankStr = tankVolumeL.trim().replace(",", ".");
    const tankNum = tankStr ? Number(tankStr) : null;
    const fuelStr = fuelLPer100Km.trim().replace(",", ".");
    const fuelNum = fuelStr ? Number(fuelStr) : null;
    const body: CreateModelInput = {
      name: name.trim(),
      dayRate,
      shortRate,
      weekRate,
      monthRate,
      quickPick,
      active,
      maxSpeedKmh:
        speedNum != null && Number.isFinite(speedNum) && speedNum >= 0
          ? Math.round(speedNum)
          : null,
      tankVolumeL:
        tankNum != null && Number.isFinite(tankNum) && tankNum >= 0
          ? tankStr
          : null,
      fuelLPer100Km:
        fuelNum != null && Number.isFinite(fuelNum) && fuelNum >= 0
          ? fuelStr
          : null,
      coolingType: coolingType || null,
      note: note.trim() || null,
    };
    try {
      if (isEdit) {
        await patchMut.mutateAsync({ id: initial.id, patch: body });
      } else {
        await createMut.mutateAsync(body);
      }
      onClose();
    } catch (e) {
      // Показываем реальную ошибку сервера (через ApiError.message — туда
      // попадает body.message / body.error). Так понятно, в чём беда:
      // имя занято / валидация / доступ запрещён.
      const fallback =
        isEdit
          ? "Не удалось сохранить изменения."
          : "Не удалось создать модель. Возможно имя уже занято.";
      setErr((e as Error)?.message || fallback);
    }
  };

  return (
    // v0.4.40: переверстка — единый стиль секций с заголовками, более
    // широкая модалка для 4-х тарифов в строку, sticky-footer с
    // основной кнопкой как primary blue, не серый ink. Лейблы в lower-
    // case с цветным акцентом, без UPPERCASE-крика. Чекбоксы переделаны
    // в карточки-toggle, где хинт читается без потери приоритета.
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/55 p-4 backdrop-blur-sm sm:p-6">
      <div
        className="mt-8 flex w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg sm:mt-16"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <header className="flex items-center justify-between gap-3 border-b border-border bg-white px-6 py-4">
          <div>
            <div className="font-display text-[18px] font-extrabold leading-tight text-ink">
              {isEdit ? "Изменить модель" : "Новая модель"}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-2">
              {isEdit
                ? "Тарифы и характеристики применяются к будущим арендам."
                : "Создайте модель, потом добавите аватарку и скутера в парк."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </header>

        {/* Тело */}
        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          {isEdit && <AvatarEditor model={initial} />}
          {!isEdit && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-blue-100 bg-blue-50/60 px-3.5 py-2.5 text-[12px] text-blue-900">
              <ImageIcon size={14} className="mt-0.5 shrink-0 text-blue-500" />
              <span>
                Аватарку загрузите после создания — откройте модель снова
                кнопкой «Изменить».
              </span>
            </div>
          )}

          <Field label="Название модели" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="Yamaha Jog"
              className="h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </Field>

          {/* Тарифы — единая карточка, 4 поля в ряд */}
          <Section
            icon={<Wallet size={13} />}
            title="Тарифы"
            hint="Цена за сутки в зависимости от срока аренды"
          >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <RateField label="1–2 дня" value={dayRate} onChange={setDayRate} />
              <RateField label="3–6 дней" value={shortRate} onChange={setShortRate} />
              <RateField label="7–29 дней" value={weekRate} onChange={setWeekRate} />
              <RateField label="30+ дней" value={monthRate} onChange={setMonthRate} />
            </div>
          </Section>

          {/* Тех.характеристики */}
          <Section
            icon={<Settings2 size={13} />}
            title="Технические характеристики"
            hint="Показываются на лендинге для клиентов"
          >
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Макс. скорость, км/ч">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={400}
                  value={maxSpeedKmh}
                  onChange={(e) => setMaxSpeedKmh(e.target.value)}
                  placeholder="60"
                  className="h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-[14px] outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="Объём бака, л">
                <input
                  type="text"
                  inputMode="decimal"
                  value={tankVolumeL}
                  onChange={(e) => setTankVolumeL(e.target.value)}
                  placeholder="5.5"
                  className="h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-[14px] outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="Расход, л/100 км">
                <input
                  type="text"
                  inputMode="decimal"
                  value={fuelLPer100Km}
                  onChange={(e) => setFuelLPer100Km(e.target.value)}
                  placeholder="1.5"
                  className="h-11 w-full rounded-[10px] border border-border bg-white px-3.5 text-[14px] outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </Field>
              <Field label="Охлаждение">
                <select
                  value={coolingType}
                  onChange={(e) =>
                    setCoolingType(e.target.value as "" | "air" | "liquid")
                  }
                  className="h-11 w-full rounded-[10px] border border-border bg-white px-3 text-[14px] outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">— не указано —</option>
                  <option value="air">Воздушное</option>
                  <option value="liquid">Жидкостное</option>
                </select>
              </Field>
            </div>
          </Section>

          {/* Видимость */}
          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleCard
              checked={active}
              onChange={setActive}
              title="Активна"
              hint="Показывать на лендинге и в выборе скутера"
            />
            <ToggleCard
              checked={quickPick}
              onChange={setQuickPick}
              disabled={!active}
              title="Быстрый выбор"
              hint="Отображать первой в форме новой аренды"
            />
          </div>

          <Field label="Примечание (необязательно)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Например: жёлтые рамы, заводской объём масла 0.9 л."
              className="w-full resize-none rounded-[10px] border border-border bg-white px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </Field>

          {err && (
            <div className="flex items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              <X size={14} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>

        {/* Sticky-футер */}
        <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface-soft/50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] font-semibold text-muted hover:bg-surface-soft hover:text-ink"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave || pending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-bold transition-colors",
              !canSave || pending
                ? "cursor-not-allowed bg-blue-200 text-white/80"
                : "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
            )}
          >
            {pending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {isEdit ? "Сохранить" : "Создать модель"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* v0.4.40: визуальные хелперы для модалки модели */

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-blue-600">
          {icon}
        </span>
        <h3 className="text-[13px] font-bold text-ink">{title}</h3>
        {hint && <span className="text-[11px] text-muted-2">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function RateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1 text-[11px] font-semibold text-muted">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-11 w-full rounded-[10px] border border-border bg-white pl-3.5 pr-7 text-[14px] tabular-nums outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted-2">
          ₽
        </span>
      </div>
    </label>
  );
}

function ToggleCard({
  checked,
  onChange,
  disabled,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-surface-soft/50 opacity-60"
          : checked
            ? "border-blue-300 bg-blue-50/40 hover:border-blue-400"
            : "border-border bg-white hover:border-blue-300",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 accent-blue-600 disabled:opacity-40"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-muted-2">
          {hint}
        </div>
      </div>
    </label>
  );
}

function AvatarEditor({ model }: { model: ApiScooterModel }) {
  const uploadMut = useUploadScooterModelAvatar();
  const deleteMut = useDeleteScooterModelAvatar();
  // Читаем актуальное состояние из кеша React Query, а не из props — иначе
  // после upload preview исчезнет, но avatarKey в props будет stale → url=null →
  // кнопка «Удалить» пропадёт.
  const { data: models = [] } = useApiScooterModels();
  const live = models.find((m) => m.id === model.id) ?? model;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-2">
        Аватарка
      </div>
      <AvatarUpload
        avatarKey={live.avatarKey}
        avatarThumbKey={live.avatarThumbKey}
        uploading={uploadMut.isPending}
        removing={deleteMut.isPending}
        onUpload={({ full, thumb }) =>
          uploadMut.mutateAsync({ id: model.id, file: full, thumb })
        }
        onRemove={() => deleteMut.mutateAsync(model.id)}
        cropTitle={`Кропнуть аватарку «${model.name}»`}
      />
      <div className="mt-1 text-[11px] text-muted-2">
        Эта картинка показывается в карточке скутера и в блоке «Скутер» при аренде.
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col">
      <span className="mb-1.5 text-[12px] font-semibold text-muted">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}


function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
