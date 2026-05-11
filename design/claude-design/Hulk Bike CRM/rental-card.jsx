/* Main RentalCard v5 — KPI strip + vertical action rail attached to drawer edge.
   Layout:
   ┌────────────────── header (id + status + debt badge) ─────────────────┐
   │ Master block: Client | Scooter + Equipment                            │
   │ KPI strip (one row): [Просрочка?] [Долг?] Тариф · Эта аренда · За всё время · Залог · Депозит │
   │ [Принять оплату] [Завершить] [...]                                    │
   │ ┌──────────── Calendar ─────────┬──── compact History strip ────┐    │
   │ └───────────────────────────────┴───────────────────────────────┘    │
   └──────────────────────────────────────────────────────────────────────┘
   Vertical action rail stuck to viewport right edge — buttons slide WITH drawer when it opens.
*/

const { useState, useRef, useMemo, useEffect } = React;

function RentalCard({ initialRental }) {
  const [rental, setRental] = useState(initialRental);
  const [equipment, setEquipment] = useState(initialRental.equipment);
  const [extending, setExtending] = useState(null);
  const [scooterPickerOpen, setScooterPickerOpen] = useState(false);
  const [overduePopoverOpen, setOverduePopoverOpen] = useState(false);
  const [addEquipOpen, setAddEquipOpen] = useState(false);
  const [equipSwapIdx, setEquipSwapIdx] = useState(null);
  const [toast, setToast] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [activityFilter, setActivityFilter] = useState('all');
  const [activityQuery, setActivityQuery] = useState('');

  useEffect(() => { setRental(r => ({ ...r, equipment })); }, [equipment]);

  const scooterRef = useRef();
  const overdueRef = useRef();
  const addEquipRef = useRef();
  const equipRefs = useRef({});

  const scooter = useMemo(() => PARK.find(s => s.id === rental.scooterId), [rental.scooterId]);
  const today = TODAY;
  const isOverdue = rental.status === 'overdue';

  function showToast(text) {
    setToast({ text });
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 2600);
  }

  function openExtension(initialDays) {
    setExtending({ extraDays: initialDays, equipmentDraft: equipment.map(e => ({ ...e })) });
  }

  const handleAcceptPayment = () => openExtension(isOverdue ? 0 : 7);
  const handleComplete = () => {
    setCompleting(true);
    setTimeout(() => { setCompleting(false); showToast('Аренда завершена'); }, 800);
  };
  function commitExtension({ days, equipment: eqDraft, method, useDeposit, cashDue, debtPortion, forgiveDebt, newEnd }) {
    setRental(r => ({
      ...r,
      endDate: days > 0 ? newEnd : r.endDate,
      thisRentalSum: r.thisRentalSum + days * r.tariff.rate,
      extensions: r.extensions + (days > 0 ? 1 : 0),
      status: 'active', debt: 0, overdueDays: 0,
    }));
    setEquipment(eqDraft);
    const msg = days > 0
      ? `Продлено до ${fmtDDMMYYYY(newEnd)} · принято ${fmtMoney(cashDue)} ₽`
      : forgiveDebt ? 'Просрочка прощена · долг закрыт' : `Принято ${fmtMoney(cashDue)} ₽ · долг закрыт`;
    showToast(msg);
    setExtending(null);
  }

  function swapEquipment(idx, item) {
    setEquipment(eq => eq.map((e, i) => i === idx ? { itemId: item.id, name: item.name, price: item.price, free: item.free } : e));
    showToast(`Заменено: «${item.name}»`);
  }
  function removeEquipment(idx) {
    setEquipment(eq => eq.filter((_, i) => i !== idx));
    showToast('Позиция убрана');
  }
  function addEquipment(item) {
    setEquipment(eq => [...eq, { itemId: item.id, name: item.name, price: item.price, free: item.free }]);
    showToast(`Добавлено: «${item.name}»`);
  }
  function swapScooter(s) {
    setRental(r => ({ ...r, scooterId: s.id }));
    showToast(`Скутер заменён на ${s.number}`);
  }
  function topupDeposit() {
    setRental(r => ({ ...r, client: { ...r.client, depositBalance: r.client.depositBalance + 1000 } }));
    showToast('Депозит +1 000 ₽');
  }
  function handleOverdueAction(id) {
    if (id === 'pay-all' || id === 'forgive-all') {
      setRental(r => ({ ...r, debt: 0, overdueDays: 0, status: 'active' }));
      showToast(id === 'pay-all' ? `Принято ${fmtMoney(rental.debt)} ₽ · долг закрыт` : 'Просрочка прощена');
    } else if (id === 'forgive-one') {
      setRental(r => ({ ...r, debt: Math.max(0, r.debt - r.tariff.rate), overdueDays: Math.max(0, r.overdueDays - 1) }));
      showToast(`Прощён 1 день · −${fmtMoney(rental.tariff.rate)} ₽`);
    } else if (id === 'pause') {
      showToast('Просрочка поставлена на паузу');
    }
    setOverduePopoverOpen(false);
  }

  const [dragPreviewDays, setDragPreviewDays] = useState(null);
  const onPreviewExtend = (days) => setDragPreviewDays(days);
  const onCommitExtend  = (days) => { setDragPreviewDays(null); openExtension(days); };

  const c = rental.client;
  const [liveExtendDays, setLiveExtendDays] = useState(0);
  const liveNewEnd = liveExtendDays > 0 ? addDays(rental.endDate, liveExtendDays) : rental.endDate;

  return (
    <div className="relative w-full">
      <div className="w-full max-w-[1180px] mx-auto p-4 lg:p-5 flex flex-col gap-4">
        {overduePopoverOpen && (
          <Popover anchorRef={overdueRef} onClose={() => setOverduePopoverOpen(false)} width={320}>
            <OverdueActions rental={rental} onAction={handleOverdueAction} onClose={() => setOverduePopoverOpen(false)} />
          </Popover>
        )}

        {/* MASTER BLOCK */}
        <MasterBlock
          rental={rental} client={c} scooter={scooter} equipment={equipment}
          isOverdue={isOverdue}
          onTopupDeposit={topupDeposit}
          onOverdueClick={() => setOverduePopoverOpen(o => !o)} overdueRef={overdueRef}
          scooterPickerOpen={scooterPickerOpen} setScooterPickerOpen={setScooterPickerOpen}
          onSwapScooter={swapScooter} scooterRef={scooterRef}
          addEquipOpen={addEquipOpen} setAddEquipOpen={setAddEquipOpen} addEquipRef={addEquipRef}
          onAddEquipment={addEquipment}
          equipSwapIdx={equipSwapIdx} setEquipSwapIdx={setEquipSwapIdx} equipRefs={equipRefs}
          onSwapEquipment={swapEquipment} onRemoveEquipment={removeEquipment}
          onOpenProfile={() => setDrawer('profile')}
          onAcceptPayment={handleAcceptPayment}
          onComplete={handleComplete}
        />

        {/* KPI strip — one row */}
        <KpiStrip rental={rental} isOverdue={isOverdue} today={today}
                  onOverdueClick={() => setOverduePopoverOpen(true)}
                  onOpenDebts={() => setDrawer('debts')}
                  onTopupDeposit={topupDeposit}
                  onAcceptPayment={handleAcceptPayment}
                  onComplete={handleComplete} />

        {/* Calendar + compact history — hidden while extending (calendar floats above drawer) */}
        {!extending && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
            <CalendarPanel rental={rental} initialRental={initialRental} today={today} isOverdue={isOverdue}
                           onPreviewExtend={onPreviewExtend} onCommitExtend={onCommitExtend}
                           dragPreviewDays={dragPreviewDays}
                           onOverdueClick={() => setOverduePopoverOpen(true)} />
            <HistoryStrip items={ACTIVITY} onExpand={() => setDrawer('history')} />
          </div>
        )}

        {/* Documents — inline, always visible */}
        <DocsInline items={DOCS} />
      </div>

      {/* Floating compact calendar above extension drawer */}
      {extending && (
        <div className="fixed inset-x-0 z-30 flex justify-center pointer-events-none" style={{ bottom: 'calc(min(86vh, 540px) + 14px)' }}>
          <div className="pointer-events-auto w-full max-w-[640px] mx-3 animate-slide-up">
            <CompactExtendCalendar rental={rental} today={today}
                                   extendDays={liveExtendDays} newEnd={liveNewEnd} />
          </div>
        </div>
      )}

      {/* DRAWERS */}
      <SideDrawer open={drawer === 'history'} onClose={() => setDrawer(null)}
                  title="История аренды" subtitle="Все события · наведите на строку — «было → стало»"
                  icon={I.History} accent="ink" width={620}>
        <ActivityFeed items={ACTIVITY} filter={activityFilter} onFilterChange={setActivityFilter}
                      query={activityQuery} onQueryChange={setActivityQuery}
                      onRevert={(it) => showToast(`Откат: «${it.title}»`)} />
      </SideDrawer>

      <SideDrawer open={drawer === 'debts'} onClose={() => setDrawer(null)}
                  title="История долгов" subtitle="Открытые, прощённые и закрытые периоды"
                  icon={I.AlertTri} accent="red" width={520}>
        <DebtsList items={DEBT_PERIODS} />
      </SideDrawer>

      <SideDrawer open={drawer === 'profile'} onClose={() => setDrawer(null)}
                  title={c.name} subtitle="Профиль клиента"
                  icon={I.User} accent="blue" width={480}>
        <ProfilePanel client={c} />
      </SideDrawer>

      {extending && (
        <ExtensionDrawer rental={rental} scooter={scooter} initial={extending}
                         onDaysChange={setLiveExtendDays}
                         onCancel={() => setExtending(null)} onConfirm={commitExtension} />
      )}

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] animate-pop-in">
          <div className="rounded-full bg-[var(--ink)] text-white px-4 py-2 text-[12.5px] font-semibold shadow-card-lg flex items-center gap-2">
            <I.Check size={13} /> {toast.text}
          </div>
        </div>
      )}

      {completing && (
        <div className="fixed inset-0 z-[300] bg-[var(--ink)]/55 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl px-6 py-4 text-[13px] text-[var(--ink-2)] font-semibold">Завершаем аренду…</div>
        </div>
      )}
    </div>
  );
}

