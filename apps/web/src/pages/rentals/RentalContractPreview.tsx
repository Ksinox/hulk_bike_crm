import { DocumentPreviewModal } from "./DocumentPreviewModal";

/**
 * Превью «Договор + Акт» по аренде (HTML из API + печать + скачивание .doc).
 *
 * Единая точка для авто-открытия договора СРАЗУ после создания аренды
 * (NewRentalModal, любой путь входа) и после продления (стр. Аренды).
 * Раньше это жило локально в Rentals.AutoContractPreview и срабатывало
 * только при создании со страницы Аренды — из Topbar / заявки / карточки
 * скутера / мобилки договор не всплывал (регресс «единого flow»).
 */
export function RentalContractPreview({
  rentalId,
  onClose,
}: {
  rentalId: number;
  onClose: () => void;
}) {
  const API_BASE =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  const htmlUrl = `${API_BASE}/api/rentals/${rentalId}/document/contract_full`;
  const docxUrl = `${API_BASE}/api/rentals/${rentalId}/document/contract_full?format=docx`;
  const id = String(rentalId).padStart(4, "0");
  return (
    <DocumentPreviewModal
      title={`Договор + Акт по аренде #${id}`}
      htmlUrl={htmlUrl}
      docxUrl={docxUrl}
      docxFilename={`Договор_и_акт_${id}.doc`}
      onClose={onClose}
    />
  );
}
