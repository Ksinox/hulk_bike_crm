import type { ApiApplication } from "@/lib/api/clientApplications";

/**
 * Маппинг полей публичной заявки → начальное состояние Form в AddClientModal.
 * Source клиента в заявке нет — менеджер выберет сам перед сохранением.
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
};

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
  };
}
