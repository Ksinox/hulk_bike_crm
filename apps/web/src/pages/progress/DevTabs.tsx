import { useEffect, useState } from "react";
import { Hammer, Sparkles } from "lucide-react";
import { SectionTabs } from "@/components/SectionTabs";
import { type DevTab } from "@/app/sectionTabs";
import { useUnreadChangelog } from "@/pages/whats-new/useUnreadChangelog";
import { countFreshProgress } from "./useFreshProgress";

/**
 * Вкладки раздела «Развитие» (18.09): «Текущие работы» — доска того, что
 * делается сейчас; «Что уже сделано» — бывший раздел «Что нового», выпуски
 * «было → стало». На вкладке — сколько нового там с прошлого захода.
 */
export function DevTabs({ tab, onTab, touch = false }: { tab: DevTab; onTab: (t: DevTab) => void; touch?: boolean }) {
  const { unreadCount } = useUnreadChangelog();
  const [fresh, setFresh] = useState(countFreshProgress);
  useEffect(() => setFresh(countFreshProgress()), [tab]);
  return (
    <SectionTabs<DevTab>
      attr="dev-tab"
      touch={touch}
      value={tab}
      onChange={(t) => {
        onTab(t);
        window.scrollTo({ top: 0 });
      }}
      tabs={[
        { id: "now", label: "Текущие работы", icon: Hammer, badge: fresh },
        { id: "done", label: "Что уже сделано", icon: Sparkles, badge: unreadCount },
      ]}
    />
  );
}
