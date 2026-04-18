export type DashboardView = "park" | "classic";

const KEY = "hb_view";

export function loadView(): DashboardView {
  try {
    const v = localStorage.getItem(KEY);
    return v === "classic" ? "classic" : "park";
  } catch {
    return "park";
  }
}

export function saveView(v: DashboardView): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* noop */
  }
}
