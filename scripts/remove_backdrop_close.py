"""
Одноразовый скрипт: убирает закрытие модалок по клику в backdrop.
Заказчик попросил глобально (v0.3.1 правка): чтобы закрытие модалки
было только по Esc / X / кнопке действия — а не по случайному клику
вне неё (мешает выделять/копировать текст в полях).

Эвристика: ищем строку вида `onClick={requestClose}` или
`onClick={onClose}`, при условии:
  • предыдущая строка заканчивается на `)}` или содержит закрытие
    className-блока — типичный паттерн внешней backdrop-обёртки;
  • следующая строка — `>` (закрытие открывающего тега div);
  • в окне 10 строк выше есть `fixed inset-0` (опознавательный
    признак fullscreen-overlay).

Если все три условия выполняются — строка удаляется.
"""
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

FILES = """
apps/web/src/pages/dashboard/DashboardDrawer.tsx
apps/web/src/pages/dashboard/ParkPanel.tsx
apps/web/src/pages/rentals/SwapScooterDialog.tsx
apps/web/src/pages/clients/AddClientModal.tsx
apps/web/src/pages/service/Service.tsx
apps/web/src/pages/rentals/DocumentPreviewModal.tsx
apps/web/src/pages/clients/FilePreviewModal.tsx
apps/web/src/pages/rentals/RentalCardTabs.tsx
apps/web/src/pages/fleet/EquipmentCatalog.tsx
apps/web/src/pages/fleet/ModelsCatalog.tsx
apps/web/src/components/ImageCropDialog.tsx
apps/web/src/pages/rentals/RentalEditModal.tsx
apps/web/src/pages/rentals/DamageReportDialog.tsx
apps/web/src/pages/rentals/RentalActionDialog.tsx
apps/web/src/pages/dashboard/RevenueListModal.tsx
apps/web/src/pages/rentals/DamageReportPaymentDialog.tsx
apps/web/src/pages/rentals/ExtendRentalDialog.tsx
apps/web/src/pages/rentals/NewRentalModal.tsx
apps/web/src/pages/fleet/ScooterEditForm.tsx
apps/web/src/pages/fleet/AddScooterModal.tsx
apps/web/src/pages/dashboard/ActivityFeed.tsx
apps/web/src/pages/fleet/ScooterStatusModal.tsx
apps/web/src/pages/fleet/MaintenanceTab.tsx
apps/web/src/pages/rentals/ConfirmPaymentDialog.tsx
apps/web/src/pages/staff/StaffPasswordRevealModal.tsx
apps/web/src/pages/staff/StaffResetPasswordModal.tsx
apps/web/src/pages/staff/StaffEditModal.tsx
apps/web/src/pages/staff/StaffAddModal.tsx
apps/web/src/pages/dashboard/ProfileModal.tsx
apps/web/src/pages/clients/ClientQuickView.tsx
apps/web/src/app/UpdateToast.tsx
""".strip().splitlines()


def process(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    lines = text.split("\n")
    out = []
    i = 0
    removed = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"^(\s+)onClick=\{(requestClose|onClose)\}\s*$", line)
        if m:
            next_line = lines[i + 1] if i + 1 < len(lines) else ""
            stripped_next = next_line.strip()
            is_close_tag = stripped_next == ">" or stripped_next.startswith(">")
            window = "\n".join(lines[max(0, i - 10) : i])
            looks_like_backdrop = "fixed inset-0" in window and is_close_tag
            if looks_like_backdrop:
                removed += 1
                i += 1
                continue
        out.append(line)
        i += 1
    if removed > 0:
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(out))
    return removed


def main() -> None:
    total_files = 0
    total_lines = 0
    for rel in FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            print(f"  SKIP {rel} (not found)")
            continue
        n = process(path)
        if n > 0:
            total_files += 1
            total_lines += n
            print(f"  {rel}: removed {n}")
    print(f"\nDone. Files modified: {total_files}, lines removed: {total_lines}")


if __name__ == "__main__":
    main()
