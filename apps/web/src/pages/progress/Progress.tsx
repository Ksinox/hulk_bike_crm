import { Topbar } from "@/pages/dashboard/Topbar";
import { useDevTab } from "@/app/sectionTabs";
import { WhatsNewContent } from "@/pages/whats-new/WhatsNew";
import { ProgressBoard } from "./ProgressBoard";
import { DevTabs } from "./DevTabs";

/**
 * Раздел «Развитие» (десктоп). С 18.09 — две вкладки: «Текущие работы»
 * (доска плана, общая с мобильной версией — ProgressBoard) и «Что уже
 * сделано» (бывший отдельный раздел «Что нового»).
 */
export function Progress() {
  const [tab, setTab] = useDevTab();
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />
      <DevTabs tab={tab} onTab={setTab} />
      {tab === "now" ? (
        <div className="mx-auto w-full max-w-[880px] pb-12">
          <ProgressBoard />
        </div>
      ) : (
        <WhatsNewContent />
      )}
    </main>
  );
}
