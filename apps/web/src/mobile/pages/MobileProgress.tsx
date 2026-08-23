import { ProgressBoard } from "@/pages/progress/ProgressBoard";

/**
 * Раздел «Развитие» на телефоне. Переиспользует тот же ProgressBoard, что и
 * десктоп (адаптив внутри) — паритет версий гарантирован по построению.
 */
export function MobileProgress() {
  return (
    <div className="pb-6">
      <ProgressBoard />
    </div>
  );
}
