/* ClientHeaderCard v3 — only client info + overdue banner. KPIs and actions live in separate strip below. */

function ClientHeaderCard({ rental, onTopupDeposit, onOverduePopover, overdueRef }) {
  const c = rental.client;
  const isOverdue = rental.status === 'overdue';

  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] shadow-card-sm overflow-hidden h-full flex flex-col">
      {isOverdue && (
        <button onClick={onOverduePopover} ref={overdueRef}
                className="w-full bg-gradient-to-r from-[var(--red)] to-[#dc2626] text-white px-5 py-2.5 flex items-center gap-3 text-left hover:brightness-110 transition-all">
          <I.AlertTri size={16} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-bold text-[13px]">Просрочка {rental.overdueDays} {rental.overdueDays === 1 ? 'день' : rental.overdueDays < 5 ? 'дня' : 'дней'}</span>
            <span className="ml-2 opacity-90 text-[12px]">долг {fmtMoney(rental.debt)} ₽ · нажмите чтобы выбрать действие</span>
          </div>
          <span className="font-display tnum text-[16px] font-extrabold">{fmtMoney(rental.debt)} ₽</span>
        </button>
      )}

      <div className="p-5 flex gap-4 flex-1">
        {/* Photo placeholder */}
        <div className="w-[110px] shrink-0">
          <div className="aspect-[9/12] rounded-[14px] overflow-hidden flex flex-col border border-[var(--border)]"
               style={{ background: `linear-gradient(135deg, ${c.color}33, ${c.color}11)` }}>
            <div className="flex-1 flex items-center justify-center">
              <span className="font-display text-[40px] font-extrabold" style={{ color: c.color, opacity: 0.55 }}>
                {c.initials}
              </span>
            </div>
            <div className="px-2 py-1 text-center text-[9px] font-bold uppercase tracking-wider text-white"
                 style={{ background: c.color, opacity: 0.85 }}>
              фото клиента
            </div>
          </div>
        </div>

        {/* Identity + meta */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 text-[11.5px] uppercase tracking-wider font-bold text-[var(--muted-2)] tnum flex-wrap">
            Аренда · #{String(rental.id).padStart(4,'0')}
            <StatusPill status={rental.status} />
            <span className="inline-flex items-center gap-1 text-[var(--muted)] normal-case tracking-normal">
              <I.Star size={11} className="text-[var(--orange)]" /> <span className="tnum font-semibold text-[var(--ink-2)]">{c.rating}</span>
            </span>
          </div>
          <h1 className="mt-1 font-display text-[26px] leading-[1.1] font-extrabold text-[var(--ink)] tracking-tight">
            {c.name}
          </h1>

          <div className="mt-2.5 grid grid-cols-1 gap-y-1.5 text-[12.5px]">
            <Meta label="Дата рождения" value={c.dob} />
            <Meta label="Телефон">
              <a href={`tel:${c.phone.replace(/[^+0-9]/g,'')}`} className="tnum font-semibold text-[var(--ink-2)] hover:text-[var(--blue-700)]">{c.phone}</a>
            </Meta>
            <Meta label="Доп. телефон">
              <a href={`tel:${c.altPhone.replace(/[^+0-9]/g,'')}`} className="tnum font-semibold text-[var(--ink-2)] hover:text-[var(--blue-700)]">{c.altPhone}</a>
            </Meta>
            <Meta label="Адрес">
              <span className="text-[12px] leading-snug text-[var(--ink-2)] font-semibold">{c.address}</span>
            </Meta>
            <Meta label="Депозит клиента">
              <button onClick={onTopupDeposit} className="inline-flex items-center gap-1 font-display text-[14px] font-extrabold text-[var(--blue-700)] tnum hover:underline">
                {fmtMoney(c.depositBalance)} ₽ <I.Plus size={11} className="text-[var(--muted)]" />
              </button>
            </Meta>
          </div>

          <div className="mt-auto pt-3 border-t border-[var(--border)] flex items-center gap-1.5 flex-wrap">
            <button className="inline-flex items-center gap-1 rounded-full bg-white border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]">
              <I.External size={10} /> Профиль
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, children }) {
  return (
    <div className="min-w-0 flex items-baseline gap-2">
      <div className="text-[10.5px] text-[var(--muted)] uppercase tracking-wider font-bold w-[80px] shrink-0">{label}</div>
      <div className="min-w-0 truncate flex-1">
        {children || <span className="font-semibold text-[var(--ink-2)] tnum">{value}</span>}
      </div>
    </div>
  );
}

