/* Extension drawer v2 — handles overdue (debt-first), amount mode, equipment inline */

function ExtensionDrawer({ rental, scooter, initial, onCancel, onConfirm, onDaysChange }) {
  // initial: { extraDays, equipmentDraft }
  const [days, setDays] = React.useState(initial.extraDays);
  const [equipment, setEquipment] = React.useState(initial.equipmentDraft);
  const [mode, setMode] = React.useState('days'); // days | amount
  const [amountInput, setAmountInput] = React.useState('');
  const [method, setMethod] = React.useState(rental.paymentMethod === 'наличные' ? 'cash' : 'transfer');
  const [useDeposit, setUseDeposit] = React.useState(false);
  const [clearDebt, setClearDebt] = React.useState(true); // when overdue
  const [forgiveDebt, setForgiveDebt] = React.useState(false);

  const equipDaily = equipment.reduce((s, e) => s + (e.free ? 0 : e.price), 0);
  const dailyTotal = rental.tariff.rate + equipDaily;

  React.useEffect(() => { onDaysChange && onDaysChange(days); }, [days, onDaysChange]);

  // amount → days
  React.useEffect(() => {
    if (mode !== 'amount') return;
    const amt = Math.max(0, parseInt(amountInput || '0', 10));
    const debtPortion = (rental.debt > 0 && clearDebt && !forgiveDebt) ? rental.debt : 0;
    const available = Math.max(0, amt - debtPortion);
    const possibleDays = Math.floor(available / dailyTotal);
    setDays(possibleDays);
  }, [amountInput, mode, dailyTotal, rental.debt, clearDebt, forgiveDebt]);

  const newEnd = days > 0 ? addDays(rental.endDate, days) : rental.endDate;
  const rentSum = rental.tariff.rate * days;
  const equipSum = equipDaily * days;
  const periodTotal = rentSum + equipSum;
  const debtPortion = (rental.debt > 0 && clearDebt && !forgiveDebt) ? rental.debt : 0;
  const grossTotal = periodTotal + debtPortion;
  const depositAvail = Math.max(0, rental.client.depositBalance);
  const fromDeposit = useDeposit ? Math.min(grossTotal, depositAvail) : 0;
  const cashDue = grossTotal - fromDeposit;

  const isOverdue = rental.status === 'overdue' && rental.debt > 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[1200px] mb-3 mx-3 rounded-2xl bg-white border border-[var(--border)] shadow-card-lg animate-slide-up overflow-hidden max-h-[88vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] bg-gradient-to-r from-[var(--blue-50)] to-white">
          <div className="h-9 w-9 rounded-full bg-[var(--blue-600)] text-white flex items-center justify-center">
            <I.Repeat size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-[var(--ink)]">
              {isOverdue ? 'Закрыть просрочку и продлить' : 'Продление аренды'} · #{String(rental.id).padStart(4,'0')}
            </div>
            <div className="text-[11.5px] text-[var(--muted)]">
              {days > 0
                ? <>Возврат сдвинется с <span className="font-semibold text-[var(--ink-2)]">{fmtDDMM(rental.endDate)}</span> на <span className="font-semibold text-[var(--blue-700)]">{fmtDDMMYYYY(newEnd)}</span></>
                : <>Только закрытие долга — без сдвига даты возврата</>}
            </div>
          </div>
          <button onClick={onCancel} className="h-8 w-8 rounded-full hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--muted)]">
            <I.X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto scrollbar-thin flex-1">
          {/* ── STEP 1 (overdue only): debt resolution ─────────────────── */}
          {isOverdue && (
            <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--red-soft)]/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[var(--red)] text-white text-[11px] font-bold">1</span>
                <div className="uppercase-label !text-[var(--red-ink)]">Сначала — просрочка</div>
                <span className="ml-auto font-display text-[18px] font-extrabold text-[var(--red-ink)] tnum">
                  {fmtMoney(rental.debt)} ₽ · {rental.overdueDays} дн
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setClearDebt(true); setForgiveDebt(false); }}
                        className={`rounded-[10px] px-3 py-2 text-left border-2 transition-colors ${clearDebt && !forgiveDebt ? 'border-[var(--blue-600)] bg-white' : 'border-transparent bg-white/60 hover:bg-white'}`}>
                  <div className="text-[12px] font-bold text-[var(--ink)]">Погасить долг</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">включить {fmtMoney(rental.debt)} ₽ в эту оплату</div>
                </button>
                <button onClick={() => { setClearDebt(false); setForgiveDebt(true); }}
                        className={`rounded-[10px] px-3 py-2 text-left border-2 transition-colors ${forgiveDebt ? 'border-[var(--green)] bg-white' : 'border-transparent bg-white/60 hover:bg-white'}`}>
                  <div className="text-[12px] font-bold text-[var(--green-ink)]">Простить просрочку</div>
                  <div className="text-[10.5px] text-[var(--muted)] mt-0.5">−{fmtMoney(rental.debt)} ₽ списать на компанию</div>
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: period ─────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[var(--blue-600)] text-white text-[11px] font-bold">{isOverdue ? '2' : '1'}</span>
              <div className="uppercase-label">Период продления</div>
              <div className="ml-auto inline-flex bg-[var(--surface-soft)] rounded-full p-0.5 border border-[var(--border)]">
                <ModePill active={mode === 'days'} onClick={() => setMode('days')} icon={I.Calendar} label="по дням" />
                <ModePill active={mode === 'amount'} onClick={() => setMode('amount')} icon={I.Coin} label="по сумме клиента" />
              </div>
            </div>

            {mode === 'days' ? (
              <div className="flex items-center gap-3">
                <div className="flex items-stretch rounded-[12px] border border-[var(--border)] overflow-hidden">
                  <button onClick={() => setDays(d => Math.max(0, d - 1))} className="w-10 bg-[var(--surface-soft)] text-[var(--muted)] hover:text-[var(--ink)] flex items-center justify-center text-[18px]">−</button>
                  <div className="px-5 py-2 text-center bg-white">
                    <div className="font-display text-[26px] font-extrabold tnum text-[var(--ink)] leading-none">{days}</div>
                    <div className="text-[10px] text-[var(--muted)]">{days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</div>
                  </div>
                  <button onClick={() => setDays(d => d + 1)} className="w-10 bg-[var(--surface-soft)] text-[var(--muted)] hover:text-[var(--ink)] flex items-center justify-center text-[18px]">+</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[3, 7, 14, 30].map(n => (
                    <button key={n} onClick={() => setDays(n)}
                            className={`rounded-full text-[11px] font-semibold px-3 py-1.5 border ${days === n ? 'bg-[var(--blue-50)] border-[var(--blue-100)] text-[var(--blue-700)]' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--ink-2)] hover:bg-[var(--surface-soft)]'}`}>
                      {n}д
                    </button>
                  ))}
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10.5px] uppercase tracking-wider font-bold text-[var(--muted-2)]">Новый возврат</div>
                  <div className="font-display text-[18px] font-extrabold text-[var(--blue-700)] tnum">
                    {days > 0 ? fmtDDMMYYYY(newEnd) : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-stretch rounded-[12px] border border-[var(--border)] overflow-hidden">
                  <input value={amountInput} onChange={(e) => setAmountInput(e.target.value.replace(/[^0-9]/g,''))}
                         autoFocus placeholder="2000"
                         className="px-4 py-2 w-[140px] font-display text-[24px] font-extrabold tnum text-[var(--ink)] bg-white outline-none placeholder:text-[var(--muted-2)]" />
                  <span className="bg-[var(--surface-soft)] px-3 flex items-center text-[14px] font-bold text-[var(--muted)]">₽</span>
                </label>
                <div className="text-[11.5px] text-[var(--muted)] max-w-[220px]">
                  введите сумму, которую <b className="text-[var(--ink-2)]">даёт клиент</b> — посчитаем до какой даты можем продлить
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10.5px] uppercase tracking-wider font-bold text-[var(--muted-2)]">Хватит до</div>
                  <div className="font-display text-[20px] font-extrabold text-[var(--blue-700)] tnum">
                    {days > 0 ? fmtDDMMYYYY(newEnd) : '—'}
                  </div>
                  <div className="text-[10.5px] text-[var(--muted-2)]">{days > 0 ? `${days} ${days===1?'день':'дн'}` : 'недостаточно'}</div>
                </div>
              </div>
            )}
          </div>

          {/* ── STEP 3: equipment ──────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[var(--blue-600)] text-white text-[11px] font-bold">{isOverdue ? '3' : '2'}</span>
              <div className="uppercase-label">Экипировка на новый период</div>
              <span className="ml-auto text-[11px] text-[var(--muted)]">{equipDaily > 0 ? `+${equipDaily} ₽/сут` : 'бесплатно'}</span>
            </div>
            <DrawerEquipmentList items={equipment} onChange={setEquipment} />
          </div>
        </div>

        {/* ── PAYMENT FOOTER ──────────────────────────────────────── */}
        <div className="border-t border-[var(--border)] bg-[var(--surface-soft)] px-5 py-3">
          <div className="grid grid-cols-12 gap-4 items-end">
            <div className="col-span-7 flex flex-col gap-1 text-[11.5px]">
              {debtPortion > 0 && (
                <Row label={`Закрытие просрочки · ${rental.overdueDays} дн`} value={`${fmtMoney(debtPortion)} ₽`} tone="red" />
              )}
              {forgiveDebt && rental.debt > 0 && (
                <Row label="Просрочка прощена" value={`−${fmtMoney(rental.debt)} ₽`} tone="green" />
              )}
              {days > 0 && <Row label={`Аренда ${days} × ${rental.tariff.rate} ₽`} value={`${fmtMoney(rentSum)} ₽`} />}
              {equipSum > 0 && days > 0 && <Row label={`Экипировка ${days} × ${equipDaily} ₽`} value={`${fmtMoney(equipSum)} ₽`} />}
              {fromDeposit > 0 && <Row label="− С депозита клиента" value={`−${fmtMoney(fromDeposit)} ₽`} tone="green" />}
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input type="checkbox" checked={useDeposit} onChange={(e) => setUseDeposit(e.target.checked)}
                       disabled={depositAvail === 0}
                       className="h-3.5 w-3.5 accent-[var(--blue-600)]" />
                <span className="text-[11.5px] text-[var(--ink-2)]">Списать с депозита ({fmtMoney(depositAvail)} ₽)</span>
              </label>
            </div>
            <div className="col-span-5 text-right">
              <div className="uppercase-label">К приёму</div>
              <div className="font-display text-[30px] font-extrabold tnum text-[var(--ink)] leading-none mt-0.5">
                {fmtMoney(cashDue)} ₽
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <div className="flex bg-white rounded-full p-0.5 border border-[var(--border)]">
                  {['cash','transfer'].map(m => (
                    <button key={m} onClick={() => setMethod(m)}
                            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${method === m ? 'bg-[var(--blue-600)] text-white' : 'text-[var(--muted)]'}`}>
                      {m === 'cash' ? 'Наличные' : 'Перевод'}
                    </button>
                  ))}
                </div>
                <button onClick={onCancel} className="rounded-full px-3 py-2 text-[12.5px] font-semibold text-[var(--muted)] hover:text-[var(--ink-2)]">
                  Отмена
                </button>
                <button onClick={() => onConfirm({ days, equipment, method, useDeposit, cashDue, debtPortion, forgiveDebt, newEnd })}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--blue-600)] hover:bg-[var(--blue-700)] text-white px-4 py-2 text-[12.5px] font-bold disabled:opacity-50"
                        disabled={cashDue < 0 || (days === 0 && debtPortion === 0 && !forgiveDebt)}>
                  <I.Check size={14} /> {days > 0 && debtPortion > 0 ? 'Принять и продлить' : days > 0 ? 'Принять и продлить' : forgiveDebt ? 'Простить и закрыть' : 'Принять'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }) {
  const c = tone === 'red' ? 'text-[var(--red-ink)]' : tone === 'green' ? 'text-[var(--green-ink)]' : 'text-[var(--muted)]';
  const valC = tone === 'red' ? 'text-[var(--red-ink)]' : tone === 'green' ? 'text-[var(--green-ink)]' : 'text-[var(--ink-2)]';
  return (
    <div className="flex items-center justify-between">
      <span className={c}>{label}</span>
      <span className={`tnum font-semibold ${valC}`}>{value}</span>
    </div>
  );
}

function ModePill({ active, onClick, icon: IconC, label }) {
  return (
    <button onClick={onClick}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors
              ${active ? 'bg-white text-[var(--ink)] shadow-card-sm' : 'text-[var(--muted)] hover:text-[var(--ink-2)]'}`}>
      <IconC size={11} /> {label}
    </button>
  );
}

