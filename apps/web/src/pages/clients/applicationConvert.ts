import {
  applicationFileUrl,
  type ApiApplication,
  type ApplicationFileKind,
} from "@/lib/api/clientApplications";
import type { ClientSource } from "@/lib/mock/clients";
import type { UploadedFile } from "./DocUpload";

/**
 * Маппинг полей публичной заявки → начальное состояние Form в AddClientModal.
 * Source с релиза 0.5+ клиент выбирает прямо в анкете (старые заявки могут
 * иметь source=null — тогда менеджер выберет сам).
 */

export type ApplicationFormInit = {
  name: string;
  phone: string;
  phone2: string;
  birth: string;
  isForeigner: boolean;
  passportRaw: string;
  passSer: string;
  passNum: string;
  passIssuer: string;
  passDate: string;
  passCode: string;
  regAddr: string;
  sameAddr: boolean;
  liveAddr: string;
  source: ClientSource | null;
  sourceCustom: string;
  /** F18: фото из заявки, заранее подставленные в слоты сканов формы.
   *  null — файла такого вида в заявке нет. Бэкенд /convert сам перенесёт
   *  эти файлы в client_documents (см. keepFiles), форма их не перезаливает. */
  photoFile: UploadedFile | null;
  passportMainFile: UploadedFile | null;
  passportRegFile: UploadedFile | null;
  licenseFile: UploadedFile | null;
};

/**
 * Строит UploadedFile-превью для слота формы из файла заявки.
 * thumbUrl указывает на стрим файла заявки (с cookie-сессией менеджера) —
 * DocUpload и FilePreviewModal отрисуют его как уже приложенное фото.
 * appFileKind помечает, что файл пришёл из заявки: при сохранении клиента
 * его не нужно загружать заново — бэкенд /convert скопирует его сам.
 */
function appFileToUploaded(
  app: ApiApplication,
  kind: ApplicationFileKind,
): UploadedFile | null {
  const file = app.files.find((f) => f.kind === kind);
  if (!file) return null;
  return {
    name: file.fileName,
    size: file.size,
    mimeType: file.mimeType,
    existing: true,
    appFileKind: kind,
    // view-вариант (≤2000px) — достаточно для превью/проверки оператором.
    thumbUrl: applicationFileUrl(app.id, kind, { variant: "view" }),
  };
}

function isoToDateRu(s: string | null | undefined): string {
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

export function applicationToFormInit(
  app: ApiApplication,
): ApplicationFormInit {
  return {
    name: app.name ?? "",
    phone: app.phone ?? "",
    phone2: app.extraPhone ?? "",
    birth: isoToDateRu(app.birthDate),
    isForeigner: !!app.isForeigner,
    passportRaw: app.passportRaw ?? "",
    passSer: app.passportSeries ?? "",
    passNum: app.passportNumber ?? "",
    passIssuer: app.passportIssuer ?? "",
    passDate: isoToDateRu(app.passportIssuedOn),
    passCode: app.passportDivisionCode ?? "",
    regAddr: app.passportRegistration ?? "",
    sameAddr: app.sameAddress,
    liveAddr: app.liveAddress ?? "",
    source: app.source,
    sourceCustom: app.sourceCustom ?? "",
    photoFile: appFileToUploaded(app, "selfie"),
    passportMainFile: appFileToUploaded(app, "passport_main"),
    passportRegFile: appFileToUploaded(app, "passport_reg"),
    licenseFile: appFileToUploaded(app, "license"),
  };
}