/* ── Vertical rail stuck to right edge, slides with drawer ────── */

function VerticalRail({ items, active, onSelect, drawerOpen, drawerWidth = 480 }) {
  const offset = drawerOpen ? Math.min(drawerWidth, window.innerWidth * 0.95) : 0;
  return (
    <aside className="fixed top-1/2 -translate-y-1/2 z-[160] transition-[right] duration-300 ease-out"
           style={{ right: offset }}>
      <div className="bg-white border border-[var(--border)] shadow-card-lg rounded-l-2xl py-3 px-2 flex flex-col gap-2">
        {items.map(it => {
          const isActive = active === it.id;
          const Ic = it.icon;
          const tone = it.tone || 'default';
          const bgs = {
            default: isActive ? 'var(--ink)' : 'var(--surface-soft)',
            red:     isActive ? 'var(--red)'      : 'var(--red-soft)',
            orange:  isActive ? 'var(--orange)'   : 'var(--orange-soft)',
          };
          const inks = {
            default: isActive ? 'white' : 'var(--ink-2)',
            red:     isActive ? 'white' : 'var(--red-ink)',
            orange:  isActive ? 'white' : 'var(--orange-ink)',
          };
          return (
            <button key={it.id} onClick={() => onSelect(it.id)} title={it.label}
                    className="group relative flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all hover:scale-105">
              <span className="relative rounded-full h-10 w-10 flex items-center justify-center transition-colors"
                    style={{ background: bgs[tone], color: inks[tone] }}>
                <Ic size={16} />
                {it.badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--red)] text-white text-[9.5px] font-bold flex items-center justify-center border-2 border-white tnum">
                    {it.badge > 99 ? '99+' : it.badge}
                  </span>
                )}
              </span>
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-[var(--muted)] group-hover:text-[var(--ink)]">{it.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* ── KPI strip — one horizontal row, conditional cells ─────────── */

function KpiStrip({ rental, isOverdue, today, onOverdueClick, onOpenDebts, onTopupDeposit, onAcceptPayment, onComplete }) {
  const remaining = diffDays(today, rental.endDate);
  const cells = [];

  if (isOverdue) {
    cells.push({
      key: 'overdue', label: 'Просрочка', value: `${rental.overdueDays} дн`,
      sub: `с ${fmtDDMM(rental.endDate)}`, tone: 'red',
    });
    cells.push({
      key: 'debt', label: 'Долг', value: `${fmtMoney(rental.debt)} ₽`,
      sub: 'нажмите чтобы погасить', tone: 'red', onClick: onOverdueClick,
      action: { icon: I.AlertTri, onClick: onOpenDebts, title: 'История долгов', tone: 'red' },
    });
  } else {
    cells.push({
      key: 'term', label: 'Срок', value: `осталось ${remaining} дн`,
      sub: `${fmtDDMM(rental.startDate)} — ${fmtDDMM(rental.endDate)}`, tone: 'blue',
    });
  }

  cells.push({
    key: 'this', label: 'Эта аренда', value: `${fmtMoney(rental.thisRentalSum)} ₽`,
    sub: `продлений · ${rental.extensions}`, tone: 'ink',
  });
  cells.push({
    key: 'lifetime', label: 'За всё время', value: `${fmtMoney(rental.lifetimeSum)} ₽`,
    sub: 'всех аренд клиента', tone: 'blue',
  });

  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] shadow-card-sm overflow-hidden">
      <div className="flex divide-x divide-[var(--border)]">
        <div className="flex flex-1 divide-x divide-[var(--border)] min-w-0">
          {cells.map(c => <div key={c.key} className="flex-1 min-w-0"><KpiCell {...c} /></div>)}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-soft)]/40">
          <button onClick={onAcceptPayment}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--green)] text-white px-3.5 py-2 text-[12.5px] font-bold hover:brightness-110 shadow-card-sm whitespace-nowrap">
            <I.Wallet size={13} /> Принять оплату
          </button>
          <button onClick={onComplete}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-white border border-[var(--border)] text-[var(--ink-2)] px-3 py-2 text-[12.5px] font-bold hover:bg-white whitespace-nowrap">
            <I.Check size={13} /> Завершить
          </button>
        </div>
      </div>
    </div>
  );
}

