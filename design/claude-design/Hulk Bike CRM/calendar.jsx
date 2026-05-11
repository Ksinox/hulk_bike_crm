/* Calendar with drag-to-extend.
   Renders a month grid. Selected range = [startDate, endDate].
   originalEnd is the original return date (immovable line).
   When the right handle is dragged past originalEnd, the extension preview
   appears (different color). On drop, onExtend(newEnd) is called.

   Today's date and overdue days are highlighted in red.
   Clicking an overdue day opens a small action popover via onOverdueClick(date).
*/

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const RU_DOW = ['П','В','С','Ч','П','С','В'];

function Calendar({
  startDate, endDate, originalEnd, today,
  overdueDays = 0,
  onPreviewExtend,  // (days|null) called during drag to show pricing
  onCommitExtend,   // (days) called on drop if days > 0
  onOverdueClick,   // (date) — called when user clicks a red overdue day
}) {
  const [viewMonth, setViewMonth] = React.useState({ y: startDate.y, m: startDate.m });
  const [dragEnd, setDragEnd] = React.useState(null); // {y,m,d} while dragging
  const [hoverCell, setHoverCell] = React.useState(null);
  const gridRef = React.useRef(null);

  const effectiveEnd = dragEnd ?? endDate;

  // Build grid: 6 weeks, starting Monday
  const firstOfMonth = new Date(viewMonth.y, viewMonth.m, 1);
  const dowMon = (firstOfMonth.getDay() + 6) % 7; // mon=0
  const gridStart = new Date(viewMonth.y, viewMonth.m, 1 - dowMon);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(gridStart); dt.setDate(gridStart.getDate() + i);
    cells.push(fromDate(dt));
  }

  function cellClass(d) {
    const inSelectedRange = toDate(d) >= toDate(startDate) && toDate(d) <= toDate(effectiveEnd);
    const inOverdue = overdueDays > 0
      ? (toDate(d) > toDate(originalEnd) && toDate(d) <= toDate(today))
      : false;
    // Extension days are strictly AFTER overdue (when overdue) or after originalEnd (when active)
    const extensionFrom = overdueDays > 0 ? today : originalEnd;
    const inExtension = toDate(d) > toDate(extensionFrom) && toDate(d) <= toDate(effectiveEnd);
    const isStart = isSame(d, startDate);
    const isEnd = isSame(d, effectiveEnd);
    const isOriginalEnd = isSame(d, originalEnd);
    const isToday = isSame(d, today);
    const inMonth = d.m === viewMonth.m;
    return { inSelectedRange, inExtension, inOverdue, isStart, isEnd, isOriginalEnd, isToday, inMonth };
  }

  // Drag logic — mouse on end handle, then mousemove finds nearest cell
  const dragging = React.useRef(false);
  function startDrag(e) {
    e.preventDefault();
    dragging.current = true;
    document.body.classList.add('no-select');
  }
  function onMouseMoveGrid(e) {
    if (!dragging.current) return;
    const target = e.target.closest('[data-date]');
    if (!target) return;
    const [y, m, d] = target.dataset.date.split('-').map(Number);
    const candidate = { y, m, d };
    // forbid dragging end before start
    if (toDate(candidate) < toDate(startDate)) return;
    setDragEnd(candidate);
    const days = diffDays(originalEnd, candidate);
    onPreviewExtend?.(days > 0 ? days : null);
  }
  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.classList.remove('no-select');
    if (dragEnd) {
      const days = diffDays(originalEnd, dragEnd);
      if (days > 0) onCommitExtend?.(days);
      else onPreviewExtend?.(null);
      setDragEnd(null);
    }
  }
  React.useEffect(() => {
    window.addEventListener('mouseup', endDrag);
    return () => window.removeEventListener('mouseup', endDrag);
  });

  function prevMonth() { const dt = new Date(viewMonth.y, viewMonth.m - 1, 1); setViewMonth({y: dt.getFullYear(), m: dt.getMonth()}); }
  function nextMonth() { const dt = new Date(viewMonth.y, viewMonth.m + 1, 1); setViewMonth({y: dt.getFullYear(), m: dt.getMonth()}); }

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-white p-3 shadow-card-sm">
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={prevMonth} className="h-7 w-7 rounded-full hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--muted)]">
          <I.ChevronL size={14} />
        </button>
        <div className="font-display text-[14px] font-extrabold text-[var(--ink)] tracking-wide">
          {RU_MONTHS[viewMonth.m]} {viewMonth.y}
        </div>
        <button onClick={nextMonth} className="h-7 w-7 rounded-full hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--muted)]">
          <I.ChevronR size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 mb-1">
        {RU_DOW.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-[var(--muted-2)] uppercase">{d}</div>
        ))}
      </div>
      <div ref={gridRef} className="grid grid-cols-7 gap-y-0.5"
           onMouseMove={onMouseMoveGrid}>
        {cells.map((d, i) => {
          const s = cellClass(d);
          const key = `${d.y}-${d.m}-${d.d}`;
          let bg = '', text = 'text-[var(--ink-2)]', extra = '';
          if (!s.inMonth) text = 'text-[var(--muted-2)] opacity-50';
          if (s.inSelectedRange && !s.isStart && !s.isEnd) {
            bg = 'bg-[var(--blue-50)]';
            text = 'text-[var(--blue-700)]';
          }
          if (s.inOverdue) { bg = 'bg-[var(--red-soft)]'; text = 'text-[var(--red-ink)] font-bold cursor-pointer'; }
          if (s.inExtension) { bg = 'bg-[var(--green-soft)]'; text = 'text-[var(--green-ink)] font-bold'; }
          if (s.isStart) { bg = 'bg-[var(--ink)]'; text = 'text-white font-bold'; }
          if (s.isEnd && !s.isToday) { bg = 'bg-[var(--ink)]'; text = 'text-white font-bold'; }
          if (s.isOriginalEnd && !s.isEnd) {
            // Original planned return — distinct outlined marker, sits on top of overdue tint
            extra = 'ring-2 ring-[var(--ink)] ring-inset';
            text = 'text-[var(--ink)] font-extrabold';
          }
          if (s.isToday) {
            // Solid filled marker — today always wins. When end-of-rental coincides
            // with today (overdue), today owns the drag handle.
            bg = 'bg-[var(--blue-600)]';
            text = 'text-white font-extrabold';
            extra = 'ring-2 ring-[var(--blue-600)] ring-offset-2 ring-offset-white shadow-[0_4px_12px_rgba(37,99,235,0.35)]';
          }

          const isEndHandle = s.isEnd;
          const onClick = () => {
            if (s.inOverdue) onOverdueClick?.(d);
          };

          return (
            <div key={key} data-date={key}
                 onMouseEnter={() => setHoverCell(d)}
                 onMouseLeave={() => setHoverCell(null)}
                 onClick={onClick}
                 className="relative h-9 flex items-center justify-center">
              <div className={`relative h-9 w-9 rounded-full flex items-center justify-center text-[12.5px] tnum ${bg} ${text} ${extra}`}>
                {d.d}
                {s.isOriginalEnd && !s.isEnd && (
                  <span className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 text-[8.5px] uppercase tracking-wider font-extrabold text-[var(--ink)] whitespace-nowrap" title="оригинальный возврат">план</span>
                )}
                {s.isToday && (
                  <span className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 text-[8.5px] uppercase tracking-wider font-extrabold text-[var(--blue-700)] whitespace-nowrap">сегодня</span>
                )}
                {isEndHandle && (
                  <button
                    onMouseDown={startDrag}
                    title="Тяните вправо чтобы продлить"
                    className="absolute -right-1.5 top-1/2 -translate-y-1/2 h-9 w-3 rounded-r-full bg-[var(--blue-600)] cursor-extend flex items-center justify-center text-white hover:bg-[var(--blue-700)] active:scale-110 transition-transform">
                    <I.Grip size={10} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 px-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[var(--muted)]">
        <Legend swatch="bg-[var(--blue-50)]" label="текущий период" />
        <Legend swatch="bg-[var(--red-soft)]" label="просрочка" />
        <Legend swatch="bg-[var(--green-soft)]" label="продление" />
        <div className="ml-auto flex items-center gap-1 text-[var(--blue-600)] font-semibold">
          <I.Drag size={11} /> тяните за ручку
        </div>
      </div>
    </div>
  );
}

function Legend({ swatch, label }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${swatch}`}></span>
      <span>{label}</span>
    </div>
  );
}

/* CompactExtendCalendar — month-grid view styled like the main card calendar,
   compact enough to fit above the extension drawer. Read-only — driven by
   extendDays from the drawer's controls. */
function CompactExtendCalendar({ rental, today, extendDays, newEnd }) {
  const isOverdue = rental.status === 'overdue';
  const focusDate = extendDays > 0 ? newEnd : rental.endDate;
  const [viewMonth, setViewMonth] = React.useState({ y: focusDate.y, m: focusDate.m });

  React.useEffect(() => {
    setViewMonth({ y: focusDate.y, m: focusDate.m });
  }, [focusDate.y, focusDate.m]);

  const firstOfMonth = new Date(viewMonth.y, viewMonth.m, 1);
  const dowMon = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(viewMonth.y, viewMonth.m, 1 - dowMon);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(gridStart); dt.setDate(gridStart.getDate() + i);
    cells.push(fromDate(dt));
  }

  function prevMonth() { const dt = new Date(viewMonth.y, viewMonth.m - 1, 1); setViewMonth({y: dt.getFullYear(), m: dt.getMonth()}); }
  function nextMonth() { const dt = new Date(viewMonth.y, viewMonth.m + 1, 1); setViewMonth({y: dt.getFullYear(), m: dt.getMonth()}); }

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-white shadow-card-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between bg-gradient-to-r from-[var(--blue-50)] to-white">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-[var(--blue-600)] text-white flex items-center justify-center"><I.Calendar size={11} /></div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted-2)]">График аренды · превью</div>
            <div className="text-[11.5px] font-semibold text-[var(--ink-2)] tnum">
              {fmtDDMM(rental.startDate)} → <span className={extendDays > 0 ? 'text-[var(--green-ink)] font-bold' : 'text-[var(--ink-2)]'}>{fmtDDMMYYYY(newEnd)}</span>
              {extendDays > 0 && <span className="ml-1.5 text-[var(--green-ink)] font-bold">+{extendDays} {extendDays===1?'день':'дн'}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="h-6 w-6 rounded-full hover:bg-white flex items-center justify-center text-[var(--muted)]"><I.ChevronL size={12} /></button>
          <div className="font-display text-[12px] font-extrabold text-[var(--ink)] tracking-wide min-w-[110px] text-center">{RU_MONTHS[viewMonth.m]} {viewMonth.y}</div>
          <button onClick={nextMonth} className="h-6 w-6 rounded-full hover:bg-white flex items-center justify-center text-[var(--muted)]"><I.ChevronR size={12} /></button>
        </div>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7 gap-y-0.5 mb-0.5">
          {RU_DOW.map((d, i) => (
            <div key={i} className="text-center text-[9px] font-bold text-[var(--muted-2)] uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((d, i) => {
            const inOriginal = diffDays(rental.startDate, d) >= 0 && diffDays(d, rental.endDate) >= 0;
            const inOverdue  = isOverdue && diffDays(rental.endDate, d) > 0 && diffDays(d, today) >= 0;
            const inExtension = extendDays > 0 && diffDays(today, d) > 0 && diffDays(d, newEnd) >= 0 && !inOriginal && !inOverdue;
            const isToday = isSame(d, today);
            const isStart = isSame(d, rental.startDate);
            const isOrigEnd = isSame(d, rental.endDate);
            const isNewEnd = extendDays > 0 && isSame(d, newEnd);
            const inMonth = d.m === viewMonth.m;

            let bg = '', text = inMonth ? 'text-[var(--ink-2)]' : 'text-[var(--muted-2)] opacity-50', extra = '';
            if (inOriginal && !isStart && !isOrigEnd) { bg = 'bg-[var(--blue-50)]'; text = 'text-[var(--blue-700)]'; }
            if (inOverdue) { bg = 'bg-[var(--red-soft)]'; text = 'text-[var(--red-ink)] font-bold'; }
            if (inExtension) { bg = 'bg-[var(--green-soft)]'; text = 'text-[var(--green-ink)] font-bold'; }
            if (isToday) extra = 'ring-1 ring-[var(--blue-600)] ring-inset';
            if (isStart) { bg = 'bg-[var(--ink)]'; text = 'text-white font-bold'; extra = ''; }
            if (isOrigEnd && !isNewEnd && extendDays === 0) { bg = 'bg-[var(--ink)]'; text = 'text-white font-bold'; }
            if (isNewEnd) { bg = 'bg-[var(--green)]'; text = 'text-white font-bold'; extra = 'ring-2 ring-[var(--green)] ring-offset-1'; }

            return (
              <div key={i} className="relative h-7 flex items-center justify-center">
                <div className={`relative h-7 w-7 rounded-full flex items-center justify-center text-[11.5px] tnum transition-all ${bg} ${text} ${extra}`}>
                  {d.d}
                  {isOrigEnd && extendDays > 0 && !isNewEnd && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--ink)]" title="оригинальный возврат" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 px-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9.5px] text-[var(--muted)]">
          <Legend swatch="bg-[var(--blue-50)]" label="текущий период" />
          <Legend swatch="bg-[var(--red-soft)]" label="просрочка" />
          <Legend swatch="bg-[var(--green-soft)]" label="продление" />
          {extendDays > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-[var(--green-ink)] font-bold">
              <I.Check size={11} /> возврат сдвинется на {fmtDDMMYYYY(newEnd)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

window.Calendar = Calendar;
window.CompactExtendCalendar = CompactExtendCalendar;
