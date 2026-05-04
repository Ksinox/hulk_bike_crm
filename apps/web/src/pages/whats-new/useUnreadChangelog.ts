import { useEffect, useMemo, useState } from "react";
import { changelog, type ChangelogEntry } from "@/data/changelog";

const KEY = "hulk-changelog-last-seen";
const LOCAL_EVENT = "hulk:changelog-seen";

function readLastSeen(): string {
  try {
    return localStorage.getItem(KEY) ?? "1970-01-01";
  } catch {
    return "1970-01-01";
  }
}

export function useUnreadChangelog(): {
  unread: ChangelogEntry[];
  unreadCount: number;
  lastSeenAt: string;
} {
  const [lastSeenAt, setLastSeenAt] = useState<string>(readLastSeen);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLastSeenAt(e.newValue ?? "1970-01-01");
    };
    const onLocal = () => setLastSeenAt(readLastSeen());
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCAL_EVENT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCAL_EVENT, onLocal);
    };
  }, []);

  const unread = useMemo(
    () => changelog.filter((e) => e.date > lastSeenAt),
    [lastSeenAt],
  );

  return { unread, unreadCount: unread.length, lastSeenAt };
}

export function markChangelogSeen(): void {
  const today = new Date().toISOString().slice(0, 10);
  const newest = changelog[0]?.date ?? today;
  const value = newest > today ? newest : today;
  try {
    localStorage.setItem(KEY, value);
  } catch {}
  window.dispatchEvent(new Event(LOCAL_EVENT));
}