function KpiCell({ label, value, sub, tone, onClick, action }) {
  const tones = {
    ink:   { bg: 'transparent',         ink: 'var(--ink)',       sub: 'var(--muted)'   },
    blue:  { bg: 'transparent',         ink: 'var(--blue-700)',  sub: 'var(--muted)'   },
    red:   { bg: 'var(--red-soft)',     ink: 'var(--red-ink)',   sub: 'var(--red-ink)' },
    green: { bg: 'transparent',         ink: 'var(--green-ink)', sub: 'var(--muted)'   },
  };
  const t = tones[tone] || tones.ink;
  const actionTone = action?.tone === 'red'
    ? { bg: 'white', ink: 'var(--red-ink)', border: 'var(--red)' }
    : { bg: 'var(--blue-50)', ink: 'var(--blue-700)', border: 'var(--blue-100)' };
  const Comp = onClick && !action ? 'button' : 'div';
  return (
    <Comp onClick={onClick && !action ? onClick : undefined}
          className={`relative px-3.5 py-3 text-left min-w-0 ${onClick ? 'hover:brightness-95 cursor-pointer' : ''}`}
          style={{ background: t.bg }}
          {...(onClick && action ? { onClick, role: 'button', tabIndex: 0 } : {})}>
      <div className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--muted-2)] truncate">{label}</div>
      <div className="mt-1 font-display text-[15px] font-extrabold tnum leading-tight truncate" style={{ color: t.ink }}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] truncate" style={{ color: t.sub }}>{sub}</div>}
      {action && (
        <button onClick={(e) => { e.stopPropagation(); action.onClick(); }} title={action.title}
                className="absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center border hover:brightness-110"
                style={{ background: actionTone.bg, color: actionTone.ink, borderColor: actionTone.border }}>
          <action.icon size={11} />
        </button>
      )}
    </Comp>
  );
}

