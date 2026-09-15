import { useEffect, useMemo, useState } from "react";

/**
 * Раскладка «в экран» (07.09): по размеру контейнера и набору плиток
 * подбираем число колонок, при котором клетка выходит удобной формы, и
 * считаем, сколько рядов займёт доска. Ряды потом делят высоту поровну —
 * поэтому доска любой длины укладывается без прокрутки. Одна и та же
 * логика у экрана-стены и у конструктора: что настроил, то и увидишь.
 */

export type Span = { w: number; h: number };

export type FitOpts = { gap?: number; minCellW?: number; minCellH?: number };

/** Подбор колонок и рядов под бокс заданного размера (чистая функция). */
export function fitLayout(box: { w: number; h: number }, spans: Span[], opts: FitOpts = {}) {
  const gap = opts.gap ?? 12;
  const minCellW = opts.minCellW ?? 150;
  const minCellH = opts.minCellH ?? 120;
  let best = { cols: 4, rows: 1, score: Number.POSITIVE_INFINITY };
  const minCols = box.w < 760 ? 2 : 3;
  const maxCols = box.w < 760 ? 3 : 10;
  for (let c = minCols; c <= maxCols; c++) {
    const r = packedRows(spans, c);
    const cellW = (box.w - gap * (c - 1)) / c;
    const cellH = (box.h - gap * (r - 1)) / r;
    if (cellW <= 0 || cellH <= 0) continue;
    // Целевая пропорция клетки — чуть шире квадрата; штрафуем мелкие клетки
    // и пустые места: экран должен быть заполнен.
    const aspect = Math.abs(cellW / cellH - 1.45);
    const small = cellH < minCellH ? (minCellH - cellH) / 40 : 0;
    const narrow = cellW < minCellW ? (minCellW - cellW) / 60 : 0;
    const used = spans.reduce((a, s) => a + Math.min(s.w, c) * s.h, 0);
    const waste = Math.max(0, 1 - used / (c * r)) * 1.6;
    const score = aspect + small + narrow + waste;
    if (score < best.score) best = { cols: c, rows: r, score };
  }
  return { cols: best.cols, rows: best.rows };
}

export function useFitLayout(
  ref: React.RefObject<HTMLElement | null>,
  spans: Span[],
  opts: FitOpts & { box?: { w: number; h: number } } = {},
) {
  const [measured, setMeasured] = useState({ w: 1200, h: 700 });

  useEffect(() => {
    const el = ref.current;
    if (!el || opts.box) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry?.contentRect;
      if (r && r.width > 0 && r.height > 0)
        setMeasured((b) =>
          Math.abs(b.w - r.width) < 1 && Math.abs(b.h - r.height) < 1 ? b : { w: r.width, h: r.height },
        );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, opts.box]);

  const box = opts.box ?? measured;
  const key = spans.map((s) => `${s.w}x${s.h}`).join(",");
  return useMemo(
    () => ({ ...fitLayout(box, spans, opts), box }),
    // spans пересобираются каждый рендер — сравниваем по отпечатку
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [box.w, box.h, key, opts.gap, opts.minCellW, opts.minCellH],
  );
}

/**
 * Сколько рядов займёт доска при плотной укладке (grid-auto-flow: row dense):
 * каждую плитку ставим в первую подходящую дырку с самого начала.
 */
export function packedRows(spans: Span[], cols: number): number {
  const occupied = new Set<string>();
  const busy = (r: number, c: number) => occupied.has(`${r}:${c}`);
  let maxRow = 0;
  for (const s of spans) {
    const w = Math.min(s.w, cols);
    const h = s.h;
    let r = 0;
    let c = 0;
    for (;;) {
      if (c + w > cols) {
        r += 1;
        c = 0;
        continue;
      }
      let fits = true;
      for (let dr = 0; dr < h && fits; dr++)
        for (let dc = 0; dc < w; dc++)
          if (busy(r + dr, c + dc)) {
            fits = false;
            break;
          }
      if (fits) break;
      c += 1;
    }
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++) occupied.add(`${r + dr}:${c + dc}`);
    maxRow = Math.max(maxRow, r + h);
  }
  return Math.max(1, maxRow);
}
