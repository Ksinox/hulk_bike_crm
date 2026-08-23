import { Topbar } from "@/pages/dashboard/Topbar";
import { ProgressBoard } from "./ProgressBoard";

/**
 * Раздел «Развитие» (десктоп) — презентационная страница плана работ.
 * Содержимое общее с мобильной версией (ProgressBoard), здесь только
 * страничная обёртка: шапка приложения + центрированная колонка.
 */
export function Progress() {
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <div className="mx-auto w-full max-w-[880px] pb-12">
        <ProgressBoard />
      </div>
    </main>
  );
}
