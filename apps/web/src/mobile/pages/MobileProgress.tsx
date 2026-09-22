import { ProgressBoard } from "@/pages/progress/ProgressBoard";
import { BottomTabs } from "../BottomTabs";
import { DevTabs } from "@/pages/progress/DevTabs";
import { useDevTab } from "@/app/sectionTabs";
import { MobileWhatsNew } from "./MobileWhatsNew";

/**
 * Раздел «Развитие» на телефоне — те же две вкладки, что на компьютере:
 * «Текущие работы» (тот же ProgressBoard) и «Что уже сделано».
 */
export function MobileProgress() {
  const [tab, setTab] = useDevTab();
  return (
    <div className="flex flex-col gap-4 pb-6">
      <BottomTabs>
        <DevTabs tab={tab} onTab={setTab} touch />
      </BottomTabs>
      {tab === "now" ? <ProgressBoard /> : <MobileWhatsNew />}
    </div>
  );
}
