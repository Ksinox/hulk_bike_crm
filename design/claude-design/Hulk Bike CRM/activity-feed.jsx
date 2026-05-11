/* Activity feed v2 — Single ledger of rental events with on-hover before→after diff.
   Improvements:
   • Each row carries a `diff` payload describing what changed (label/from/to/kind).
   • Hover (or focus, or click) reveals the diff inline — red strike for old, green pill for new.
   • Linked events (extension + the payment that funded it) are visually bracketed.
   • Type-stripe colour matches the event family; filters + search refine the ledger.
   • Revertible events expose a one-click "Откатить" affordance on hover.
   • Sticky day-headers group events by date.
*/

const FEED_TYPE = {
  payment:     { icon: 'Wallet',   tone: 'green', label: 'Платёж'     },
  extend:      { icon: 'Repeat',   tone: 'blue',  label: 'Продление'  },
  deposit:     { icon: 'Lock',     tone: 'blue',  label: 'Залог'      },
  'deposit-up':{ icon: 'Plus',     tone: 'blue',  label: 'Залог'      },
  equipment:   { icon: 'Shirt',    tone: 'orange',label: 'Экипировка' },
  scooter:     { icon: 'Bike',     tone: 'ink',   label: 'Скутер'     },
  overdue:     { icon: 'AlertTri', tone: 'red',   label: 'Просрочка'  },
  forgive:     { icon: 'Gift',     tone: 'green', label: 'Прощение'   },
  tariff:      { icon: 'Coin',     tone: 'blue',  label: 'Тариф'      },
  created:     { icon: 'Sparkle',  tone: 'ink',   label: 'Старт'      },
};

const FEED_TONE_BG  = { green:'var(--green-soft)', red:'var(--red-soft)', blue:'var(--blue-50)', orange:'var(--orange-soft)', ink:'var(--surface-soft)' };
const FEED_TONE_INK = { green:'var(--green-ink)', red:'var(--red-ink)', blue:'var(--blue-700)', orange:'var(--orange-ink)', ink:'var(--ink-2)' };
const FEED_TONE_RAW = { green:'var(--green)',     red:'var(--red)',     blue:'var(--blue-600)', orange:'var(--orange)', ink:'var(--ink)' };