/* ── Inline documents row (replaces docs drawer) ──────────────── */

function DocsInline({ items }) {
  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] shadow-card-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="uppercase-label">Документы</div>
          <div className="text-[11px] text-[var(--muted)]">договоры, акты, фото · клик для просмотра</div>
        </div>
        <button className="inline-flex items-center gap-1 rounded-full bg-[var(--blue-50)] text-[var(--blue-700)] hover:bg-[var(--blue-600)] hover:text-white px-2.5 py-1 text-[11px] font-bold">
          <I.Plus size={11} /> Загрузить
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {items.map(d => (
          <div key={d.id} className="rounded-[12px] border border-[var(--border)] p-2.5 flex items-center gap-2.5 hover:border-[var(--blue-100)] hover:bg-[var(--blue-50)]/40 cursor-pointer">
            <div className="h-10 w-10 rounded-[10px] bg-[var(--blue-50)] text-[var(--blue-700)] flex items-center justify-center flex-col shrink-0">
              <I.Doc size={13} />
              <span className="text-[7.5px] font-bold uppercase tnum mt-0.5">{d.kind}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-[var(--ink)] truncate">{d.name}</div>
              <div className="text-[10px] text-[var(--muted)] tnum">{d.date} · {d.size}</div>
            </div>
            <button className="h-7 w-7 rounded-full hover:bg-white text-[var(--muted)] hover:text-[var(--ink)] flex items-center justify-center shrink-0">
              <I.Download size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Master block ───────────────────────────────────────────────── */

function MasterBlock({ rental, client, scooter, equipment, isOverdue, onTopupDeposit,
                       onOverdueClick, overdueRef,
                       scooterPickerOpen, setScooterPickerOpen, onSwapScooter, scooterRef,
                       addEquipOpen, setAddEquipOpen, addEquipRef, onAddEquipment,
                       equipSwapIdx, setEquipSwapIdx, equipRefs, onSwapEquipment, onRemoveEquipment,
                       onOpenProfile, onAcceptPayment, onComplete }) {
  const equipSum = equipment.reduce((s, e) => s + (e.free ? 0 : e.price), 0);
  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] shadow-card-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1px_1fr_1px_1fr]">
        {/* COLUMN 1 — CLIENT */}
        <div className="p-5 flex flex-col">
          {/* Identity strip — moved from page header into client column */}
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10.5px] uppercase tracking-wider font-bold text-[var(--muted-2)] tnum">Аренда · #{String(rental.id).padStart(4,'0')}</span>
            <StatusPill status={rental.status} />
            {isOverdue && (
              <button ref={overdueRef} onClick={onOverdueClick}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--red)] text-white px-2 py-0.5 text-[10.5px] font-bold hover:brightness-110">
                <I.AlertTri size={10} /> {fmtMoney(rental.debt)} ₽ · {rental.overdueDays} дн
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={onOpenProfile} className="w-[88px] shrink-0 group cursor-pointer text-left" title="Открыть профиль клиента">
              <div className="aspect-[9/12] rounded-[12px] overflow-hidden flex flex-col border border-[var(--border)] group-hover:border-[var(--blue-600)] transition-colors"
                   style={{ background: `linear-gradient(135deg, ${client.color}33, ${client.color}11)` }}>
                <div className="flex-1 flex items-center justify-center">
                  <span className="font-display text-[30px] font-extrabold" style={{ color: client.color, opacity: 0.55 }}>{client.initials}</span>
                </div>
                <div className="px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-wider text-white"
                     style={{ background: client.color, opacity: 0.85 }}>фото</div>
              </div>
            </button>
            <div className="flex-1 min-w-0">
              <button onClick={onOpenProfile} className="text-left group" title="Открыть профиль клиента">
                <h1 className="font-display text-[20px] leading-[1.1] font-extrabold text-[var(--ink)] tracking-tight group-hover:text-[var(--blue-700)] group-hover:underline decoration-2 underline-offset-2">{client.name}</h1>
              </button>
              <div className="mt-1 inline-flex items-center gap-1 text-[11px]">
                <I.Star size={10} className="text-[var(--orange)]" />
                <span className="tnum font-bold text-[var(--ink-2)]">{client.rating}</span>
                <span className="text-[var(--muted-2)]">рейтинг</span>
              </div>
              <div className="mt-2 flex flex-col gap-0.5 text-[11.5px]">
                <MetaLine label="ДР"      value={client.dob} />
                <MetaLine label="Телефон" value={<a href={`tel:${client.phone.replace(/[^+0-9]/g,'')}`} className="tnum font-semibold text-[var(--ink-2)] hover:text-[var(--blue-700)]">{client.phone}</a>} />
                <MetaLine label="Адрес"   multiline value={<span className="text-[11px] leading-snug text-[var(--ink-2)] font-semibold">{client.address}</span>} />
              </div>
            </div>
          </div>

          {/* Money row — залог + депозит клиента — перенесены из KPI-стрипа */}
          <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
              <div className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--muted-2)]">Залог</div>
              <div className="mt-0.5 font-display text-[15px] font-extrabold tnum text-[var(--ink)] leading-tight">{fmtMoney(rental.deposit)} ₽</div>
              <div className="mt-0.5 text-[10px] text-[var(--muted)]">{rental.depositSource.toLowerCase()}</div>
            </div>
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
              <div className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--muted-2)]">Депозит клиента</div>
              <div className="mt-0.5 font-display text-[15px] font-extrabold tnum text-[var(--blue-700)] leading-tight">{fmtMoney(client.depositBalance)} ₽</div>
              <div className="mt-0.5 text-[10px] text-[var(--muted)]">свободные средства</div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block bg-[var(--border)]"></div>

        {/* COLUMN 2 — SCOOTER */}
        <div className="p-5 flex flex-col bg-[var(--surface-soft)]/35">
          <div className="flex items-center justify-between mb-3">
            <div className="uppercase-label">Скутер</div>
            <button ref={scooterRef} onClick={() => setScooterPickerOpen(o => !o)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-2)] hover:bg-[var(--blue-50)] hover:border-[var(--blue-100)] hover:text-[var(--blue-700)]">
              <I.Swap size={11} /> Заменить
            </button>
            {scooterPickerOpen && (
              <Popover anchorRef={scooterRef} onClose={() => setScooterPickerOpen(false)} width={320} align="right">
                <ScooterSwapPicker currentId={rental.scooterId} onSelect={onSwapScooter} onClose={() => setScooterPickerOpen(false)} />
              </Popover>
            )}
          </div>
          <div className="flex items-start gap-3">
            <ScooterPoster scooter={scooter} size={72} />
            <div className="flex-1 min-w-0">
              <div className="font-display text-[18px] font-extrabold text-[var(--ink)] leading-tight">{scooter.number}</div>
              <div className="text-[12.5px] font-semibold text-[var(--ink-2)] mt-0.5">{scooter.model}</div>
              <div className="mt-1.5 text-[11px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1"><I.Clock size={11} /> Пробег <span className="tnum text-[var(--ink-2)] font-semibold">{fmtMoney(scooter.mileage)} км</span></span>
              </div>
            </div>
          </div>
          {/* Тариф — перенесен из KPI-стрипа в колонку скутера */}
          <div className="mt-auto pt-4">
            <div className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2">
              <div className="text-[9.5px] uppercase tracking-wider font-bold text-[var(--muted-2)]">Тариф</div>
              <div className="mt-0.5 font-display text-[15px] font-extrabold tnum text-[var(--ink)] leading-tight">{rental.tariff.rate} ₽/сут</div>
              <div className="mt-0.5 text-[10px] text-[var(--muted)]">{rental.tariff.label} · {rental.paymentMethod}</div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block bg-[var(--border)]"></div>

        {/* COLUMN 3 — EQUIPMENT */}
        <div className="p-5 flex flex-col bg-[var(--surface-soft)]/35">
          <div className="flex items-start justify-between mb-2.5 gap-2">
            <div className="min-w-0">
              <div className="uppercase-label">Экипировка · клик чтобы заменить</div>
              <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                {equipment.length} {equipment.length === 1 ? 'позиция' : equipment.length < 5 ? 'позиции' : 'позиций'}
                {equipSum > 0 && <span> · {equipSum} ₽/сут</span>}
              </div>
            </div>
            <button ref={addEquipRef} onClick={() => setAddEquipOpen(o => !o)}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--blue-600)] text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--blue-700)] shrink-0">
              <I.Plus size={11} /> Добавить
            </button>
            {addEquipOpen && (
              <Popover anchorRef={addEquipRef} onClose={() => setAddEquipOpen(false)} width={300} align="right">
                <EquipmentAddPicker existingIds={equipment.map(i => i.itemId)} onAdd={onAddEquipment} onClose={() => setAddEquipOpen(false)} />
              </Popover>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 content-start">
            {equipment.map((it, idx) => {
              const isOpen = equipSwapIdx === idx;
              const ref = (equipRefs.current[idx] ??= React.createRef());
              return (
                <React.Fragment key={`${it.itemId}-${idx}`}>
                  <button ref={ref} onClick={() => setEquipSwapIdx(isOpen ? null : idx)}
                          className={`group inline-flex items-center gap-1.5 rounded-[10px] pl-2 pr-1 py-1.5 text-[11.5px] font-semibold border-2 transition-all
                            ${it.free
                              ? 'bg-[var(--green-soft)] text-[var(--green-ink)] border-transparent hover:border-[var(--green)]'
                              : 'bg-[var(--orange-soft)] text-[var(--orange-ink)] border-transparent hover:border-[var(--orange)]'}`}>
                    <span className="flex items-center gap-1">
                      {it.free ? <I.Helmet size={11} /> : <I.Shirt size={11} />}
                      {it.name}
                      {!it.free && <span className="tnum opacity-80">·{it.price} ₽</span>}
                    </span>
                    <span className="h-4 w-4 rounded-full bg-white/70 flex items-center justify-center group-hover:bg-white" title="Заменить">
                      <I.Swap size={9} />
                    </span>
                  </button>
                  {isOpen && (
                    <Popover anchorRef={ref} onClose={() => setEquipSwapIdx(null)} width={300}>
                      <EquipmentSwapPicker replacing={it}
                        onSelect={(item) => onSwapEquipment(idx, item)}
                        onRemove={() => onRemoveEquipment(idx)}
                        onClose={() => setEquipSwapIdx(null)} />
                    </Popover>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaLine({ label, value, multiline }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted-2)] w-[60px] shrink-0">{label}</span>
      <span className={multiline ? "flex-1 min-w-0" : "flex-1 min-w-0 truncate"}>{value}</span>
    </div>
  );
}

/* ── Calendar panel (left side of bottom row) ──────────────────── */

function CalendarPanel({ rental, initialRental, today, isOverdue, onPreviewExtend, onCommitExtend, dragPreviewDays, onOverdueClick }) {
  const total = diffDays(rental.startDate, rental.endDate);
  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] shadow-card-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="uppercase-label">График аренды</div>
        <div className="text-[11.5px] text-[var(--muted)]">
          Срок этой аренды <span className="font-bold text-[var(--blue-700)] tnum">{total} дн</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <ScheduleBlock kind="out"  date={rental.startDate} time={rental.startTime} warehouse={rental.warehouse} />
        <ScheduleBlock kind="back" date={rental.endDate}   time={rental.endTime}   warehouse={rental.warehouse}
                       overdue={isOverdue} overdueDays={rental.overdueDays} />
      </div>
      <Calendar startDate={rental.startDate}
                endDate={isOverdue ? today : rental.endDate}
                originalEnd={initialRental.endDate}
                today={today} overdueDays={rental.overdueDays}
                onPreviewExtend={onPreviewExtend} onCommitExtend={onCommitExtend}
                onOverdueClick={onOverdueClick} />
      {dragPreviewDays != null && (
        <div className="mt-2 flex items-center justify-between rounded-[10px] bg-[var(--green-soft)] text-[var(--green-ink)] px-3 py-2 text-[11.5px] font-semibold animate-pop-in">
          <span>Продление +{dragPreviewDays} {dragPreviewDays === 1 ? 'день' : dragPreviewDays < 5 ? 'дня' : 'дней'}</span>
          <span className="tnum">{fmtMoney(rental.tariff.rate * dragPreviewDays)} ₽</span>
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-start gap-2 text-[10.5px] text-[var(--muted)]">
        <I.Wave size={11} className="text-[var(--blue-600)] mt-0.5 shrink-0" />
        <span>Перетащите синюю ручку справа от даты возврата вправо, чтобы продлить. Клик по красным дням — варианты прощения долга.</span>
      </div>
    </div>
  );
}

function ScheduleBlock({ kind, date, time, warehouse, overdue, overdueDays }) {
  const isOut = kind === 'out';
  return (
    <div className={`rounded-[12px] border px-3 py-2.5 ${overdue && !isOut ? 'border-[var(--red-soft)] bg-[var(--red-soft)]/40' : 'border-[var(--border)] bg-[var(--surface-soft)]'}`}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider"
           style={{ color: overdue && !isOut ? 'var(--red-ink)' : isOut ? 'var(--blue-700)' : 'var(--ink-2)' }}>
        <span className="inline-block w-2 h-2 rounded-full"
              style={{ background: overdue && !isOut ? 'var(--red)' : isOut ? 'var(--blue-600)' : 'var(--ink-2)' }}></span>
        {isOut ? 'Выдача' : (overdue ? `Возврат просрочен · ${overdueDays} дн` : 'Возврат (план)')}
      </div>
      <div className="mt-1 font-display text-[15.5px] font-extrabold text-[var(--ink)] tnum">
        {fmtDDMMYYYY(date)} · {time}
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--muted)] inline-flex items-center gap-1">
        <I.MapPin size={11} /> {warehouse}
      </div>
    </div>
  );
}

/* ── Compact history strip (right of calendar) ─────────────────── */

function HistoryStrip({ items, onExpand }) {
  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] shadow-card-sm flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-[var(--border)]">
        <div>
          <div className="uppercase-label">История</div>
          <div className="text-[11px] text-[var(--muted)]">последние события · скролл</div>
        </div>
        <button onClick={onExpand}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] hover:bg-[var(--ink)] hover:text-white px-2.5 py-1 text-[11px] font-bold text-[var(--ink-2)]">
          Открыть всё <I.ArrowRight size={11} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[420px]">
        <div className="px-3 py-2 flex flex-col gap-1.5">
          {items.slice(0, 16).map(it => <HistoryStripRow key={it.id} item={it} />)}
          <button onClick={onExpand} className="mt-1 py-2 text-[11px] font-bold text-[var(--blue-700)] hover:underline">
            Показать все {items.length} событий →
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryStripRow({ item }) {
  const meta = (typeof FEED_TYPE !== 'undefined' && FEED_TYPE[item.type]) || { icon: 'More', tone: 'ink', label: '' };
  const IconC = I[meta.icon] || I.More;
  const tones = {
    green:  { bg: 'var(--green-soft)',  ink: 'var(--green-ink)'  },
    red:    { bg: 'var(--red-soft)',    ink: 'var(--red-ink)'    },
    blue:   { bg: 'var(--blue-50)',     ink: 'var(--blue-700)'   },
    orange: { bg: 'var(--orange-soft)', ink: 'var(--orange-ink)' },
    ink:    { bg: 'var(--surface-soft)',ink: 'var(--ink-2)'      },
  };
  const t = tones[meta.tone] || tones.ink;
  const positive = item.amount > 0;
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-[10px] hover:bg-[var(--surface-soft)]">
      <span className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: t.bg, color: t.ink }}>
        <IconC size={12} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-bold text-[var(--ink)] truncate leading-tight">{item.title}</div>
        <div className="text-[10px] text-[var(--muted)] tnum">{item.ts}</div>
      </div>
      {item.amount !== 0 && (
        <div className={`shrink-0 font-display text-[12.5px] font-extrabold tnum ${positive ? 'text-[var(--green-ink)]' : 'text-[var(--red-ink)]'}`}>
          {positive ? '+' : ''}{fmtMoney(item.amount)} ₽
        </div>
      )}
    </div>
  );
}

