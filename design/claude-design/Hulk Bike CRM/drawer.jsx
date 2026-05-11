/* Side Drawer — slides in from the right edge. Backdrop + esc to close. */

function SideDrawer({ open, onClose, title, subtitle, width = 480, icon: Icon, accent = 'blue', children, footer }) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const accentColor = {
    blue:   'var(--blue-600)',
    green:  'var(--green)',
    red:    'var(--red)',
    orange: 'var(--orange)',
    ink:    'var(--ink)',
  }[accent] || 'var(--blue-600)';

  return (
    <div className={`fixed inset-0 z-[150] transition-opacity ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      {/* backdrop */}
      <div onClick={onClose}
           className={`absolute inset-0 bg-[var(--ink)]/35 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}></div>

      {/* panel */}
      <aside className={`absolute right-0 top-0 bottom-0 bg-white border-l border-[var(--border)] shadow-card-lg flex flex-col transition-transform duration-300 ease-out
                         ${open ? 'translate-x-0' : 'translate-x-full'}`}
             style={{ width: width, maxWidth: '95vw' }}>
        {/* header */}
        <header className="px-5 pt-4 pb-3 border-b border-[var(--border)] flex items-start gap-3">
          {Icon && (
            <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                 style={{ background: `color-mix(in oklab, ${accentColor} 12%, white)`, color: accentColor }}>
              <Icon size={18} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-display text-[18px] font-extrabold text-[var(--ink)] leading-tight truncate">{title}</div>
            {subtitle && <div className="text-[11.5px] text-[var(--muted)] mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose}
                  className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)]">
            <I.X size={16} />
          </button>
        </header>

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* footer */}
        {footer && (
          <footer className="px-5 py-3 border-t border-[var(--border)] bg-white">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

/* Circular icon-only button used in action rails. */
function CircleButton({ icon: Icon, label, badge, onClick, refEl, tone = 'default', size = 38 }) {
  const tones = {
    default: { bg: 'var(--surface-soft)', ic: 'var(--ink-2)', hover: 'white' },
    red:     { bg: 'var(--red-soft)',     ic: 'var(--red-ink)', hover: 'color-mix(in oklab, var(--red) 18%, white)' },
    green:   { bg: 'var(--green-soft)',   ic: 'var(--green-ink)', hover: 'color-mix(in oklab, var(--green) 18%, white)' },
    blue:    { bg: 'var(--blue-50)',      ic: 'var(--blue-700)', hover: 'color-mix(in oklab, var(--blue-600) 14%, white)' },
    ink:     { bg: 'var(--ink)',          ic: 'white',          hover: '#000' },
  };
  const t = tones[tone] || tones.default;
  return (
    <button ref={refEl} onClick={onClick} title={label}
            className="group relative shrink-0 inline-flex flex-col items-center gap-1.5 transition-all">
      <span className="rounded-full flex items-center justify-center transition-all"
            style={{ width: size, height: size, background: t.bg, color: t.ic, border: '1px solid var(--border)' }}>
        <Icon size={Math.round(size * 0.42)} />
        {badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--red)] text-white text-[9.5px] font-bold flex items-center justify-center border-2 border-white tnum">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[10.5px] font-semibold text-[var(--ink-2)] whitespace-nowrap group-hover:text-[var(--ink)]">{label}</span>
    </button>
  );
}

window.SideDrawer = SideDrawer;
window.CircleButton = CircleButton;