/* KPI strip — surfaced under the client/scooter row */
function KpiStrip({ rental, onAcceptPayment, onComplete, onMore }) {
  const isOverdue = rental.status === 'overdue';
  const daysToReturn = diffDays(TODAY, rental.endDate);
  return (
    <div className="rounded-2xl bg-white border border-[var(--border)] shadow-card-sm p-3 grid grid-cols-12 gap-3 items-stretch">
      <KpiTile label="Срок" value={isOverdue ? `−${rental.overdueDays} дн` : `${daysToReturn} дн`}
               hint={`${fmtDDMM(rental.startDate)} — ${fmtDDMM(rental.endDate)}`}
               tone={isOverdue ? 'red' : 'default'} />
      <KpiTile label="Эта аренда" value={`${fmtMoney(rental.thisRentalSum)} ₽`}
               hint={`Продлений: ${rental.extensions}`} />
      <KpiTile label="За всё время" value={`${fmtMoney(rental.lifetimeSum)} ₽`}
               hint="Сумма без залога" tone="blue" />
      <KpiTile label="Долг" value={`${fmtMoney(rental.debt)} ₽`}
               hint={rental.debt > 0 ? `${rental.overdueDays} дн просрочки` : 'нет долгов'}
               tone={rental.debt > 0 ? 'red' : 'default'} />
      <div className="col-span-12 md:col-span-4 flex flex-col gap-1.5 justify-center">
        <button onClick={onAcceptPayment}
                className={`group inline-flex items-center justify-between gap-2 rounded-[12px] px-4 py-2.5 text-[13px] font-bold transition-all
                  ${isOverdue
                    ? 'bg-[var(--red)] text-white hover:bg-[#b91c1c] shadow-card-sm'
                    : 'bg-[var(--blue-600)] text-white hover:bg-[var(--blue-700)] shadow-card-sm'}`}>
          <span className="flex items-center gap-2"><I.Wallet size={14} /> {isOverdue ? `Принять ${fmtMoney(rental.debt)} ₽` : 'Принять оплату'}</span>
          <span className="opacity-75 text-[11px] font-semibold">{isOverdue ? 'закрыть долг' : 'оплата / продление'}</span>
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={onComplete}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-[var(--ink)] text-white px-3 py-2 text-[12px] font-bold hover:bg-[var(--ink-2)]">
            <I.Forward size={12} /> Завершить
          </button>
          <button onClick={onMore}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-white border border-[var(--border)] text-[var(--ink-2)] px-3 py-2 text-[12px] font-semibold hover:bg-[var(--surface-soft)]">
            <I.More size={12} /> Ещё
          </button>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, hint, tone }) {
  const valC = tone === 'red' ? 'text-[var(--red-ink)]' : tone === 'blue' ? 'text-[var(--blue-700)]' : 'text-[var(--ink)]';
  return (
    <div className="col-span-6 md:col-span-2 rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2">
      <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-bold">{label}</div>
      <div className={`mt-0.5 font-display text-[20px] font-extrabold tnum leading-none ${valC}`}>{value}</div>
      <div className="text-[10px] text-[var(--muted-2)] mt-1">{hint}</div>
    </div>
  );
}

window.ClientHeaderCard = ClientHeaderCard;
window.KpiStrip = KpiStrip;