function ActivityFeed({ items, filter, onFilterChange, query, onQueryChange, onRevert }) {
  const filters = [
    { id: 'all',       label: 'Всё'        },
    { id: 'money',     label: 'Деньги'     },
    { id: 'overdue',   label: 'Просрочки'  },
    { id: 'equipment', label: 'Экипировка' },
    { id: 'scooter',   label: 'Скутер'     },
    { id: 'tariff',    label: 'Тариф'      },
  ];

  const visible = items.filter(it => {
    if (filter !== 'all') {
      if (filter === 'money'    && !['payment','extend','deposit','deposit-up','forgive'].includes(it.type)) return false;
      if (filter === 'overdue'  && !['overdue','forgive'].includes(it.type)) return false;
      if (filter === 'equipment'&& it.type !== 'equipment') return false;
      if (filter === 'scooter'  && it.type !== 'scooter')   return false;
      if (filter === 'tariff'   && it.type !== 'tariff')    return false;
    }
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${it.title} ${it.sub} ${it.who}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Group by day
  const groups = [];
  let cur = null;
  visible.forEach(it => {
    const day = it.ts.split(' ')[0];
    if (!cur || cur.day !== day) { cur = { day, items: [] }; groups.push(cur); }
    cur.items.push(it);
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="px-5 pt-4 pb-3 sticky top-0 bg-white z-10 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 relative">
            <I.Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input value={query || ''} onChange={(e) => onQueryChange(e.target.value)}
                   placeholder="Поиск по событиям, суммам, людям…"
                   className="w-full bg-[var(--surface-soft)] border border-[var(--border)] rounded-[10px] pl-7 pr-3 py-1.5 text-[12.5px] text-[var(--ink)] placeholder:text-[var(--muted-2)] focus:outline-none focus:ring-2 focus:ring-[var(--blue-100)]" />
          </div>
          <div className="text-[11px] text-[var(--muted-2)] tnum">{visible.length} событий</div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {filters.map(f => (
            <button key={f.id} onClick={() => onFilterChange(f.id)}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-semibold border transition-colors
                      ${filter === f.id
                        ? 'bg-[var(--ink)] text-white border-transparent'
                        : 'bg-white text-[var(--muted)] border-[var(--border)] hover:bg-[var(--surface-soft)]'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-2 text-[10.5px] text-[var(--muted-2)] inline-flex items-center gap-1.5">
          <I.Eye size={11} className="text-[var(--blue-600)]" />
          Наведите курсор на строку, чтобы увидеть «было → стало». Связанные события сшиты скобкой слева.
        </div>
      </div>

      <div className="px-5 pb-5">
        {visible.length === 0 && (
          <div className="text-center py-10 text-[12.5px] text-[var(--muted)]">Ничего не найдено по фильтрам</div>
        )}
        {groups.map(g => (
          <div key={g.day} className="mb-4">
            <div className="sticky top-[126px] z-[5] bg-white py-1.5 -mx-1 px-1 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted-2)] tnum">
              {g.day}
            </div>
            <ActivityGroup items={g.items} onRevert={onRevert} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Render items within a day, with bracket connectors for linked rows. */
function ActivityGroup({ items, onRevert }) {
  // Find linked pairs (linkedTo => other id) and mark brackets.
  const idMap = new Map(items.map(it => [it.id, it]));
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((it, idx) => {
        const linked = it.linkedTo && idMap.has(it.linkedTo);
        const prev = items[idx - 1];
        const next = items[idx + 1];
        const linkedAbove = linked && (prev && prev.id === it.linkedTo);
        const linkedBelow = linked && (next && next.id === it.linkedTo);
        return (
          <ActivityRow key={it.id} item={it} onRevert={onRevert}
                       linkedAbove={linkedAbove} linkedBelow={linkedBelow} />
        );
      })}
    </div>
  );
}

function ActivityRow({ item, onRevert, linkedAbove, linkedBelow }) {
  const [open, setOpen] = React.useState(false);
  const meta = FEED_TYPE[item.type] || { icon: 'More', tone: 'ink', label: '' };
  const IconC = I[meta.icon] || I.More;
  const positive = item.amount > 0;
  const hasDiff = item.diff && Object.keys(item.diff).length > 0;
  const time = item.ts.split(' ')[1] || '';

  return (
    <div className="relative flex items-stretch gap-3 group">
      {/* Link bracket */}
      <div className="relative w-4 shrink-0">
        {(linkedAbove || linkedBelow) && (
          <div className="absolute left-1/2 -translate-x-1/2 w-[2px] bg-[var(--blue-100)]"
               style={{ top: linkedAbove ? '-6px' : '14px', bottom: linkedBelow ? '-6px' : 'calc(100% - 14px)' }}></div>
        )}
        {(linkedAbove || linkedBelow) && (
          <div className="absolute left-1/2 top-[14px] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[var(--blue-600)]"></div>
        )}
      </div>

      {/* Type stripe + icon */}
      <div role="button" tabIndex={0} onClick={() => setOpen(o => !o)}
              onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
              className="flex-1 min-w-0 text-left rounded-[14px] border border-transparent hover:border-[var(--border)] hover:shadow-card-sm hover:bg-white transition-all cursor-pointer">
        <div className="flex items-stretch">
          {/* coloured stripe */}
          <div className="w-[3px] rounded-l-[14px] shrink-0" style={{ background: FEED_TONE_RAW[meta.tone] }}></div>

          <div className="flex-1 min-w-0 p-2.5 pl-3">
            <div className="flex items-start gap-3">
              <div className="relative h-9 w-9 shrink-0 rounded-full flex items-center justify-center"
                   style={{ background: FEED_TONE_BG[meta.tone], color: FEED_TONE_INK[meta.tone] }}>
                <IconC size={15} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-[10px] uppercase tracking-wider font-bold tnum"
                       style={{ color: FEED_TONE_INK[meta.tone] }}>{meta.label}</div>
                  <span className="text-[10px] text-[var(--muted-2)] tnum">{time}</span>
                  <span className="text-[10px] text-[var(--muted-2)] flex items-center gap-1 ml-auto">
                    <span className="inline-flex items-center justify-center h-[14px] w-[14px] rounded-full bg-[var(--surface-soft)] text-[8px] font-bold text-[var(--ink-2)] tnum">{item.avatar}</span>
                    {item.who}
                  </span>
                </div>
                <div className="mt-0.5 text-[13.5px] font-bold text-[var(--ink)] leading-tight">{item.title}</div>
                <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">{item.sub}</div>

                {/* Diff reveal */}
                {hasDiff && (
                  <div className={`grid grid-cols-1 gap-1.5 mt-2 transition-all overflow-hidden ${open ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    {Object.entries(item.diff).map(([k, d]) => (
                      <DiffRow key={k} field={d} />
                    ))}
                    {item.revertible && (
                      <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-dashed border-[var(--border)]">
                        <button onClick={(e) => { e.stopPropagation(); onRevert && onRevert(item); }}
                                className="inline-flex items-center gap-1 rounded-full bg-white border border-[var(--border)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--ink-2)] hover:bg-[var(--surface-soft)] hover:border-[var(--ink-2)]">
                          <I.Undo size={11} /> Откатить это изменение
                        </button>
                        <span className="text-[10px] text-[var(--muted-2)]">или <span className="underline cursor-pointer">переоткрыть в режиме редактирования</span></span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {item.amount !== 0 && (
                <div className="text-right shrink-0">
                  <div className={`font-display text-[16px] font-extrabold tnum leading-none ${positive ? 'text-[var(--green-ink)]' : 'text-[var(--red-ink)]'}`}>
                    {positive ? '+' : ''}{fmtMoney(item.amount)} ₽
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Renders one before→after row. */
function DiffRow({ field }) {
  const { label, from, to, kind, suffix } = field;
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 items-center text-[11.5px]">
      <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted-2)] truncate">{label}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {kind === 'list'
          ? <ListDiff from={from} to={to} />
          : (<>
              <DiffPill kind="from" value={from} k={kind} suffix={suffix} />
              <I.ArrowRight size={11} className="text-[var(--muted-2)]" />
              <DiffPill kind="to"   value={to}   k={kind} suffix={suffix} />
              {kind === 'money' && typeof from === 'number' && typeof to === 'number' && (
                <DeltaBadge delta={to - from} />
              )}
              {kind === 'number' && typeof from === 'number' && typeof to === 'number' && (
                <DeltaBadge delta={to - from} suffix={suffix} />
              )}
            </>)}
      </div>
    </div>
  );
}

function formatVal(v, k, suffix) {
  if (v === null || v === undefined || v === '—') return '—';
  if (k === 'money')  return `${fmtMoney(v)} ₽`;
  if (k === 'number') return `${fmtMoney(v)}${suffix ? ' '+suffix : ''}`;
  return String(v);
}

function DiffPill({ kind, value, k, suffix }) {
  const isFrom = kind === 'from';
  const isEmpty = value === '—' || value === null || value === undefined;
  const cls = isFrom
    ? 'bg-[var(--red-soft)] text-[var(--red-ink)] line-through decoration-[var(--red-ink)]/40'
    : 'bg-[var(--green-soft)] text-[var(--green-ink)] font-bold';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md tnum font-semibold ${cls} ${isEmpty ? 'opacity-60 no-underline' : ''}`}>
      {formatVal(value, k, suffix)}
    </span>
  );
}

function DeltaBadge({ delta, suffix }) {
  if (!delta) return null;
  const positive = delta > 0;
  return (
    <span className={`inline-flex items-center text-[10px] font-bold tnum px-1 rounded ${positive ? 'text-[var(--green-ink)]' : 'text-[var(--red-ink)]'}`}>
      {positive ? '+' : '−'}{fmtMoney(Math.abs(delta))}{suffix ? ' '+suffix : ''}
    </span>
  );
}

function ListDiff({ from, to }) {
  const fromSet = new Set(from);
  const toSet = new Set(to);
  const removed = from.filter(x => !toSet.has(x));
  const kept    = from.filter(x => toSet.has(x));
  const added   = to.filter(x => !fromSet.has(x));
  return (
    <div className="flex flex-wrap gap-1">
      {kept.map(x => (
        <span key={'k'+x} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[var(--surface-soft)] text-[var(--muted)] text-[11px] font-semibold">{x}</span>
      ))}
      {removed.map(x => (
        <span key={'r'+x} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[var(--red-soft)] text-[var(--red-ink)] text-[11px] font-semibold line-through decoration-[var(--red-ink)]/40">{x}</span>
      ))}
      {added.map(x => (
        <span key={'a'+x} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[var(--green-soft)] text-[var(--green-ink)] text-[11px] font-bold">
          <I.Plus size={9} /> {x}
        </span>
      ))}
      {from.length === 0 && added.length > 0 && removed.length === 0 && kept.length === 0 && (
        <span className="text-[11px] text-[var(--muted-2)]">пусто</span>
      )}
    </div>
  );
}

window.ActivityFeed = ActivityFeed;
