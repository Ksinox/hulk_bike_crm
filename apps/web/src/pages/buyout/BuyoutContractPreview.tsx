import { DocumentPreviewModal } from "@/pages/rentals/DocumentPreviewModal";
import { buyoutContractUrl } from "@/lib/api/buyout";

/**
 * Договор выкупа в окне CRM (заказчик 06.09, п.12): как у аренд/электро —
 * предпросмотр, печать и Word, без отдельной вкладки браузера.
 */
export function BuyoutContractPreview({
  dealId,
  onClose,
}: {
  dealId: number;
  onClose: () => void;
}) {
  const num = String(dealId).padStart(4, "0");
  return (
    <DocumentPreviewModal
      title={`Договор аренды с правом выкупа № ${num}`}
      htmlUrl={buyoutContractUrl(dealId, "html")}
      docxUrl={buyoutContractUrl(dealId, "docx")}
      docxFilename={`Договор_выкупа_${num}.doc`}
      onClose={onClose}
    />
  );
}