/* DrawerEquipmentList — chip row with inline swap/add (kept from v1) */
function DrawerEquipmentList({ items, onChange }) {
  const [pickerFor, setPickerFor] = React.useState(null);
  const triggerRefs = React.useRef({});

  const swap = (idx, newItem) => onChange(items.map((it, i) => i === idx ? { itemId: newItem.id, name: newItem.name, price: newItem.price, free: newItem.free } : it));
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add = (item) => onChange([...items, { itemId: item.id, name: item.name, price: item.price, free: item.free }]);

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-white p-2 flex flex-wrap gap-1.5 min-h-[64px]">
      {items.length === 0 && <div className="px-2 py-2 text-[11.5px] text-[var(--muted-2)]">Без экипировки</div>}
      {items.map((it, idx) => {
        const isOpen = pickerFor === idx;
        const ref = (triggerRefs.current[idx] ??= React.createRef());
        return (
          <div key={`${it.itemId}-${idx}`} className="relative">
            <button ref={ref} onClick={() => setPickerFor(isOpen ? null : idx)}
                    className={`inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-[11.5px] font-semibold border transition-colors
                      ${it.free ? 'bg-[var(--green-soft)] text-[var(--green-ink)] border-transparent' : 'bg-[var(--orange-soft)] text-[var(--orange-ink)] border-transparent'}
                      hover:ring-2 hover:ring-[var(--blue-100)]`}>
              {it.free ? <I.Helmet size={11} /> : <I.Shirt size={11} />}
              {it.name}
              {!it.free && <span className="tnum">·{it.price}₽</span>}
              <span className="ml-0.5 h-4 w-4 rounded-full bg-white/60 flex items-center justify-center"><I.Swap size={9} /></span>
            </button>
            {isOpen && (
              <Popover anchorRef={ref} onClose={() => setPickerFor(null)} width={300}>
                <EquipmentSwapPicker replacing={it} onSelect={(newItem) => swap(idx, newItem)} onRemove={() => remove(idx)} onClose={() => setPickerFor(null)} />
              </Popover>
            )}
          </div>
        );
      })}
      <div className="relative">
        <button ref={(triggerRefs.current['add'] ??= React.createRef())}
                onClick={() => setPickerFor(pickerFor === 'add' ? null : 'add')}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-[var(--blue-700)] border border-dashed border-[var(--blue-100)] hover:bg-[var(--blue-50)]">
          <I.Plus size={11} /> Добавить
        </button>
        {pickerFor === 'add' && (
          <Popover anchorRef={triggerRefs.current['add']} onClose={() => setPickerFor(null)} width={300}>
            <EquipmentAddPicker existingIds={items.map(i => i.itemId)} onAdd={add} onClose={() => setPickerFor(null)} />
          </Popover>
        )}
      </div>
    </div>
  );
}

