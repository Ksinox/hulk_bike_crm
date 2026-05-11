/* Small reusable building blocks */

function Popover({ anchorRef, onClose, children, align = 'left', width = 280 }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    let left = align === 'right' ? r.right - width : r.left;
    let top = r.bottom + 6;
    // Clamp horizontally
    const vw = window.innerWidth;
    if (left + width > vw - 8) left = vw - width - 8;
    if (left < 8) left = 8;
    // Clamp vertically — flip up if doesn't fit
    const vh = window.innerHeight;
    if (top + 320 > vh && r.top > 320) top = Math.max(8, r.top - 6 - 320);
    setPos({ left, top });
  }, [anchorRef, width, align]);
  React.useEffect(() => {
    const onClick = (e) => {
      if (!ref.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onClick);
      window.addEventListener('keydown', onKey);
      window.addEventListener('scroll', onScroll, true);
    });
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [anchorRef, onClose]);
  if (!pos) return null;
  const node = (
    <div ref={ref} style={{ width, left: pos.left, top: pos.top, position: 'fixed' }}
         className="z-[300] rounded-[14px] border border-[var(--border)] bg-white shadow-card-lg overflow-hidden animate-pop-in">
      {children}
    </div>
  );
  return ReactDOM.createPortal(node, document.body);
}

/* Pretty scooter avatar / placeholder */
function ScooterPoster({ scooter, size = 56 }) {
  const initial = scooter.number.replace(/[^0-9]/g, '').slice(0,2) || '?';
  return (
    <div className="relative rounded-[10px] overflow-hidden flex items-center justify-center"
         style={{ width: size, height: size, background: `linear-gradient(135deg, ${scooter.color}, ${scooter.color}cc)` }}>
      <I.Bike size={size * 0.55} className="text-white opacity-90" strokeWidth={1.8} />
      <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold text-white/90 tracking-wider tnum"
            style={{ background: 'rgba(0,0,0,0.25)', padding: '1px 0' }}>{initial}</span>
    </div>
  );
}

function StatusPill({ status }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--green-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--green-ink)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse-soft"></span>
        Активна
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--red-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--red-ink)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)]"></span>
        Просрочка
      </span>
    );
  }
  return null;
}

function KpiCard({ label, value, hint, hintColor = 'var(--muted-2)', emphasis }) {
  return (
    <div className={`rounded-[14px] border border-[var(--border)] bg-white px-4 py-3 shadow-card-sm flex flex-col min-w-0`}>
      <div className="uppercase-label">{label}</div>
      <div className={`font-display text-[20px] mt-1 leading-tight tnum text-[var(--ink)] ${emphasis ? '!text-[var(--blue-700)]' : ''}`}>{value}</div>
      {hint && <div className="text-[10.5px] mt-0.5" style={{ color: hintColor }}>{hint}</div>}
    </div>
  );
}

/* Action button — surfaced operation */
function ActionBtn({ icon: IconC, label, hint, tone = 'ghost', onClick, large = false }) {
  const tones = {
    primary: 'bg-[var(--blue-600)] text-white hover:bg-[var(--blue-700)] border-transparent',
    danger:  'bg-white text-[var(--red-ink)] border-[var(--red-soft)] hover:bg-[var(--red-soft)]',
    warn:    'bg-white text-[var(--orange-ink)] border-[var(--orange-soft)] hover:bg-[var(--orange-soft)]',
    ghost:   'bg-white text-[var(--ink-2)] border-[var(--border)] hover:bg-[var(--surface-soft)]',
    stop:    'bg-white text-[var(--ink-2)] border-[var(--border)] hover:bg-[var(--red-soft)] hover:text-[var(--red-ink)] hover:border-[var(--red-soft)]',
  };
  return (
    <button onClick={onClick}
            className={`group inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${tones[tone]}`}>
      <IconC size={14} />
      <span>{label}</span>
      {hint && <span className="hidden xl:inline opacity-60 font-medium">· {hint}</span>}
    </button>
  );
}

/* Big tile-style action for the action shelf */
function ActionTile({ icon: IconC, label, hint, tone = 'ghost', onClick, badge }) {
  const tones = {
    primary: 'bg-[var(--blue-600)] text-white hover:bg-[var(--blue-700)]',
    danger:  'bg-white text-[var(--red-ink)] border-[var(--red-soft)] hover:bg-[var(--red-soft)]/40',
    warn:    'bg-white text-[var(--orange-ink)] border-[var(--orange-soft)] hover:bg-[var(--orange-soft)]/40',
    ghost:   'bg-white text-[var(--ink-2)] border-[var(--border)] hover:bg-[var(--surface-soft)]',
  };
  const isPrimary = tone === 'primary';
  return (
    <button onClick={onClick}
            className={`relative flex flex-col items-start gap-1 rounded-[12px] ${isPrimary ? '' : 'border'} px-3 py-2.5 text-left transition-colors ${tones[tone]}`}>
      <div className="flex items-center gap-1.5">
        <IconC size={14} />
        <span className="text-[12px] font-bold tracking-wide">{label}</span>
      </div>
      {hint && <span className={`text-[10.5px] ${isPrimary ? 'text-white/80' : 'text-[var(--muted-2)]'}`}>{hint}</span>}
      {badge && (
        <span className={`absolute -top-1.5 -right-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badge.tone === 'red' ? 'bg-[var(--red)] text-white' : 'bg-[var(--blue-600)] text-white'}`}>
          {badge.text}
        </span>
      )}
    </button>
  );
}

window.Popover = Popover;
window.ScooterPoster = ScooterPoster;
window.StatusPill = StatusPill;
window.KpiCard = KpiCard;
window.ActionBtn = ActionBtn;
window.ActionTile = ActionTile;