/* ── Drawer body components ─────────────────────────────────────── */

function DebtsList({ items }) {
  return (
    <div className="p-5 flex flex-col gap-2">
      {items.map(d => {
        const colors = {
          open:     { bg: 'var(--red-soft)',   ink: 'var(--red-ink)',   tag: 'Открыто' },
          forgiven: { bg: 'var(--green-soft)', ink: 'var(--green-ink)', tag: 'Прощено' },
          paid:     { bg: 'var(--surface-soft)', ink: 'var(--ink-2)',   tag: 'Закрыто' },
        }[d.status];
        return (
          <div key={d.id} className="rounded-[12px] border border-[var(--border)] p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: colors.bg, color: colors.ink }}>
              <I.AlertTri size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold text-[var(--ink)]">{d.range} · {d.days} {d.days === 1 ? 'день' : 'дн'}</div>
              <div className="text-[11px] text-[var(--muted)]">{d.note}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-[15px] font-extrabold tnum" style={{ color: colors.ink }}>{fmtMoney(d.amount)} ₽</div>
              <div className="text-[10px] uppercase tracking-wider font-bold mt-0.5" style={{ color: colors.ink }}>{colors.tag}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TasksList({ items }) {
  return (
    <div className="p-5 flex flex-col gap-2">
      {items.map(t => {
        const pri = { high: 'var(--red)', normal: 'var(--blue-600)', low: 'var(--muted-2)' }[t.priority];
        return (
          <div key={t.id} className={`rounded-[12px] border border-[var(--border)] p-3 flex items-start gap-3 ${t.done ? 'opacity-55' : ''}`}>
            <span className="h-5 w-5 rounded-md border-2 flex items-center justify-center mt-0.5"
                  style={{ borderColor: t.done ? 'var(--green)' : 'var(--border)', background: t.done ? 'var(--green)' : 'white', color: 'white' }}>
              {t.done && <I.Check size={11} />}
            </span>
            <div className="flex-1 min-w-0">
              <div className={`text-[13px] font-bold text-[var(--ink)] ${t.done ? 'line-through' : ''}`}>{t.title}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-2">
                <span className="inline-flex items-center gap-1"><I.Calendar size={10} /> {t.due}</span>
                <span>·</span>
                <span>{t.who}</span>
              </div>
            </div>
            <span className="h-2 w-2 rounded-full mt-2" style={{ background: pri }}></span>
          </div>
        );
      })}
      <button className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[var(--border)] py-2 text-[12px] font-bold text-[var(--muted)] hover:text-[var(--ink-2)] hover:bg-[var(--surface-soft)]">
        <I.Plus size={12} /> Новая задача
      </button>
    </div>
  );
}

function DocsList({ items }) {
  return (
    <div className="p-5 flex flex-col gap-2">
      {items.map(d => (
        <div key={d.id} className="rounded-[12px] border border-[var(--border)] p-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-[10px] bg-[var(--blue-50)] text-[var(--blue-700)] flex items-center justify-center flex-col">
            <I.Doc size={14} />
            <span className="text-[8px] font-bold uppercase tnum mt-0.5">{d.kind}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-bold text-[var(--ink)] truncate">{d.name}</div>
            <div className="text-[11px] text-[var(--muted)]">{d.date} · {d.size}</div>
          </div>
          <button className="h-8 w-8 rounded-full hover:bg-[var(--surface-soft)] text-[var(--muted)] hover:text-[var(--ink)] flex items-center justify-center">
            <I.Download size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ProfilePanel({ client }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="rounded-[14px] overflow-hidden flex flex-col border border-[var(--border)] aspect-[16/8]"
           style={{ background: `linear-gradient(135deg, ${client.color}33, ${client.color}11)` }}>
        <div className="flex-1 flex items-center justify-center">
          <span className="font-display text-[64px] font-extrabold" style={{ color: client.color, opacity: 0.55 }}>{client.initials}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 text-[12.5px]">
        <MetaLine label="ФИО" value={<span className="font-bold text-[var(--ink)]">{client.name}</span>} />
        <MetaLine label="ДР" value={client.dob} />
        <MetaLine label="Телефон" value={<span className="tnum">{client.phone}</span>} />
        <MetaLine label="Доп. тел" value={<span className="tnum">{client.altPhone}</span>} />
        <MetaLine label="Адрес" value={client.address} />
        <MetaLine label="Рейтинг" value={<span className="font-bold">{client.rating}</span>} />
        <MetaLine label="Депозит" value={<span className="font-bold tnum text-[var(--blue-700)]">{fmtMoney(client.depositBalance)} ₽</span>} />
      </div>
    </div>
  );
}

window.RentalCard = RentalCard;