/* AmountPreviewCalendar — visual preview of period bought by client's amount.
   Read-only mini-calendar: shows original rental days, debt days (red), and
   the new extension days highlighted in green up to `newEnd`. */
function AmountPreviewCalendar({ rental, newEnd, days, dailyTotal, debtPortion, amount }) {
  const today = TODAY;
  const isOverdue = rental.status === 'overdue' && rental.debt > 0;

  // Build a window that covers original start → newEnd (or +7 if nothing yet)
  const startDate = rental.startDate;
  const lastDate = days > 0 ? newEnd : addDays(rental.endDate, 7);
  const totalSpan = Math.max(14, diffDays(startDate, lastDate) + 2);

  const cells = [];
  for (let i = 0; i < totalSpan; i++) {
    const d = addDays(startDate, i);
    const inOriginal = diffDays(startDate, d) >= 0 && diffDays(d, rental.endDate) >= 0;
    const inOverdue  = isOverdue && diffDays(rental.endDate, d) > 0 && diffDays(d, today) >= 0;
    const inExtension = days > 0 && diffDays(today, d) > 0 && diffDays(d, newEnd) >= 0;
    const isToday = isSame(d, today);
    const isNewEnd = days > 0 && isSame(d, newEnd);
    const wd = toDate(d).getDay();
    cells.push({ d, inOriginal, inOverdue, inExtension, isToday, isNewEnd, wd });
  }

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-white overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)]/50">
        <div className="text-[10.5px] uppercase tracking-wider font-bold text-[var(--muted-2)]">Календарь продления</div>
        <div className="flex items-center gap-3 text-[10px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[var(--blue-100)] border border-[var(--blue-200)]"></span> Тек. период</span>
          {isOverdue && <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[var(--red-soft)] border border-[var(--red)]"></span> Просрочка</span>}
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-[var(--green-soft)] border border-[var(--green)]"></span> Продление</span>
        </div>
      </div>
      <div className="p-2.5">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(cells.length, 16)}, minmax(0, 1fr))` }}>
          {cells.slice(0, 16).map((c, i) => {
            let bg = 'transparent', border = 'var(--border)', ink = 'var(--muted-2)';
            if (c.inOriginal) { bg = 'var(--blue-50)'; border = 'var(--blue-100)'; ink = 'var(--blue-700)'; }
            if (c.inOverdue)  { bg = 'var(--red-soft)'; border = 'var(--red)'; ink = 'var(--red-ink)'; }
            if (c.inExtension){ bg = 'var(--green-soft)'; border = 'var(--green)'; ink = 'var(--green-ink)'; }
            return (
              <div key={i}
                   className={`relative rounded-[7px] py-1.5 text-center transition-all ${c.isNewEnd ? 'ring-2 ring-[var(--green)] ring-offset-1 scale-105' : ''}`}
                   style={{ background: bg, borderWidth: 1, borderStyle: 'solid', borderColor: border, color: ink }}>
                <div className="text-[9px] uppercase tracking-wider font-bold opacity-70">
                  {['вс','пн','вт','ср','чт','пт','сб'][c.wd]}
                </div>
                <div className="font-display text-[13px] font-extrabold tnum leading-none mt-0.5">{c.d.d}</div>
                {c.isToday && <div className="text-[8px] font-bold mt-0.5 opacity-80">сегодня</div>}
                {c.isNewEnd && <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1 rounded-full bg-[var(--green)] text-white text-[7.5px] font-bold uppercase tracking-wider">возврат</div>}
              </div>
            );
          })}
        </div>
        {days > 0 ? (
          <div className="mt-2.5 flex items-center justify-between rounded-[10px] bg-[var(--green-soft)] px-3 py-2 text-[11.5px]">
            <span className="text-[var(--green-ink)] font-semibold">
              {fmtMoney(amount)} ₽ {debtPortion > 0 ? <>− {fmtMoney(debtPortion)} ₽ долг = {fmtMoney(amount - debtPortion)} ₽ → </> : '→ '}
              <b className="tnum">{days} × {dailyTotal} ₽/сут</b> = до <b className="tnum">{fmtDDMMYYYY(newEnd)}</b>
            </span>
            <span className="font-display text-[14px] font-extrabold text-[var(--green-ink)] tnum">+{days} {days===1?'день':'дн'}</span>
          </div>
        ) : amount > 0 ? (
          <div className="mt-2.5 rounded-[10px] bg-[var(--red-soft)] px-3 py-2 text-[11.5px] text-[var(--red-ink)] font-semibold">
            Сумма {fmtMoney(amount)} ₽ покрывает только {debtPortion > 0 ? <>долг {fmtMoney(debtPortion)} ₽</> : <>часть дня</>} — продление не получится
          </div>
        ) : (
          <div className="mt-2.5 text-[11px] text-[var(--muted-2)] text-center">введите сумму, чтобы увидеть новый период</div>
        )}
      </div>
    </div>
  );
}

window.ExtensionDrawer = ExtensionDrawer;
window.DrawerEquipmentList = DrawerEquipmentList;
window.AmountPreviewCalendar = AmountPreviewCalendar;
